"""
Train a CNN on sputum smear microscopy images to predict AFB (acid-fast bacilli) load.

The dataset is YOLO-formatted with one bounding box per visible TB bacillus
(class 0 == AFB / Mycobacterium tuberculosis rod). Per-image AFB count is
binned into a clinical-style load grade:

    none      : 0 AFB visible
    low       : 1-4 AFB
    moderate  : 5-14 AFB
    high      : 15+ AFB

This is a research / screening proxy for the WHO/IUATLD AFB grading scale,
NOT a certified TB diagnosis. Use alongside microbiology / GeneXpert results.
"""
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.models import ResNet18_Weights, resnet18


LOAD_BINS: list[tuple[str, int, int | None]] = [
    ("none", 0, 0),
    ("low", 1, 4),
    ("moderate", 5, 14),
    ("high", 15, None),
]
LOAD_LABELS: list[str] = [name for name, _, _ in LOAD_BINS]

BINARY_LABELS: list[str] = ["afb_negative", "afb_positive"]


def afb_binary_label(count: int) -> str:
    return "afb_positive" if count > 0 else "afb_negative"


def afb_load_label(count: int) -> str:
    for name, lo, hi in LOAD_BINS:
        if count >= lo and (hi is None or count <= hi):
            return name
    return LOAD_LABELS[-1]


@dataclass(frozen=True)
class Config:
    seed: int = 1337
    img_size: int = 224
    batch_size: int = 32
    epochs: int = 30
    lr: float = 1e-3
    weight_decay: float = 1e-4
    num_workers: int = 0
    augment: bool = True
    backbone: str = "resnet18"  # small_cnn | resnet18
    class_weight: bool = True
    task: str = "binary"  # binary | load4


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def count_boxes(label_path: Path) -> int:
    if not label_path.exists():
        return 0
    n = 0
    with label_path.open("r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                _ = float(parts[1])
            except ValueError:
                continue
            n += 1
    return n


def collect_split(
    images_dir: Path, labels_dir: Path
) -> list[tuple[Path, int]]:
    items: list[tuple[Path, int]] = []
    for img in sorted(images_dir.iterdir()):
        if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}:
            continue
        lbl = labels_dir / (img.stem + ".txt")
        items.append((img, count_boxes(lbl)))
    return items


def items_to_xy(
    items: list[tuple[Path, int]],
    label_to_idx: dict[str, int],
    *,
    task: str = "load4",
) -> list[tuple[Path, int, int]]:
    label_fn = afb_binary_label if task == "binary" else afb_load_label
    return [(p, c, label_to_idx[label_fn(c)]) for p, c in items]


class PhlegmAFBDataset(Dataset):
    def __init__(
        self,
        items: list[tuple[Path, int, int]],
        transform_img: Any,
        transform_aug: Any | None,
        train: bool,
    ) -> None:
        self.items = items
        self.transform_img = transform_img
        self.transform_aug = transform_aug
        self.train = train

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        path, _, y = self.items[idx]
        img = Image.open(path).convert("RGB")
        if self.train and self.transform_aug is not None:
            x = self.transform_aug(img)
        else:
            x = self.transform_img(img)
        return x, y


class SmallPhlegmCNN(nn.Module):
    def __init__(self, num_classes: int) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, 3, padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, 3, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(128, 192, 3, padding=1, bias=False),
            nn.BatchNorm2d(192),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d(1),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.4),
            nn.Linear(192, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(x))


def make_model(num_classes: int, backbone: str) -> nn.Module:
    if backbone == "small_cnn":
        return SmallPhlegmCNN(num_classes)
    if backbone == "resnet18":
        m = resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)
        m.fc = nn.Linear(m.fc.in_features, num_classes)
        return m
    raise ValueError(f"Unknown backbone {backbone!r}")


