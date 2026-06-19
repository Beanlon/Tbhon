"""Hybrid TB cough classifier: CNN + gradient-boosted audio features.

Targets higher accuracy via model stacking on the Kaggle tb-audio dataset.
"""
from __future__ import annotations

import argparse
import csv
import dataclasses
import datetime as dt
import json
import pickle
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torchaudio
from scipy.io import wavfile
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import sys

_ML = Path(__file__).resolve().parent
if str(_ML) not in sys.path:
    sys.path.insert(0, str(_ML))

from audio_crop import fix_length
from model_arch import build_model, load_model_from_state
from train_tb_cough_cnn import (
    Config as CnnConfig,
    TbCoughDataset,
    compute_class_weights,
    download_dataset_root,
    evaluate,
    index_audio_files,
    make_run_dir,
    read_split_csv,
    save_confusion_matrix_png,
    set_seed,
    sweep_threshold,
)


@dataclass(frozen=True)
class HybridConfig:
    dataset_slug: str = "ruchikashirsath/tb-audio"
    fold: int = 0
    seed: int = 1337
    sample_rate: int = 16000
    clip_seconds: float = 4.0
    n_mels: int = 64
    cnn_epochs: int = 25
    cnn_batch_size: int = 32
    cnn_lr: float = 3e-4
    gbm_n_estimators: int = 600
    val_fraction: float = 0.12
    legacy_arch: bool = True
    spec_time_masks: int = 2
    spec_freq_masks: int = 2
    codec_aug_prob: float = 0.35
    reverb_aug_prob: float = 0.20


def extract_gbm_features(path: Path, cfg: HybridConfig) -> np.ndarray:
    sr, data = wavfile.read(path)
    x = torch.from_numpy(np.asarray(data, dtype=np.float32))
    if x.ndim == 2:
        x = x.mean(dim=1)
    peak = float(x.abs().max()) or 1.0
    x = x / peak
    if int(sr) != cfg.sample_rate:
        x = torchaudio.functional.resample(x.unsqueeze(0), int(sr), cfg.sample_rate).squeeze(0)
    x = fix_length(x, int(cfg.sample_rate * cfg.clip_seconds), train=False)
    arr = x.numpy()
    rms = float(np.sqrt(np.mean(arr**2)))
    zcr = float(np.mean(np.abs(np.diff(np.sign(arr))))) / 2.0

    mfcc_t = torchaudio.transforms.MFCC(
        sample_rate=cfg.sample_rate,
        n_mfcc=40,
        melkwargs={"n_fft": 1024, "hop_length": 256, "n_mels": 128},
    )
    mfcc = mfcc_t(x)
    delta = torchaudio.functional.compute_deltas(mfcc)
    delta2 = torchaudio.functional.compute_deltas(delta)

    mel = torchaudio.transforms.MelSpectrogram(
        sample_rate=cfg.sample_rate, n_fft=1024, hop_length=256, n_mels=64
    )(x)
    mel_db = torchaudio.transforms.AmplitudeToDB()(mel)

    parts = []
    for t in (mfcc, delta, delta2, mel_db):
        parts.append(t.mean(dim=1).numpy())
        parts.append(t.std(dim=1).numpy())
        parts.append(t.amax(dim=1).cpu().numpy())
    parts.append(np.array([rms, zcr, float(arr.std()), float(np.percentile(np.abs(arr), 95))], dtype=np.float32))
    return np.concatenate(parts).astype(np.float32)


def build_feature_matrix(items: list[tuple[Path, int]], cfg: HybridConfig) -> tuple[np.ndarray, np.ndarray]:
    xs: list[np.ndarray] = []
    ys: list[int] = []
    for i, (path, y) in enumerate(items):
        xs.append(extract_gbm_features(path, cfg))
        ys.append(y)
        if (i + 1) % 500 == 0:
            print(f"  features {i + 1}/{len(items)}", flush=True)
    return np.stack(xs), np.array(ys, dtype=np.int64)


