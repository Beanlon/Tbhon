from __future__ import annotations

import argparse
import csv
import dataclasses
import datetime as dt
import json
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchaudio
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

import kagglehub


@dataclass(frozen=True)
class Config:
    dataset_slug: str = "ruchikashirsath/tb-audio"
    fold: int = 0
    seed: int = 1337

    sample_rate: int = 16000
    clip_seconds: float = 6.0   # matches 3-10s app recordings better
    n_mels: int = 128            # finer frequency resolution for TB patterns
    n_fft: int = 1024
    hop_length: int = 256
    f_min: int = 20
    f_max: int = 8000

    batch_size: int = 32
    epochs: int = 30
    lr: float = 3e-4
    weight_decay: float = 1e-4
    num_workers: int = 0  # windows default; bump if stable

    augment: bool = True
    time_shift_max: float = 0.20  # fraction of samples
    noise_std: float = 0.005       # Gaussian noise amplitude
    # SpecAugment: number of time/freq masks (0 = off)
    spec_time_masks: int = 2
    spec_freq_masks: int = 2
    spec_time_mask_param: int = 30   # max consecutive time steps masked
    spec_freq_mask_param: int = 16   # max consecutive mel bins masked


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def download_dataset_root(cfg: Config) -> Path:
    p = Path(kagglehub.dataset_download(cfg.dataset_slug))
    # Observed structure: <cache>/<slug>/versions/1/Tuberculosis/...
    tb_root = p / "Tuberculosis"
    if not tb_root.exists():
        raise FileNotFoundError(f"Expected dataset root 'Tuberculosis' under {p}")
    return tb_root


def read_split_csv(path: Path) -> list[tuple[str, int]]:
    rows: list[tuple[str, int]] = []
    with path.open(newline="", encoding="utf-8", errors="ignore") as fh:
        r = csv.DictReader(fh)
        for row in r:
            fn = (row.get("filename") or "").strip()
            y = int((row.get("tb_status") or "0").strip())
            if fn:
                rows.append((fn, y))
    if not rows:
        raise ValueError(f"No rows parsed from {path}")
    return rows


def index_audio_files(raw_data_dir: Path) -> dict[str, Path]:
    """
    Build filename -> path index across raw_data.
    If duplicates exist, we keep the first encountered and warn later via counts.
    """
    idx: dict[str, Path] = {}
    dup = 0
    for wav in raw_data_dir.rglob("*.wav"):
        name = wav.name
        if name in idx:
            dup += 1
            continue
        idx[name] = wav
    if len(idx) == 0:
        raise FileNotFoundError(f"No .wav files found under {raw_data_dir}")
    if dup:
        print(f"[warn] duplicate filenames encountered: {dup} (kept first occurrence)")
    return idx