@torch.no_grad()
def evaluate(
    model: nn.Module, loader: DataLoader, device: torch.device
) -> tuple[float, np.ndarray, np.ndarray]:
    model.eval()
    ys: list[int] = []
    ps: list[int] = []
    for x, y in loader:
        x = x.to(device)
        logits = model(x)
        pred = logits.argmax(dim=1).cpu().numpy().tolist()
        ys.extend(y.numpy().tolist())
        ps.extend(pred)
    y_arr = np.array(ys)
    p_arr = np.array(ps)
    acc = float((y_arr == p_arr).mean()) if len(y_arr) else 0.0
    return acc, y_arr, p_arr


@torch.no_grad()
def collect_probs(
    model: nn.Module, loader: DataLoader, device: torch.device
) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    ys: list[int] = []
    probs: list[list[float]] = []
    for x, y in loader:
        x = x.to(device)
        logits = model(x)
        p = torch.softmax(logits, dim=1).cpu().numpy()
        ys.extend(y.numpy().tolist())
        probs.extend(p.tolist())
    return np.array(ys), np.array(probs)


def tune_decision_threshold(
    y_true: np.ndarray,
    probs: np.ndarray,
    positive_idx: int,
) -> tuple[float, float]:
    """Pick threshold on positive-class probability maximizing val macro-F1."""
    pos_p = probs[:, positive_idx]
    best_thr = 0.5
    best_f1 = -1.0
    for thr in np.linspace(0.05, 0.95, 19):
        pred = (pos_p >= thr).astype(int)
        f1 = float(f1_score(y_true, pred, average="macro", zero_division=0))
        if f1 > best_f1:
            best_f1 = f1
            best_thr = float(thr)
    return best_thr, best_f1


def predict_with_threshold(y_probs: np.ndarray, positive_idx: int, threshold: float) -> np.ndarray:
    return (y_probs[:, positive_idx] >= threshold).astype(int)


def checkpoint_payload(
    model: nn.Module,
    *,
    label_to_idx: dict[str, int],
    cfg: Config,
    task: str,
    decision_threshold: float,
    class_names: list[str],
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model_state": model.state_dict(),
        "label_map": label_to_idx,
        "backbone": cfg.backbone,
        "img_size": cfg.img_size,
        "task": task,
        "decision_threshold": decision_threshold,
        "class_names": class_names,
    }
    if task == "load4":
        payload["load_bins"] = [{"name": n, "min": lo, "max": hi} for n, lo, hi in LOAD_BINS]
    return payload


def class_weights(items: list[tuple[Path, int, int]], num_classes: int) -> torch.Tensor:
    counts = np.zeros(num_classes, dtype=np.float64)
    for _, _, y in items:
        counts[y] += 1.0
    counts = np.maximum(counts, 1.0)
    w = counts.sum() / (num_classes * counts)
    return torch.tensor(w, dtype=torch.float32)