def train_cnn_branch(
    train_items: list[tuple[Path, int]],
    val_items: list[tuple[Path, int]],
    cfg: HybridConfig,
    device: torch.device,
    *,
    epoch_log_path: Path | None = None,
) -> tuple[torch.nn.Module, CnnConfig]:
    cnn_cfg = CnnConfig(
        fold=cfg.fold,
        seed=cfg.seed,
        sample_rate=cfg.sample_rate,
        clip_seconds=cfg.clip_seconds,
        n_mels=cfg.n_mels,
        epochs=cfg.cnn_epochs,
        batch_size=cfg.cnn_batch_size,
        lr=cfg.cnn_lr,
        augment=True,
        time_shift_max=0.15,
        noise_std=0.008,
        spec_time_masks=cfg.spec_time_masks,
        spec_freq_masks=cfg.spec_freq_masks,
        codec_aug_prob=cfg.codec_aug_prob,
        reverb_aug_prob=cfg.reverb_aug_prob,
        legacy_arch=cfg.legacy_arch,
        val_fraction=0.0,
        early_stop_patience=999,
    )
    mel_transform = torchaudio.transforms.MelSpectrogram(
        sample_rate=cnn_cfg.sample_rate,
        n_fft=cnn_cfg.n_fft,
        hop_length=cnn_cfg.hop_length,
        f_min=cnn_cfg.f_min,
        f_max=cnn_cfg.f_max,
        n_mels=cnn_cfg.n_mels,
        power=2.0,
    )
    amp_to_db = torchaudio.transforms.AmplitudeToDB(stype="power")
    train_ds = TbCoughDataset(train_items, cnn_cfg, True, mel_transform, amp_to_db)
    val_ds = TbCoughDataset(val_items, cnn_cfg, False, mel_transform, amp_to_db)
    train_loader = torch.utils.data.DataLoader(
        train_ds, batch_size=cnn_cfg.batch_size, shuffle=True, num_workers=0
    )
    val_loader = torch.utils.data.DataLoader(val_ds, batch_size=cnn_cfg.batch_size, shuffle=False, num_workers=0)

    model = build_model(legacy=cnn_cfg.legacy_arch).to(device)
    class_w = compute_class_weights([y for _, y in train_items]).to(device)
    criterion = torch.nn.CrossEntropyLoss(weight=class_w)
    opt = torch.optim.AdamW(model.parameters(), lr=cnn_cfg.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=cnn_cfg.epochs, eta_min=1e-6)

    best_f1 = -1.0
    best_state = None
    if epoch_log_path is not None:
        epoch_log_path.parent.mkdir(parents=True, exist_ok=True)
        epoch_log_path.write_text("", encoding="utf-8")

    for epoch in range(1, cnn_cfg.epochs + 1):
        model.train()
        losses: list[float] = []
        for xb, yb in train_loader:
            xb, yb = xb.to(device), yb.to(device)
            opt.zero_grad(set_to_none=True)
            loss = criterion(model(xb), yb)
            loss.backward()
            opt.step()
            losses.append(float(loss.item()))
        scheduler.step()
        metrics = evaluate(model, val_loader, device)
        mean_loss = float(np.mean(losses)) if losses else 0.0
        log_row = {
            "epoch": epoch,
            "train_loss": mean_loss,
            "val_accuracy": metrics["accuracy"],
            "val_f1_macro": metrics["f1_macro"],
            "val_f1_no_tb": metrics["f1_no_tb"],
            "val_f1_tb": metrics["f1_tb"],
            "lr": scheduler.get_last_lr()[0],
        }
        if epoch_log_path is not None:
            with epoch_log_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(log_row) + "\n")
        print(
            f"  cnn epoch {epoch:02d}/{cnn_cfg.epochs} loss={mean_loss:.4f} "
            f"val_acc={metrics['accuracy']:.4f} val_f1={metrics['f1_macro']:.4f}",
            flush=True,
        )
        if metrics["f1_macro"] > best_f1:
            best_f1 = metrics["f1_macro"]
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()
    return model, cnn_cfg


