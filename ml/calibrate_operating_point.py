"""Calibrate quality gate + TB decision threshold for deployment behavior.

Usage examples:
  # Quick baseline on Kaggle fold-0 test + synthetic hard negatives
  python ml/calibrate_operating_point.py --kaggle-fold 0 --sample-size 1200

  # Real deployment set (recommended)
  python ml/calibrate_operating_point.py --manifest data/real_val_manifest.csv

Manifest CSV columns:
  path,label,is_hard_negative
where:
  - path: audio file path
  - label: 1 for TB, 0 for non-TB
  - is_hard_negative: optional (1/0); set 1 for speech/noise/replay clips
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from scipy.io import wavfile as scipy_wavfile
from sklearn.metrics import confusion_matrix

from cough_quality import QUALITY_THRESHOLDS, cough_authenticity_metrics
from infer_api import (
    WINDOWING,
    _resample_np,
    _to_pcm16,
    _top_energy_windows,
    get_hybrid_bundle_cached,
    load_audio_any_format,
    load_checkpoint,
    make_feature_extractor,
    read_checkpoint_meta,
    resolve_model_path,
)
from hybrid_predict import predict_hybrid_from_path
from train_tb_cough_cnn import download_dataset_root, read_split_csv


AUDIO_EXTS = {".wav", ".m4a", ".mp4", ".3gp", ".3gpp", ".ogg", ".aac", ".caf"}


@dataclass(frozen=True)
class EvalClip:
    path: Path
    label: int
    is_hard_negative: bool


@dataclass(frozen=True)
class ClipPred:
    label: int
    is_hard_negative: bool
    prob_tb: float
    quality_ok: bool


def _parse_bool(raw: str | None) -> bool:
    if raw is None:
        return False
    return str(raw).strip().lower() in {"1", "true", "yes", "y"}


def load_manifest(path: Path) -> list[EvalClip]:
    rows: list[EvalClip] = []
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            p = Path((row.get("path") or "").strip())
            if not p.is_file():
                continue
            label = int((row.get("label") or "0").strip())
            hard = _parse_bool(row.get("is_hard_negative"))
            rows.append(EvalClip(path=p, label=label, is_hard_negative=hard))
    if not rows:
        raise ValueError(f"No valid rows in manifest: {path}")
    return rows


def load_kaggle_eval(fold: int, sample_size: int, seed: int) -> list[EvalClip]:
    cfg = type("Cfg", (), {"dataset_slug": "ruchikashirsath/tb-audio"})()
    root = download_dataset_root(cfg)
    raw_dir = root / "raw_data"
    idx = {p.name: p for p in raw_dir.rglob("*.wav")}
    rows = read_split_csv(root / "metadata" / f"X_test_Fold_{fold}.csv")

    out: list[EvalClip] = []
    for fn, y in rows:
        p = idx.get(fn)
        if p is not None:
            out.append(EvalClip(path=p, label=int(y), is_hard_negative=False))
    if sample_size > 0 and len(out) > sample_size:
        random.seed(seed)
        out = random.sample(out, sample_size)
    return out


def load_hard_negative_dir(path: Path) -> list[EvalClip]:
    if not path.exists():
        return []
    out: list[EvalClip] = []
    for p in sorted(path.rglob("*")):
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
            out.append(EvalClip(path=p, label=0, is_hard_negative=True))
    return out


def infer_prob_tb_for_clip(path: Path, model_path: Path, model_meta: dict[str, Any]) -> float:
    data = path.read_bytes()
    sr, wav = load_audio_any_format(data)

    if model_meta.get("model_type") == "hybrid_cnn" or model_meta.get("hybrid_bundle"):
        bundle = get_hybrid_bundle_cached(model_path)
        hybrid_cfg = bundle.get("hybrid_config") or {}
        target_sr = int(hybrid_cfg.get("sample_rate", 16000))
        target_sec = float(hybrid_cfg.get("clip_seconds", 4.0))
        target_len = max(1, int(target_sr * target_sec))
        stride = max(1, int(target_sr * WINDOWING.stride_seconds))
        wav_rs = _resample_np(wav, sr, target_sr)
        windows = _top_energy_windows(
            wav_rs,
            target_len=target_len,
            top_k=WINDOWING.top_k,
            stride=stride,
        )
        probs: list[float] = []
        for w in windows:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = Path(tmp.name)
            scipy_wavfile.write(str(tmp_path), target_sr, _to_pcm16(w))
            try:
                pred = predict_hybrid_from_path(tmp_path, bundle)
            finally:
                tmp_path.unlink(missing_ok=True)
            probs.append(float(pred["prob_tb"]))
        if not probs:
            return 0.5
        if WINDOWING.agg == "max":
            return float(max(probs))
        return float(sum(probs) / len(probs))

    model, cfg, _meta = load_checkpoint(model_path)
    mel, amp_to_db = make_feature_extractor(cfg)
    wav_rs = _resample_np(wav, sr, cfg.sample_rate)
    target_len = max(1, int(cfg.sample_rate * cfg.clip_seconds))
    stride = max(1, int(cfg.sample_rate * WINDOWING.stride_seconds))
    windows = _top_energy_windows(
        wav_rs,
        target_len=target_len,
        top_k=WINDOWING.top_k,
        stride=stride,
    )
    import torch

    probs: list[float] = []
    with torch.no_grad():
        for w in windows:
            x = torch.from_numpy(w).to(torch.float32)
            feat = amp_to_db(mel(x))
            feat = (feat - feat.mean()) / (feat.std() + 1e-6)
            feat = feat.unsqueeze(0).unsqueeze(0)
            logits = model(feat)
            prob = torch.softmax(logits, dim=1).cpu().numpy()[0].astype(float).tolist()
            probs.append(float(prob[1]))
    if not probs:
        return 0.5
    if WINDOWING.agg == "max":
        return float(max(probs))
    return float(sum(probs) / len(probs))


def evaluate_setting(preds: list[ClipPred], tb_threshold: float) -> dict[str, float]:
    y_true: list[int] = []
    y_pred: list[int] = []
    hard_total = 0
    hard_blocked = 0
    for p in preds:
        if p.is_hard_negative:
            hard_total += 1
            if not p.quality_ok:
                hard_blocked += 1
        pred = 0
        if p.quality_ok and p.prob_tb >= tb_threshold:
            pred = 1
        y_true.append(p.label)
        y_pred.append(pred)

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])
    recall_tb = tp / (tp + fn + 1e-12)
    fpr = fp / (fp + tn + 1e-12)
    hard_block_rate = hard_blocked / hard_total if hard_total else 0.0
    return {
        "tb_threshold": tb_threshold,
        "recall_tb": recall_tb,
        "fpr_non_tb": fpr,
        "hard_negative_block_rate": hard_block_rate,
        "tp": float(tp),
        "fn": float(fn),
        "fp": float(fp),
        "tn": float(tn),
    }


def choose_best(
    rows: list[dict[str, Any]],
    min_recall: float,
    max_fpr: float,
    min_hard_block: float,
) -> dict[str, Any]:
    constrained = [
        r
        for r in rows
        if r["recall_tb"] >= min_recall
        and r["fpr_non_tb"] <= max_fpr
        and r["hard_negative_block_rate"] >= min_hard_block
    ]
    pool = constrained if constrained else rows
    pool.sort(
        key=lambda r: (
            r["recall_tb"] - 0.7 * r["fpr_non_tb"] + 0.3 * r["hard_negative_block_rate"],
            -r["fpr_non_tb"],
            r["recall_tb"],
        ),
        reverse=True,
    )
    return pool[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=str, default="", help="CSV with path,label,is_hard_negative")
    parser.add_argument("--kaggle-fold", type=int, default=0, help="Fallback eval split when no manifest")
    parser.add_argument("--sample-size", type=int, default=1200)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--hard-neg-dir", type=str, default="samples/synthetic")
    parser.add_argument("--out-json", type=str, default="ml/runs/calibration_latest.json")
    parser.add_argument("--min-recall", type=float, default=0.80)
    parser.add_argument("--max-fpr", type=float, default=0.25)
    parser.add_argument("--min-hard-block", type=float, default=0.75)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    model_path = resolve_model_path()
    model_meta = read_checkpoint_meta(model_path)

    clips: list[EvalClip]
    if args.manifest.strip():
        clips = load_manifest(Path(args.manifest.strip()))
    else:
        clips = load_kaggle_eval(args.kaggle_fold, args.sample_size, args.seed)
    clips += load_hard_negative_dir(Path(args.hard_neg_dir))
    if not clips:
        raise SystemExit("No clips available for calibration.")

    print(f"Using model: {model_path}")
    print(f"Eval clips: {len(clips)}")

    # Pre-compute metrics and model probabilities once.
    rows: list[dict[str, Any]] = []
    for i, clip in enumerate(clips, start=1):
        sr, wav = load_audio_any_format(clip.path.read_bytes())
        prob_tb = infer_prob_tb_for_clip(clip.path, model_path, model_meta)
        rows.append(
            {
                "clip": clip,
                "sr": int(sr),
                "wav": np.asarray(wav, dtype=np.float32),
                "prob_tb": prob_tb,
            }
        )
        if i % 200 == 0:
            print(f"  processed {i}/{len(clips)} clips")

    quality_grid = []
    base = dict(QUALITY_THRESHOLDS)
    for min_rms in [0.0025, 0.0030, 0.0035]:
        for voiced_frac in [0.40, 0.45, 0.50]:
            for min_dyn in [2.0, 2.2, 2.4]:
                t = dict(base)
                t["min_rms"] = min_rms
                t["voiced_frac_threshold"] = voiced_frac
                t["min_dynamic_range"] = min_dyn
                quality_grid.append(t)

    all_results: list[dict[str, Any]] = []
    tb_thresholds = [round(x, 3) for x in np.linspace(0.25, 0.75, 101).tolist()]
    for qth in quality_grid:
        preds: list[ClipPred] = []
        for row in rows:
            clip: EvalClip = row["clip"]
            sr = int(row["sr"])
            wav = np.asarray(row["wav"], dtype=np.float32)
            q = cough_authenticity_metrics(wav, sr, thresholds=qth)
            preds.append(
                ClipPred(
                    label=clip.label,
                    is_hard_negative=clip.is_hard_negative,
                    prob_tb=float(row["prob_tb"]),
                    quality_ok=bool(q.get("ok", False)),
                )
            )
        for tb_t in tb_thresholds:
            m = evaluate_setting(preds, tb_t)
            all_results.append(
                {
                    **m,
                    "quality_thresholds": {
                        "min_rms": qth["min_rms"],
                        "voiced_frac_threshold": qth["voiced_frac_threshold"],
                        "min_dynamic_range": qth["min_dynamic_range"],
                    },
                }
            )

    best = choose_best(all_results, args.min_recall, args.max_fpr, args.min_hard_block)
    output = {
        "model_path": str(model_path),
        "model_type": model_meta.get("model_type", "cnn"),
        "windowing": {"top_k": WINDOWING.top_k, "agg": WINDOWING.agg, "stride_seconds": WINDOWING.stride_seconds},
        "dataset": {
            "manifest": args.manifest or None,
            "kaggle_fold": args.kaggle_fold if not args.manifest else None,
            "sample_size": args.sample_size if not args.manifest else None,
            "hard_neg_dir": args.hard_neg_dir,
            "num_clips": len(clips),
        },
        "constraints": {
            "min_recall": args.min_recall,
            "max_fpr": args.max_fpr,
            "min_hard_block": args.min_hard_block,
        },
        "best": best,
    }

    out_path = Path(args.out_json)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")

    print("\nBest operating point:")
    print(json.dumps(best, indent=2))
    print(f"\nSaved calibration report: {out_path}")


if __name__ == "__main__":
    main()

