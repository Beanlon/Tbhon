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
from sklearn.model_selection import train_test_split

from audio_crop import fix_length as crop_fix_length
from model_arch import build_model, load_model_from_state


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
    # Light domain-shift augmentation for mobile/IoT compression + room effects.
    codec_aug_prob: float = 0.0
    codec_min_bits: int = 8
    codec_max_bits: int = 12
    codec_lowpass_min_hz: int = 2800
    codec_lowpass_max_hz: int = 4200
    reverb_aug_prob: float = 0.0
    reverb_min_delay_ms: float = 18.0
    reverb_max_delay_ms: float = 45.0
    reverb_min_decay: float = 0.15
    reverb_max_decay: float = 0.35

    val_fraction: float = 0.12
    early_stop_patience: int = 5
    legacy_arch: bool = False


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def download_dataset_root(cfg: Config) -> Path:
    import kagglehub  # only needed during training
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
        return crop_fix_length(x, self.target_len, train=self.train)

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

        # Simulate lossy mobile codecs: quantization + low-pass bandwidth limit.
        if self.cfg.codec_aug_prob > 0 and float(torch.rand(1).item()) < self.cfg.codec_aug_prob:
            min_bits = max(4, int(self.cfg.codec_min_bits))
            max_bits = max(min_bits, int(self.cfg.codec_max_bits))
            bits = int(torch.randint(min_bits, max_bits + 1, (1,)).item())
            levels = float((1 << bits) - 1)
            x = torch.clamp(x, -1.0, 1.0)
            x = torch.round(((x + 1.0) * 0.5) * levels) / levels
            x = x * 2.0 - 1.0
            lo = max(400, int(self.cfg.codec_lowpass_min_hz))
            hi = max(lo, int(self.cfg.codec_lowpass_max_hz))
            cutoff = int(torch.randint(lo, hi + 1, (1,)).item())
            x = torchaudio.functional.lowpass_biquad(x.unsqueeze(0), self.cfg.sample_rate, cutoff).squeeze(0)

        # Simple single-tap echo to mimic room reverberation on far mics.
        if self.cfg.reverb_aug_prob > 0 and float(torch.rand(1).item()) < self.cfg.reverb_aug_prob:
            delay_lo = max(1e-3, float(self.cfg.reverb_min_delay_ms)) / 1000.0
            delay_hi = max(delay_lo, float(self.cfg.reverb_max_delay_ms)) / 1000.0
            delay_s = float(torch.empty(1).uniform_(delay_lo, delay_hi).item())
            delay = int(max(1, round(delay_s * self.cfg.sample_rate)))
            decay_lo = max(0.0, float(self.cfg.reverb_min_decay))
            decay_hi = max(decay_lo, float(self.cfg.reverb_max_decay))
            decay = float(torch.empty(1).uniform_(decay_lo, decay_hi).item())
            if delay < x.numel():
                y = x.clone()
                y[delay:] = y[delay:] + decay * x[:-delay]
                x = torch.clamp(y, -1.0, 1.0)

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


@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    device: torch.device,
    *,
    threshold: float = 0.5,
) -> dict:
    model.eval()
    ys: list[int] = []
    probs_tb: list[float] = []
    for xb, yb in loader:
        xb = xb.to(device)
        logits = model(xb)
        prob = torch.softmax(logits, dim=1)[:, 1].cpu().numpy().tolist()
        ys.extend(yb.numpy().tolist())
        probs_tb.extend(prob)

    ps = [1 if p >= threshold else 0 for p in probs_tb]
    acc = float(accuracy_score(ys, ps))
    f1 = float(f1_score(ys, ps, average="macro", zero_division=0))
    f1_per_class = f1_score(ys, ps, average=None, labels=[0, 1], zero_division=0).tolist()
    cm = confusion_matrix(ys, ps).tolist()
    report = classification_report(ys, ps, digits=4, zero_division=0)
    return {
        "accuracy": acc,
        "f1_macro": f1,
        "f1_no_tb": float(f1_per_class[0]),
        "f1_tb": float(f1_per_class[1]),
        "threshold": threshold,
        "confusion_matrix": cm,
        "classification_report": report,
    }