class TbCoughDataset(torch.utils.data.Dataset):
    def __init__(
        self,
        items: list[tuple[Path, int]],
        cfg: Config,
        train: bool,
        mel_transform: nn.Module,
        amp_to_db: nn.Module,
    ) -> None:
        self.items = items
        self.cfg = cfg
        self.train = train
        self.mel_transform = mel_transform
        self.amp_to_db = amp_to_db

        self.target_len = int(cfg.sample_rate * cfg.clip_seconds)

    def __len__(self) -> int:
        return len(self.items)

    def _load_audio(self, path: Path) -> torch.Tensor:
        # torchaudio.load can require extra optional deps on Windows (e.g., torchcodec).
        # This dataset is .wav, so scipy's wav reader is a reliable fallback.
        from scipy.io import wavfile

        sr, data = wavfile.read(path)

        # data can be int16/int32/uint8 or float; shape can be [T] or [T, C]
        if hasattr(data, "ndim") and data.ndim == 2:
            data = data.mean(axis=1)

        x = torch.from_numpy(np.asarray(data))
        if not torch.is_floating_point(x):
            # normalize common PCM integer ranges to [-1, 1]
            if x.dtype == torch.uint8:
                x = (x.to(torch.float32) - 128.0) / 128.0
            else:
                max_val = float(torch.iinfo(x.dtype).max)
                x = x.to(torch.float32) / max_val
        else:
            x = x.to(torch.float32)

        wav = x.unsqueeze(0)  # [1, T]
        if int(sr) != self.cfg.sample_rate:
            wav = torchaudio.functional.resample(wav, int(sr), self.cfg.sample_rate)
        return wav.squeeze(0)  # [T]

    def _fix_length(self, x: torch.Tensor) -> torch.Tensor:
        if x.numel() == self.target_len:
            return x
        if x.numel() > self.target_len:
            start = 0
            if self.train:
                start = int(torch.randint(0, x.numel() - self.target_len + 1, (1,)).item())
            return x[start : start + self.target_len]
        pad = self.target_len - x.numel()
        return F.pad(x, (0, pad))

    def _augment_waveform(self, x: torch.Tensor) -> torch.Tensor:
        if not (self.train and self.cfg.augment):
            return x

        # time shift
        max_shift = int(self.cfg.time_shift_max * x.numel())
        if max_shift > 0:
            shift = int(torch.randint(-max_shift, max_shift + 1, (1,)).item())
            x = torch.roll(x, shifts=shift)

        # additive Gaussian noise
        if self.cfg.noise_std > 0:
            x = x + torch.randn_like(x) * self.cfg.noise_std

        return x

    def _augment_spectrogram(self, mel_db: torch.Tensor) -> torch.Tensor:
        """Apply SpecAugment (frequency + time masking) on [n_mels, time] tensor."""
        if not (self.train and self.cfg.augment):
            return mel_db

        n_mels, time_steps = mel_db.shape
        result = mel_db.clone()
        mean_val = float(mel_db.mean().item())

        # frequency masking
        for _ in range(self.cfg.spec_freq_masks):
            f = int(torch.randint(0, self.cfg.spec_freq_mask_param + 1, (1,)).item())
            f0 = int(torch.randint(0, max(1, n_mels - f), (1,)).item())
            result[f0 : f0 + f, :] = mean_val

        # time masking
        for _ in range(self.cfg.spec_time_masks):
            t = int(torch.randint(0, self.cfg.spec_time_mask_param + 1, (1,)).item())
            t0 = int(torch.randint(0, max(1, time_steps - t), (1,)).item())
            result[:, t0 : t0 + t] = mean_val

        return result

    def __getitem__(self, i: int) -> tuple[torch.Tensor, torch.Tensor]:
        path, y = self.items[i]
        wav = self._load_audio(path)
        wav = self._fix_length(wav)
        wav = self._augment_waveform(wav)

        # log-mel: [n_mels, time]
        mel = self.mel_transform(wav)
        mel_db = self.amp_to_db(mel)
        mel_db = self._augment_spectrogram(mel_db)

        # per-sample standardization for stability
        mel_db = (mel_db - mel_db.mean()) / (mel_db.std() + 1e-6)

        x = mel_db.unsqueeze(0)  # [1, n_mels, time]
        return x, torch.tensor(y, dtype=torch.long)


