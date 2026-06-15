"""Calibrate binary sputum AFB decision threshold for deployment.

Picks the threshold with highest specificity among those meeting a minimum
AFB+ sensitivity constraint on the validation split.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.utils.data import DataLoader

_ML = Path(__file__).resolve().parent
if str(_ML) not in sys.path:
    sys.path.insert(0, str(_ML))

from train_phlegm_cnn import (  # noqa: E402
    DEFAULT_MIN_SENSITIVITY,
    PhlegmAFBDataset,
    collect_probs,
    load_dataset_items,
    make_model,
    tune_decision_threshold_constrained,
)


def resolve_checkpoint(path: Path | None) -> Path:
    if path is not None:
        if not path.is_file():
            raise FileNotFoundError(f"Checkpoint not found: {path}")
        return path
    runs = _ML / "runs"
    best: Path | None = None
    best_mtime = -1.0
    for ckpt in runs.glob("phlegm_afb_binary_*/model_best.pt"):
        mtime = ckpt.stat().st_mtime
        if mtime > best_mtime:
            best_mtime = mtime
            best = ckpt
    if best is None:
        raise FileNotFoundError(
            "No phlegm_afb_binary_*/model_best.pt found under runs/. Train first or pass --checkpoint."
        )
    return best


def build_val_loader(
    dataset: Path,
    *,
    img_size: int,
    batch_size: int,
    seed: int,
    stratified_resplit: bool,
) -> tuple[DataLoader, dict[str, int], int]:
    from torchvision import transforms

    train_items, val_items, _test_items, _class_names, label_to_idx = load_dataset_items(
        dataset,
        task="binary",
        stratified_resplit=stratified_resplit,
        seed=seed,
    )
    _ = train_items
    norm = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    base_tf = transforms.Compose(
        [transforms.Resize((img_size, img_size)), transforms.ToTensor(), norm]
    )
    val_ds = PhlegmAFBDataset(val_items, base_tf, None, train=False)
    loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0)
    positive_idx = int(label_to_idx["afb_positive"])
    return loader, label_to_idx, positive_idx


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate sputum AFB binary decision threshold")
    parser.add_argument("--checkpoint", type=Path, default=None)
    parser.add_argument(
        "--dataset",
        type=Path,
        default=_ML / "Raw_Sputum_Microscopy_Dataset",
    )
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--min-sensitivity", type=float, default=DEFAULT_MIN_SENSITIVITY)
    parser.add_argument(
        "--no-stratified-resplit",
        action="store_true",
        help="Use folder val split as-is instead of stratified in-memory resplit",
    )
    parser.add_argument(
        "--out-json",
        type=Path,
        default=_ML / "runs" / "phlegm_calibration_latest.json",
    )
    args = parser.parse_args()

    ckpt_path = resolve_checkpoint(args.checkpoint)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    label_map: dict[str, int] = ckpt["label_map"]
    backbone = ckpt.get("backbone", "resnet18")
    img_size = int(ckpt.get("img_size", 224))
    checkpoint_threshold = float(ckpt.get("decision_threshold", 0.5))

    model = make_model(len(label_map), backbone).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    val_loader, label_to_idx, positive_idx = build_val_loader(
        args.dataset,
        img_size=img_size,
        batch_size=args.batch_size,
        seed=args.seed,
        stratified_resplit=not args.no_stratified_resplit,
    )
    y_val, val_probs = collect_probs(model, val_loader, device)
    threshold, best_metrics, policy = tune_decision_threshold_constrained(
        y_val,
        val_probs,
        positive_idx,
        min_sensitivity=float(args.min_sensitivity),
    )

    output: dict[str, Any] = {
        "checkpoint_path": str(ckpt_path),
        "checkpoint_threshold": checkpoint_threshold,
        "constraints": {"min_sensitivity": float(args.min_sensitivity)},
        "best": {
            "threshold": threshold,
            "policy": policy,
            "sensitivity": best_metrics["sensitivity"],
            "specificity": best_metrics["specificity"],
            "balanced_accuracy": best_metrics["balanced_accuracy"],
            "tp": best_metrics["tp"],
            "fn": best_metrics["fn"],
            "tn": best_metrics["tn"],
            "fp": best_metrics["fp"],
        },
        "dataset": {
            "path": str(args.dataset),
            "stratified_resplit": not args.no_stratified_resplit,
            "val_samples": int(len(y_val)),
            "val_negatives": int(np.sum(y_val == label_to_idx["afb_negative"])),
            "val_positives": int(np.sum(y_val == label_to_idx["afb_positive"])),
        },
    }

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(output, indent=2), encoding="utf-8")

    print(f"Checkpoint: {ckpt_path}")
    print(f"Val samples: {len(y_val)} (neg={output['dataset']['val_negatives']}, pos={output['dataset']['val_positives']})")
    print("\nBest operating point:")
    print(json.dumps(output["best"], indent=2))
    print(f"\nSaved calibration report: {args.out_json}")


if __name__ == "__main__":
    main()