@torch.no_grad()
def sweep_threshold(model: nn.Module, loader: torch.utils.data.DataLoader, device: torch.device) -> tuple[float, float]:
    """Pick TB probability threshold that maximizes macro-F1 on loader."""
    model.eval()
    ys: list[int] = []
    probs_tb: list[float] = []
    for xb, yb in loader:
        xb = xb.to(device)
        logits = model(xb)
        prob = torch.softmax(logits, dim=1)[:, 1].cpu().numpy().tolist()
        ys.extend(yb.numpy().tolist())
        probs_tb.extend(prob)

    best_t = 0.5
    best_f1 = -1.0
    for t in np.linspace(0.25, 0.75, 51):
        ps = [1 if p >= t else 0 for p in probs_tb]
        f1 = float(f1_score(ys, ps, average="macro", zero_division=0))
        if f1 > best_f1:
            best_f1 = f1
            best_t = float(t)
    return best_t, best_f1


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

    labels = [y for _, y in train_items]
    train_idx, val_idx = train_test_split(
        np.arange(len(train_items)),
        test_size=cfg.val_fraction,
        random_state=cfg.seed,
        stratify=labels,
    )
    train_items_split = [train_items[i] for i in train_idx]
    val_items = [train_items[i] for i in val_idx]

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

    train_ds = TbCoughDataset(train_items_split, cfg, train=True, mel_transform=mel_transform, amp_to_db=amp_to_db)
    val_ds = TbCoughDataset(val_items, cfg, train=False, mel_transform=mel_transform, amp_to_db=amp_to_db)
    test_ds = TbCoughDataset(test_items, cfg, train=False, mel_transform=mel_transform, amp_to_db=amp_to_db)

    train_loader = torch.utils.data.DataLoader(
        train_ds,
        batch_size=cfg.batch_size,
        shuffle=True,
        num_workers=cfg.num_workers,
        pin_memory=torch.cuda.is_available(),
    )
    val_loader = torch.utils.data.DataLoader(
        val_ds,
        batch_size=cfg.batch_size,
        shuffle=False,
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

    model = build_model(legacy=cfg.legacy_arch).to(device)

    class_w = compute_class_weights([y for _, y in train_items_split]).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_w)
    opt = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=cfg.epochs, eta_min=1e-6)

    run_dir = make_run_dir()
    (run_dir / "config.json").write_text(json.dumps(dataclasses.asdict(cfg), indent=2), encoding="utf-8")
    print(f"Run dir: {run_dir}")
    print(
        f"Train samples: {len(train_items_split)}  |  Val: {len(val_items)}  |  "
        f"Test samples: {len(test_items)}"
    )
    print(f"Using device: {device}  |  legacy_arch={cfg.legacy_arch}")

    best_f1 = -1.0
    best_path = run_dir / "model.pt"
    epochs_without_improvement = 0
    epoch_log_path = run_dir / "epoch_log.jsonl"

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
        val_metrics = evaluate(model, val_loader, device)
        mean_loss = float(np.mean(losses)) if losses else 0.0
        log_row = {
            "epoch": epoch,
            "train_loss": mean_loss,
            "val_accuracy": val_metrics["accuracy"],
            "val_f1_macro": val_metrics["f1_macro"],
            "val_f1_no_tb": val_metrics["f1_no_tb"],
            "val_f1_tb": val_metrics["f1_tb"],
            "lr": scheduler.get_last_lr()[0],
        }
        with epoch_log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(log_row) + "\n")
        print(
            f"epoch {epoch:02d}/{cfg.epochs} loss={mean_loss:.4f} "
            f"val_acc={val_metrics['accuracy']:.4f} val_f1={val_metrics['f1_macro']:.4f}  "
            f"lr={scheduler.get_last_lr()[0]:.2e}",
            flush=True,
        )

        if val_metrics["f1_macro"] > best_f1:
            best_f1 = val_metrics["f1_macro"]
            epochs_without_improvement = 0
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "config": dataclasses.asdict(cfg),
                    "best_f1_macro": best_f1,
                    "best_val_f1_macro": best_f1,
                },
                best_path,
            )
            print(f"  -> new best val F1: {best_f1:.4f} (saved)", flush=True)
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= cfg.early_stop_patience:
                print(
                    f"  -> early stop at epoch {epoch} "
                    f"(no val F1 improvement for {cfg.early_stop_patience} epochs)",
                    flush=True,
                )
                break

    if not best_path.exists():
        torch.save(
            {
                "model_state_dict": model.state_dict(),
                "config": dataclasses.asdict(cfg),
                "best_f1_macro": best_f1,
                "best_val_f1_macro": best_f1,
            },
            best_path,
        )

    ckpt = torch.load(best_path, map_location=device)
    best_model = build_model(legacy=cfg.legacy_arch).to(device)
    best_model.load_state_dict(ckpt["model_state_dict"])
    best_threshold, _ = sweep_threshold(best_model, val_loader, device)
    test_metrics = evaluate(best_model, test_loader, device, threshold=best_threshold)
    ckpt["decision_threshold"] = best_threshold
    ckpt["best_f1_macro"] = test_metrics["f1_macro"]
    ckpt["test_metrics"] = {
        k: v for k, v in test_metrics.items() if k != "classification_report"
    }
    torch.save(ckpt, best_path)

    (run_dir / "metrics.json").write_text(
        json.dumps(
            {
                "best_val_f1_macro": best_f1,
                "best_f1_macro": test_metrics["f1_macro"],
                "decision_threshold": best_threshold,
                "test": {k: v for k, v in test_metrics.items() if k != "classification_report"},
                "classification_report": test_metrics["classification_report"],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    save_confusion_matrix_png(test_metrics["confusion_matrix"], run_dir / "confusion_matrix.png", ["No-TB", "TB"])

    print(f"\nSaved run to: {run_dir}")
    print(f"Best checkpoint: {best_path}")
    print(f"Test macro-F1 (best checkpoint): {test_metrics['f1_macro']:.4f}")
    print(f"Decision threshold (val sweep): {best_threshold:.3f}")


@torch.no_grad()
def predict_one(audio_path: Path, model_path: Path) -> None:
    ckpt = torch.load(model_path, map_location="cpu")
    cfg = Config(**ckpt.get("config", {}))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    threshold = float(ckpt.get("decision_threshold", 0.5))

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

    model = load_model_from_state(ckpt["model_state_dict"], legacy=cfg.legacy_arch).to(device)
    logits = model(x)
    prob = torch.softmax(logits, dim=1).detach().cpu().numpy()[0]
    pred = 1 if prob[1] >= threshold else 0
    label = "TB" if pred == 1 else "No-TB"
    print(f"Prediction: {label} (threshold={threshold:.3f})")
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
    p.add_argument("--legacy-arch", action="store_true", help="Use legacy 3-conv CNN (better on fold 0 baseline).")
    p.add_argument("--val-fraction", type=float, default=0.12)
    p.add_argument("--early-stop-patience", type=int, default=5)

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
        legacy_arch=bool(args.legacy_arch),
        val_fraction=float(args.val_fraction),
        early_stop_patience=int(args.early_stop_patience),
    )

    if args.predict:
        if not args.model:
            raise SystemExit("--model is required when using --predict")
        predict_one(Path(args.predict), Path(args.model))
        return

    train(cfg)


if __name__ == "__main__":
    main()