def main() -> None:
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="Sputum AFB-load CNN classifier")
    p.add_argument(
        "--dataset",
        type=Path,
        default=here / "Raw_Sputum_Microscopy_Dataset",
        help="Folder containing images/{train,val,test} and labels/{train,val,test}",
    )
    p.add_argument("--out-dir", type=Path, default=None)
    p.add_argument("--epochs", type=int, default=None)
    p.add_argument("--batch-size", type=int, default=None)
    p.add_argument("--lr", type=float, default=None)
    p.add_argument("--img-size", type=int, default=None)
    p.add_argument("--backbone", choices=("small_cnn", "resnet18"), default=None)
    p.add_argument("--task", choices=("binary", "load4"), default=None, help="binary AFB detected vs 4-class load")
    p.add_argument("--no-augment", action="store_true")
    p.add_argument("--no-class-weight", action="store_true")
    args = p.parse_args()

    cfg = Config()
    if args.epochs is not None:
        cfg = dataclasses.replace(cfg, epochs=args.epochs)
    if args.batch_size is not None:
        cfg = dataclasses.replace(cfg, batch_size=args.batch_size)
    if args.lr is not None:
        cfg = dataclasses.replace(cfg, lr=args.lr)
    if args.img_size is not None:
        cfg = dataclasses.replace(cfg, img_size=args.img_size)
    if args.backbone is not None:
        cfg = dataclasses.replace(cfg, backbone=args.backbone)
    if args.task is not None:
        cfg = dataclasses.replace(cfg, task=args.task)
    if args.no_augment:
        cfg = dataclasses.replace(cfg, augment=False)
    if args.no_class_weight:
        cfg = dataclasses.replace(cfg, class_weight=False)

    set_seed(cfg.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    images_root = args.dataset / "images"
    labels_root = args.dataset / "labels"
    splits: dict[str, list[tuple[Path, int]]] = {}
    for s in ("train", "val", "test"):
        idir = images_root / s
        ldir = labels_root / s
        if not idir.exists() or not ldir.exists():
            raise FileNotFoundError(f"Missing split folder: {idir} or {ldir}")
        splits[s] = collect_split(idir, ldir)

    task = cfg.task
    class_names = BINARY_LABELS if task == "binary" else LOAD_LABELS
    label_to_idx = {name: i for i, name in enumerate(class_names)}
    train_items = items_to_xy(splits["train"], label_to_idx, task=task)
    val_items = items_to_xy(splits["val"], label_to_idx, task=task)
    test_items = items_to_xy(splits["test"], label_to_idx, task=task)

    norm = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    base_tf = transforms.Compose(
        [transforms.Resize((cfg.img_size, cfg.img_size)), transforms.ToTensor(), norm]
    )
    aug_tf = transforms.Compose(
        [
            transforms.RandomResizedCrop(cfg.img_size, scale=(0.85, 1.0), ratio=(0.9, 1.1)),
            transforms.RandomHorizontalFlip(0.5),
            transforms.RandomVerticalFlip(0.5),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, hue=0.03),
            transforms.ToTensor(),
            norm,
        ]
    )

    train_ds = PhlegmAFBDataset(train_items, base_tf, aug_tf if cfg.augment else None, train=True)
    val_ds = PhlegmAFBDataset(val_items, base_tf, None, train=False)
    test_ds = PhlegmAFBDataset(test_items, base_tf, None, train=False)

    pin = device.type == "cuda"
    train_loader = DataLoader(train_ds, batch_size=cfg.batch_size, shuffle=True, num_workers=cfg.num_workers, pin_memory=pin)
    val_loader = DataLoader(val_ds, batch_size=cfg.batch_size, shuffle=False, num_workers=cfg.num_workers, pin_memory=pin)
    test_loader = DataLoader(test_ds, batch_size=cfg.batch_size, shuffle=False, num_workers=cfg.num_workers, pin_memory=pin)

    num_classes = len(class_names)
    model = make_model(num_classes, cfg.backbone).to(device)

    crit: nn.Module = (
        nn.CrossEntropyLoss(weight=class_weights(train_items, num_classes).to(device))
        if cfg.class_weight
        else nn.CrossEntropyLoss()
    )
    optim = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(optim, T_max=max(1, cfg.epochs))

    out_dir = args.out_dir
    if out_dir is None:
        stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
        prefix = "phlegm_afb_binary" if task == "binary" else "phlegm_afb"
        out_dir = here / "runs" / f"{prefix}_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    distribution = {
        s: {name: 0 for name in class_names}
        for s in ("train", "val", "test")
    }
    for s, xs in (("train", train_items), ("val", val_items), ("test", test_items)):
        for _, _, y in xs:
            distribution[s][class_names[y]] += 1

    cfg_dump = {
        **dataclasses.asdict(cfg),
        "dataset": str(args.dataset),
        "labels": class_names,
        "distribution": distribution,
        "device": str(device),
    }
    if task == "load4":
        cfg_dump["load_bins"] = [{"name": n, "min": lo, "max": hi} for n, lo, hi in LOAD_BINS]
    (out_dir / "config.json").write_text(json.dumps(cfg_dump, indent=2), encoding="utf-8")
    (out_dir / "label_map.json").write_text(json.dumps(label_to_idx, indent=2), encoding="utf-8")

    best_val_f1 = -1.0
    best_path = out_dir / "model_best.pt"
    positive_idx = label_to_idx.get("afb_positive", label_to_idx.get("high", num_classes - 1))
    for epoch in range(1, cfg.epochs + 1):
        model.train()
        losses: list[float] = []
        for x, y in train_loader:
            x = x.to(device)
            y = y.to(device)
            optim.zero_grad(set_to_none=True)
            logits = model(x)
            loss = crit(logits, y)
            loss.backward()
            optim.step()
            losses.append(float(loss.detach().cpu()))
        sched.step()

        val_acc, y_val, p_val = evaluate(model, val_loader, device)
        val_f1 = float(f1_score(y_val, p_val, average="macro", zero_division=0))
        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            if task == "binary":
                y_val_probs, val_probs = collect_probs(model, val_loader, device)
                decision_threshold, _ = tune_decision_threshold(y_val_probs, val_probs, positive_idx)
            else:
                decision_threshold = 0.5
            torch.save(
                checkpoint_payload(
                    model,
                    label_to_idx=label_to_idx,
                    cfg=cfg,
                    task=task,
                    decision_threshold=decision_threshold,
                    class_names=class_names,
                ),
                best_path,
            )
        print(
            f"epoch {epoch:03d}/{cfg.epochs}  train_loss={float(np.mean(losses)):.4f}  "
            f"val_acc={val_acc:.4f}  val_macro_f1={val_f1:.4f}  best_val_macro_f1={best_val_f1:.4f}",
            flush=True,
        )

    ck = torch.load(best_path, map_location=device, weights_only=False)
    model.load_state_dict(ck["model_state"])
    decision_threshold = float(ck.get("decision_threshold", 0.5))
    y_val_probs, val_probs = collect_probs(model, val_loader, device)
    if task == "binary":
        y_t_probs, test_probs = collect_probs(model, test_loader, device)
        p_t = predict_with_threshold(test_probs, positive_idx, decision_threshold)
        y_t = y_t_probs
    else:
        test_acc_tmp, y_t, p_t = evaluate(model, test_loader, device)
        _ = test_acc_tmp
    test_acc = float((y_t == p_t).mean()) if len(y_t) else 0.0
    macro_f1 = float(f1_score(y_t, p_t, average="macro", zero_division=0))
    cm = confusion_matrix(y_t, p_t)
    metrics: dict[str, Any] = {
        "task": task,
        "best_val_macro_f1": best_val_f1,
        "decision_threshold": decision_threshold,
        "test_acc": test_acc,
        "test_macro_f1": macro_f1,
        "confusion_matrix": cm.tolist(),
        "classification_report": classification_report(
            y_t, p_t, target_names=class_names, zero_division=0
        ),
    }
    if task == "binary" and cm.size == 4:
        tn, fp, fn, tp = cm.ravel()
        metrics["sensitivity"] = float(tp / (tp + fn)) if (tp + fn) else 0.0
        metrics["specificity"] = float(tn / (tn + fp)) if (tn + fp) else 0.0
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    torch.save(
        checkpoint_payload(
            model,
            label_to_idx=label_to_idx,
            cfg=cfg,
            task=task,
            decision_threshold=decision_threshold,
            class_names=class_names,
        ),
        out_dir / "model_last.pt",
    )

    print(
        f"\nDone. best_val_macro_f1={best_val_f1:.4f}  test_acc={test_acc:.4f}  "
        f"test_macro_f1={macro_f1:.4f}  threshold={decision_threshold:.3f}"
    )
    print(f"Artifacts: {out_dir}")


if __name__ == "__main__":
    main()
