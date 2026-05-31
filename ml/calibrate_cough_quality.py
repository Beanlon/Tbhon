"""Calibrate cough quality gate against Kaggle TB coughs and synthetic negatives."""
from __future__ import annotations

import argparse
import csv
import random
import struct
import sys
import wave
from pathlib import Path

import numpy as np

_ML = Path(__file__).resolve().parent
if str(_ML) not in sys.path:
    sys.path.insert(0, str(_ML))

from cough_quality import QUALITY_THRESHOLDS, cough_authenticity_metrics
from infer_api import load_audio_any_format


def _write_wav(path: Path, samples: np.ndarray, sr: int = 16000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(samples * 32767.0, -32767, 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<h", int(v)) for v in pcm))


def make_synthetic_negatives(out_dir: Path, sr: int = 16000) -> dict[str, Path]:
    t = np.arange(sr * 6) / sr
    speech = 0.25 * np.sin(2 * np.pi * 150 * t) + 0.05 * np.sin(2 * np.pi * 300 * t)
    replay = 0.3 * np.sin(2 * np.pi * 440 * t)
    noise = np.random.default_rng(0).normal(0, 0.08, sr * 6).astype(np.float32)
    quiet = np.zeros(sr * 4, dtype=np.float32)

    paths = {
        "speech.wav": out_dir / "speech.wav",
        "replay_tone.wav": out_dir / "replay_tone.wav",
        "steady_noise.wav": out_dir / "steady_noise.wav",
        "quiet.wav": out_dir / "quiet.wav",
    }
    _write_wav(paths["speech.wav"], speech.astype(np.float32), sr)
    _write_wav(paths["replay_tone.wav"], replay.astype(np.float32), sr)
    _write_wav(paths["steady_noise.wav"], noise, sr)
    _write_wav(paths["quiet.wav"], quiet, sr)
    return paths


def load_tb_cough_sample(n: int, seed: int = 0) -> list[Path]:
    import kagglehub

    root = Path(kagglehub.dataset_download("ruchikashirsath/tb-audio")) / "Tuberculosis"
    idx = {p.name: p for p in (root / "raw_data").rglob("*.wav")}
    rows: list[Path] = []
    with (root / "metadata" / "X_train_Fold_0.csv").open() as f:
        for row in csv.DictReader(f):
            p = idx.get(row["filename"].strip())
            if p:
                rows.append(p)
    random.seed(seed)
    return random.sample(rows, min(n, len(rows)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=800, help="Number of Kaggle TB coughs to sample")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--synthetic-dir", type=str, default="samples/synthetic")
    args = parser.parse_args()

    print("Thresholds:", QUALITY_THRESHOLDS)

    neg_dir = Path(args.synthetic_dir)
    neg_paths = make_synthetic_negatives(neg_dir)
    print("\nSynthetic negatives:")
    blocked_neg = 0
    for name, path in neg_paths.items():
        sr, wav = load_audio_any_format(path.read_bytes())
        r = cough_authenticity_metrics(wav, sr)
        status = "BLOCK" if not r["ok"] else "PASS"
        if not r["ok"]:
            blocked_neg += 1
        print(f"  {name:16} {status:5} label={r['label']:8} reasons={r.get('reasons')}")

    cough_paths = load_tb_cough_sample(args.n, args.seed)
    blocked = 0
    labels: dict[str, int] = {}
    for p in cough_paths:
        sr, wav = load_audio_any_format(p.read_bytes())
        r = cough_authenticity_metrics(wav, sr)
        if not r["ok"]:
            blocked += 1
            labels[r["label"]] = labels.get(r["label"], 0) + 1

    pass_rate = 1.0 - blocked / len(cough_paths)
    print(f"\nKaggle TB coughs: {len(cough_paths)} sampled, pass={pass_rate:.1%}, blocked={blocked}")
    if labels:
        print("  blocked labels:", labels)
    print(f"Synthetic negatives blocked: {blocked_neg}/{len(neg_paths)}")

    if pass_rate < 0.95:
        raise SystemExit(f"Pass rate {pass_rate:.1%} below 95% target")
    if blocked_neg < len(neg_paths):
        raise SystemExit(f"Expected all synthetic negatives blocked, got {blocked_neg}/{len(neg_paths)}")


if __name__ == "__main__":
    main()
