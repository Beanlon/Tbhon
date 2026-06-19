"""Re-run CNN branch training for a hybrid run and write epoch_log.jsonl.

Production hybrid runs created before epoch logging was added do not include
per-epoch metrics. This script reproduces the CNN training split (same fold,
seed, val_fraction) and writes epoch_log.jsonl into the target run directory.

Usage:
  python ml/scripts/export_cough_epoch_log.py --run 20260531_014419
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path

_ML = Path(__file__).resolve().parents[1]
if str(_ML) not in sys.path:
    sys.path.insert(0, str(_ML))

import numpy as np
import torch
from sklearn.model_selection import train_test_split

from train_tb_cough_cnn import Config as CnnConfig, download_dataset_root, index_audio_files, read_split_csv, set_seed
from train_tb_cough_hybrid import HybridConfig, train_cnn_branch


def load_hybrid_config(run_dir: Path) -> HybridConfig:
    cfg_path = run_dir / "config.json"
    if not cfg_path.is_file():
        raise FileNotFoundError(f"Missing {cfg_path}")
    raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    fields = {f.name for f in dataclasses.fields(HybridConfig)}
    return HybridConfig(**{k: v for k, v in raw.items() if k in fields})


def main() -> int:
    p = argparse.ArgumentParser(description="Export CNN epoch_log.jsonl for a hybrid run")
    p.add_argument("--run", type=str, required=True, help="Run id under ml/runs/")
    args = p.parse_args()

    run_dir = _ML / "runs" / args.run
    if not run_dir.is_dir():
        print(f"Run directory not found: {run_dir}", file=sys.stderr)
        return 1

    cfg = load_hybrid_config(run_dir)
    set_seed(cfg.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    tb_root = download_dataset_root(CnnConfig(dataset_slug=cfg.dataset_slug))
    train_rows = read_split_csv(tb_root / "metadata" / f"X_train_Fold_{cfg.fold}.csv")
    audio_index = index_audio_files(tb_root / "raw_data")

    train_items: list[tuple[Path, int]] = []
    for fn, y in train_rows:
        path = audio_index.get(fn)
        if path is not None:
            train_items.append((path, y))

    labels = [y for _, y in train_items]
    tr_idx, val_idx = train_test_split(
        np.arange(len(train_items)),
        test_size=cfg.val_fraction,
        random_state=cfg.seed,
        stratify=labels,
    )
    train_split = [train_items[i] for i in tr_idx]
    val_split = [train_items[i] for i in val_idx]

    epoch_log_path = run_dir / "epoch_log.jsonl"
    print(f"Run: {args.run}  fold={cfg.fold}  cnn_epochs={cfg.cnn_epochs}")
    print(f"Train {len(train_split)} | Val {len(val_split)} | device={device}")
    print(f"Writing {epoch_log_path}")

    train_cnn_branch(train_split, val_split, cfg, device, epoch_log_path=epoch_log_path)
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