class ResBlock(nn.Module):
    """Mini residual block: 2x Conv3x3 with skip connection."""
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(channels, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.relu(x + self.block(x))


class SmallAudioCNN(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            # Stem
            nn.Conv2d(1, 32, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),           # /2
            ResBlock(32),
            # Stage 2
            nn.Conv2d(32, 64, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),           # /4
            ResBlock(64),
            # Stage 3
            nn.Conv2d(64, 128, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),           # /8
            ResBlock(128),
            nn.AdaptiveAvgPool2d((4, 4)),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 4 * 4, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.4),
            nn.Linear(256, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(64, 2),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        return self.classifier(x)


@torch.no_grad()
def evaluate(model: nn.Module, loader: torch.utils.data.DataLoader, device: torch.device) -> dict:
    model.eval()
    ys: list[int] = []
    ps: list[int] = []
    for xb, yb in loader:
        xb = xb.to(device)
        logits = model(xb)
        pred = logits.argmax(dim=1).cpu().numpy().tolist()
        ys.extend(yb.numpy().tolist())
        ps.extend(pred)

    acc = float(accuracy_score(ys, ps))
    f1 = float(f1_score(ys, ps, average="macro"))
    cm = confusion_matrix(ys, ps).tolist()
    report = classification_report(ys, ps, digits=4)
    return {"accuracy": acc, "f1_macro": f1, "confusion_matrix": cm, "classification_report": report}


def save_confusion_matrix_png(cm: list[list[int]], out_path: Path, class_names: list[str]) -> None:
    import matplotlib.pyplot as plt

    arr = np.array(cm, dtype=np.int64)
    fig = plt.figure(figsize=(4.5, 4.0))
    ax = fig.add_subplot(1, 1, 1)
    im = ax.imshow(arr, interpolation="nearest", cmap="Blues")
    fig.colorbar(im, ax=ax)
    ax.set(
        xticks=np.arange(len(class_names)),
        yticks=np.arange(len(class_names)),
        xticklabels=class_names,
        yticklabels=class_names,
        ylabel="True",
        xlabel="Pred",
        title="Confusion Matrix",
    )
    thresh = arr.max() / 2.0 if arr.size else 0.0
    for i in range(arr.shape[0]):
        for j in range(arr.shape[1]):
            ax.text(j, i, format(arr[i, j], "d"), ha="center", va="center", color="white" if arr[i, j] > thresh else "black")
    fig.tight_layout()
    fig.savefig(out_path, dpi=180)
    plt.close(fig)


def make_run_dir() -> Path:
    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    out = Path(__file__).resolve().parent / "runs" / ts
    out.mkdir(parents=True, exist_ok=True)
    return out


def compute_class_weights(labels: Iterable[int]) -> torch.Tensor:
    counts = np.bincount(np.array(list(labels), dtype=np.int64), minlength=2).astype(np.float64)
    counts = np.maximum(counts, 1.0)
    inv = 1.0 / counts
    w = inv / inv.sum() * 2.0
    return torch.tensor(w, dtype=torch.float32)


def train(cfg: Config) -> None:
    set_seed(cfg.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    tb_root = download_dataset_root(cfg)
    meta_dir = tb_root / "metadata"
    raw_dir = tb_root / "raw_data"

    train_csv = meta_dir / f"X_train_Fold_{cfg.fold}.csv"
    test_csv = meta_dir / f"X_test_Fold_{cfg.fold}.csv"
    if not train_csv.exists() or not test_csv.exists():
        raise FileNotFoundError(f"Missing fold CSVs: {train_csv} or {test_csv}")

    train_rows = read_split_csv(train_csv)
    test_rows = read_split_csv(test_csv)

    audio_index = index_audio_files(raw_dir)

    def resolve(rows: list[tuple[str, int]]) -> list[tuple[Path, int]]:
        missing = 0
        out: list[tuple[Path, int]] = []
        for fn, y in rows:
            p = audio_index.get(fn)
            if p is None:
                missing += 1
                continue
            out.append((p, y))
        if missing:
            print(f"[warn] missing audio files for {missing} rows (skipped)")
        if not out:
            raise ValueError("Resolved 0 audio files; cannot train.")
        return out

    train_items = resolve(train_rows)
    test_items = resolve(test_rows)

    mel_transform = torchaudio.transforms.MelSpectrogram(
        sample_rate=cfg.sample_rate,
        n_fft=cfg.n_fft,
        hop_length=cfg.hop_length,
        f_min=cfg.f_min,
        f_max=cfg.f_max,
        n_mels=cfg.n_mels,
        power=2.0,
    )
    amp_to_db = torchaudio.transforms.AmplitudeToDB(stype="power")

    train_ds = TbCoughDataset(train_items, cfg, train=True, mel_transform=mel_transform, amp_to_db=amp_to_db)
    test_ds = TbCoughDataset(test_items, cfg, train=False, mel_transform=mel_transform, amp_to_db=amp_to_db)

    train_loader = torch.utils.data.DataLoader(
        train_ds,
        batch_size=cfg.batch_size,
        shuffle=True,
        num_workers=cfg.num_workers,
        pin_memory=torch.cuda.is_available(),
    )
    test_loader = torch.utils.data.DataLoader(
        test_ds,
        batch_size=cfg.batch_size,
        shuffle=False,
        num_workers=cfg.num_workers,
        pin_memory=torch.cuda.is_available(),
    )

    model = SmallAudioCNN().to(device)

    class_w = compute_class_weights([y for _, y in train_items]).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_w)
    opt = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=cfg.epochs, eta_min=1e-6)

    run_dir = make_run_dir()
    (run_dir / "config.json").write_text(json.dumps(dataclasses.asdict(cfg), indent=2), encoding="utf-8")
    print(f"Run dir: {run_dir}")
    print(f"Train samples: {len(train_items)}  |  Test samples: {len(test_items)}")
    print(f"Using device: {device}")

    best_f1 = -1.0
    best_path = run_dir / "model.pt"

    for epoch in range(1, cfg.epochs + 1):
        model.train()
        losses: list[float] = []
        for xb, yb in train_loader:
            xb = xb.to(device)
            yb = yb.to(device)
            opt.zero_grad(set_to_none=True)
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            opt.step()
            losses.append(float(loss.detach().cpu().item()))

        scheduler.step()
        metrics = evaluate(model, test_loader, device)
        mean_loss = float(np.mean(losses)) if losses else 0.0
        print(
            f"epoch {epoch:02d}/{cfg.epochs} loss={mean_loss:.4f} "
            f"val_acc={metrics['accuracy']:.4f} val_f1={metrics['f1_macro']:.4f}  "
            f"lr={scheduler.get_last_lr()[0]:.2e}",
            flush=True,
        )

        if metrics["f1_macro"] > best_f1:
            best_f1 = metrics["f1_macro"]
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "config": dataclasses.asdict(cfg),
                    "best_f1_macro": best_f1,
                },
                best_path,
            )
            print(f"  -> new best F1: {best_f1:.4f} (saved)", flush=True)

    final_metrics = evaluate(model, test_loader, device)
    (run_dir / "metrics.json").write_text(
        json.dumps(
            {
                "best_f1_macro": best_f1,
                "final": {k: v for k, v in final_metrics.items() if k != "classification_report"},
                "classification_report": final_metrics["classification_report"],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    save_confusion_matrix_png(final_metrics["confusion_matrix"], run_dir / "confusion_matrix.png", ["No-TB", "TB"])

    print(f"\nSaved run to: {run_dir}")
    print(f"Best checkpoint: {best_path}")


@torch.no_grad()
def predict_one(audio_path: Path, model_path: Path) -> None:
    ckpt = torch.load(model_path, map_location="cpu")
    cfg = Config(**ckpt.get("config", {}))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    mel_transform = torchaudio.transforms.MelSpectrogram(
        sample_rate=cfg.sample_rate,
        n_fft=cfg.n_fft,
        hop_length=cfg.hop_length,
        f_min=cfg.f_min,
        f_max=cfg.f_max,
        n_mels=cfg.n_mels,
        power=2.0,
    )
    amp_to_db = torchaudio.transforms.AmplitudeToDB(stype="power")

    ds = TbCoughDataset([(audio_path, 0)], cfg, train=False, mel_transform=mel_transform, amp_to_db=amp_to_db)
    x, _ = ds[0]
    x = x.unsqueeze(0).to(device)

    model = SmallAudioCNN().to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    logits = model(x)
    prob = torch.softmax(logits, dim=1).detach().cpu().numpy()[0]
    pred = int(prob.argmax())
    label = "TB" if pred == 1 else "No-TB"
    print(f"Prediction: {label}")
    print(f"Probabilities: No-TB={prob[0]:.4f}, TB={prob[1]:.4f}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--fold", type=int, default=0)
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--seed", type=int, default=1337)
    p.add_argument("--no-augment", action="store_true")
    p.add_argument("--num-workers", type=int, default=0)
    p.add_argument("--n-mels", type=int, default=128)
    p.add_argument("--clip-seconds", type=float, default=6.0)

    p.add_argument("--predict", type=str, default=None, help="Path to a .wav file to run inference on.")
    p.add_argument("--model", type=str, default=None, help="Path to a saved model.pt (required for --predict).")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    cfg = Config(
        fold=int(args.fold),
        seed=int(args.seed),
        epochs=int(args.epochs),
        batch_size=int(args.batch_size),
        lr=float(args.lr),
        augment=not bool(args.no_augment),
        num_workers=int(args.num_workers),
        n_mels=int(args.n_mels),
        clip_seconds=float(args.clip_seconds),
    )

    if args.predict:
        if not args.model:
            raise SystemExit("--model is required when using --predict")
        predict_one(Path(args.predict), Path(args.model))
        return

    train(cfg)


if __name__ == "__main__":
    main()