@torch.no_grad()
def cnn_probabilities(
    model: torch.nn.Module,
    cnn_cfg: CnnConfig,
    items: list[tuple[Path, int]],
    device: torch.device,
) -> np.ndarray:
    mel_transform = torchaudio.transforms.MelSpectrogram(
        sample_rate=cnn_cfg.sample_rate,
        n_fft=cnn_cfg.n_fft,
        hop_length=cnn_cfg.hop_length,
        f_min=cnn_cfg.f_min,
        f_max=cnn_cfg.f_max,
        n_mels=cnn_cfg.n_mels,
        power=2.0,
    )
    amp_to_db = torchaudio.transforms.AmplitudeToDB(stype="power")
    ds = TbCoughDataset(items, cnn_cfg, False, mel_transform, amp_to_db)
    loader = torch.utils.data.DataLoader(ds, batch_size=32, shuffle=False, num_workers=0)
    probs: list[float] = []
    model.eval()
    for xb, _ in loader:
        logits = model(xb.to(device))
        p = torch.softmax(logits, dim=1)[:, 1].cpu().numpy().tolist()
        probs.extend(p)
    return np.array(probs, dtype=np.float32)


def fit_hybrid(cfg: HybridConfig) -> Path:
    set_seed(cfg.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tb_root = download_dataset_root(CnnConfig(dataset_slug=cfg.dataset_slug))
    train_rows = read_split_csv(tb_root / "metadata" / f"X_train_Fold_{cfg.fold}.csv")
    test_rows = read_split_csv(tb_root / "metadata" / f"X_test_Fold_{cfg.fold}.csv")
    audio_index = index_audio_files(tb_root / "raw_data")

    def resolve(rows: list[tuple[str, int]]) -> list[tuple[Path, int]]:
        out: list[tuple[Path, int]] = []
        for fn, y in rows:
            p = audio_index.get(fn)
            if p is not None:
                out.append((p, y))
        return out

    train_items = resolve(train_rows)
    test_items = resolve(test_rows)
    labels = [y for _, y in train_items]
    tr_idx, val_idx = train_test_split(
        np.arange(len(train_items)),
        test_size=cfg.val_fraction,
        random_state=cfg.seed,
        stratify=labels,
    )
    train_split = [train_items[i] for i in tr_idx]
    val_split = [train_items[i] for i in val_idx]

    run_dir = make_run_dir()
    print(f"Hybrid run: {run_dir}")
    print(f"Train {len(train_split)} | Val {len(val_split)} | Test {len(test_items)}")

    print("Training CNN branch...")
    cnn_model, cnn_cfg = train_cnn_branch(
        train_split, val_split, cfg, device, epoch_log_path=run_dir / "epoch_log.jsonl"
    )

    print("Extracting GBM features...")
    X_train, y_train = build_feature_matrix(train_split, cfg)
    X_val, y_val = build_feature_matrix(val_split, cfg)
    X_test, y_test = build_feature_matrix(test_items, cfg)

    print("Training GBM branch...")
    gbm = Pipeline(
        [
            ("imp", SimpleImputer(strategy="median")),
            ("sc", StandardScaler()),
            (
                "clf",
                GradientBoostingClassifier(
                    n_estimators=cfg.gbm_n_estimators,
                    max_depth=5,
                    learning_rate=0.04,
                    subsample=0.85,
                    random_state=cfg.seed,
                ),
            ),
        ]
    )
    gbm.fit(X_train, y_train)

    val_cnn_p = cnn_probabilities(cnn_model, cnn_cfg, val_split, device)
    val_gbm_p = gbm.predict_proba(X_val)[:, 1]

    best_w = 0.5
    best_f1 = -1.0
    best_acc = -1.0
    best_t = 0.5
    y_val_true = [y for _, y in val_split]
    for w in np.linspace(0.0, 1.0, 21):
        blend = w * val_cnn_p + (1.0 - w) * val_gbm_p
        for t in np.linspace(0.2, 0.8, 121):
            pred = (blend >= t).astype(int)
            f1 = float(f1_score(y_val_true, pred, average="macro", zero_division=0))
            acc = accuracy_score(y_val_true, pred)
            # Primary objective: macro-F1. Secondary tie-breaker: accuracy.
            if f1 > best_f1 or (np.isclose(f1, best_f1) and acc > best_acc):
                best_f1 = f1
                best_acc = acc
                best_w = float(w)
                best_t = float(t)

    test_cnn_p = cnn_probabilities(cnn_model, cnn_cfg, test_items, device)
    test_gbm_p = gbm.predict_proba(X_test)[:, 1]
    test_blend = best_w * test_cnn_p + (1.0 - best_w) * test_gbm_p
    test_pred = (test_blend >= best_t).astype(int)
    test_acc = float(accuracy_score(y_test, test_pred))
    test_f1 = float(f1_score(y_test, test_pred, average="macro", zero_division=0))
    cm = confusion_matrix(y_test, test_pred).tolist()
    report = classification_report(y_test, test_pred, digits=4, zero_division=0)

    bundle = {
        "hybrid_config": dataclasses.asdict(cfg),
        "cnn_state_dict": cnn_model.state_dict(),
        "cnn_config": dataclasses.asdict(cnn_cfg),
        "gbm_pipeline": gbm,
        "blend_cnn_weight": best_w,
        "decision_threshold": best_t,
        "test_accuracy": test_acc,
        "test_f1_macro": test_f1,
        "best_f1_macro": test_f1,
        "threshold_selection_metric": "val_macro_f1",
    }
    bundle_path = run_dir / "hybrid_bundle.pkl"
    with bundle_path.open("wb") as fh:
        pickle.dump(bundle, fh)

    torch.save(
        {
            "model_state_dict": cnn_model.state_dict(),
            "config": dataclasses.asdict(cnn_cfg),
            "best_f1_macro": test_f1,
            "test_accuracy": test_acc,
            "decision_threshold": best_t,
            "model_type": "hybrid_cnn",
            "hybrid_bundle": str(bundle_path),
            "blend_cnn_weight": best_w,
            "threshold_selection_metric": "val_macro_f1",
        },
        run_dir / "model.pt",
    )

    metrics = {
        "test_accuracy": test_acc,
        "best_f1_macro": test_f1,
        "val_best_f1_macro": best_f1,
        "val_best_accuracy": float(best_acc),
        "blend_cnn_weight": best_w,
        "decision_threshold": best_t,
        "threshold_selection_metric": "val_macro_f1",
        "confusion_matrix": cm,
        "classification_report": report,
    }
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (run_dir / "config.json").write_text(json.dumps(dataclasses.asdict(cfg), indent=2), encoding="utf-8")
    save_confusion_matrix_png(cm, run_dir / "confusion_matrix.png", ["No-TB", "TB"])

    print(f"\nTest accuracy: {test_acc:.4f}  macro-F1: {test_f1:.4f}")
    print(f"Blend weight CNN={best_w:.2f}  threshold={best_t:.3f}")
    print(f"Saved to {run_dir}")
    return run_dir


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--fold", type=int, default=0)
    p.add_argument("--cnn-epochs", type=int, default=25)
    p.add_argument("--gbm-estimators", type=int, default=600)
    args = p.parse_args()
    cfg = HybridConfig(fold=args.fold, cnn_epochs=args.cnn_epochs, gbm_n_estimators=args.gbm_estimators)
    fit_hybrid(cfg)


if __name__ == "__main__":
    main()
