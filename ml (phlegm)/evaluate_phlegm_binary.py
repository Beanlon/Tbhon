"""Re-evaluate a phlegm binary checkpoint on the stratified test split."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch.utils.data import DataLoader
from torchvision import transforms

_ML = Path(__file__).resolve().parent
if str(_ML) not in sys.path:
    sys.path.insert(0, str(_ML))

from train_phlegm_cnn import (  # noqa: E402
    DEFAULT_MIN_SENSITIVITY,
    PhlegmAFBDataset,
    collect_probs,
    load_dataset_items,
    make_model,
    predict_with_threshold,
    tune_decision_threshold_constrained,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument(
        "--dataset",
        type=Path,
        default=_ML / "Raw_Sputum_Microscopy_Dataset",
    )
    parser.add_argument("--min-sensitivity", type=float, default=DEFAULT_MIN_SENSITIVITY)
    parser.add_argument("--write-metrics", type=Path, default=None)
    parser.add_argument("--update-checkpoint-threshold", action="store_true")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
    label_map: dict[str, int] = ckpt["label_map"]
    class_names = [k for k, _ in sorted(label_map.items(), key=lambda kv: kv[1])]
    pos_idx = int(label_map["afb_positive"])
    model = make_model(len(label_map), ckpt.get("backbone", "resnet18")).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    img_size = int(ckpt.get("img_size", 224))

    train_items, val_items, test_items, _, _ = load_dataset_items(
        args.dataset,
        task="binary",
        stratified_resplit=True,
        seed=1337,
    )
    _ = train_items
    norm = transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    base_tf = transforms.Compose([transforms.Resize((img_size, img_size)), transforms.ToTensor(), norm])
    val_loader = DataLoader(PhlegmAFBDataset(val_items, base_tf, None, False), batch_size=32)
    test_loader = DataLoader(PhlegmAFBDataset(test_items, base_tf, None, False), batch_size=32)

    y_val, val_probs = collect_probs(model, val_loader, device)
    threshold, val_metrics, policy = tune_decision_threshold_constrained(
        y_val,
        val_probs,
        pos_idx,
        min_sensitivity=float(args.min_sensitivity),
    )
    y_test, test_probs = collect_probs(model, test_loader, device)
    p_test = predict_with_threshold(test_probs, pos_idx, threshold)
    cm = confusion_matrix(y_test, p_test)
    test_acc = float((y_test == p_test).mean()) if len(y_test) else 0.0
    macro_f1 = float(f1_score(y_test, p_test, average="macro", zero_division=0))
    metrics: dict[str, Any] = {
        "task": "binary",
        "decision_threshold": threshold,
        "threshold_policy": policy,
        "min_sensitivity_constraint": float(args.min_sensitivity),
        "val_threshold_metrics": val_metrics,
        "test_acc": test_acc,
        "test_macro_f1": macro_f1,
        "confusion_matrix": cm.tolist(),
        "classification_report": classification_report(
            y_test, p_test, target_names=class_names, zero_division=0
        ),
        "stratified_resplit": True,
    }
    if cm.size == 4:
        tn, fp, fn, tp = cm.ravel()
        metrics["sensitivity"] = float(tp / (tp + fn)) if (tp + fn) else 0.0
        metrics["specificity"] = float(tn / (tn + fp)) if (tn + fp) else 0.0

    print(json.dumps(metrics, indent=2))

    metrics_path = args.write_metrics or args.checkpoint.parent / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"\nWrote {metrics_path}")

    if args.update_checkpoint_threshold:
        ckpt["decision_threshold"] = threshold
        torch.save(ckpt, args.checkpoint)
        print(f"Updated checkpoint threshold to {threshold:.3f}")


if __name__ == "__main__":
    main()
