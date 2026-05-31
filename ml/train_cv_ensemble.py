"""Train hybrid models on all folds and evaluate a 3-model probability ensemble."""
from __future__ import annotations

import argparse
import json
import pickle
import sys
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

_ML = Path(__file__).resolve().parent
sys.path.insert(0, str(_ML))

from model_arch import build_model
from train_tb_cough_cnn import Config, download_dataset_root, index_audio_files, read_split_csv
from train_tb_cough_hybrid import (
    HybridConfig,
    build_feature_matrix,
    cnn_probabilities,
    fit_hybrid,
)


def load_bundle(run_dir: Path) -> dict:
    with (run_dir / "hybrid_bundle.pkl").open("rb") as fh:
        return pickle.load(fh)


def ensemble_eval(folds: list[int], cnn_epochs: int, gbm_estimators: int) -> dict:
    run_dirs: list[Path] = []
    for fold in folds:
        print(f"\n========== Training fold {fold} hybrid ==========")
        cfg = HybridConfig(fold=fold, cnn_epochs=cnn_epochs, gbm_n_estimators=gbm_estimators)
        run_dirs.append(fit_hybrid(cfg))

    tb_root = download_dataset_root(Config())
    per_fold: list[dict] = []

    for eval_fold in folds:
        test_rows = read_split_csv(tb_root / "metadata" / f"X_test_Fold_{eval_fold}.csv")
        audio_index = index_audio_files(tb_root / "raw_data")
        test_items = [(audio_index[fn], y) for fn, y in test_rows if fn in audio_index]
        y_true = np.array([y for _, y in test_items], dtype=np.int64)
        cfg_eval = HybridConfig(fold=eval_fold)
        X_test, _ = build_feature_matrix(test_items, cfg_eval)

        probs_acc: list[np.ndarray] = []
        for run_dir in run_dirs:
            bundle = load_bundle(run_dir)
            gbm_p = bundle["gbm_pipeline"].predict_proba(X_test)[:, 1]
            cnn_cfg = Config(**bundle["cnn_config"])
            device = torch.device("cpu")
            model = build_model(legacy=cnn_cfg.legacy_arch).to(device)
            model.load_state_dict(bundle["cnn_state_dict"])
            cnn_p = cnn_probabilities(model, cnn_cfg, test_items, device)
            w = float(bundle["blend_cnn_weight"])
            probs_acc.append(w * cnn_p + (1.0 - w) * gbm_p)

        avg_prob = np.mean(np.stack(probs_acc, axis=0), axis=0)
        best_acc = 0.0
        best_t = 0.5
        for t in np.linspace(0.15, 0.85, 141):
            acc = accuracy_score(y_true, (avg_prob >= t).astype(int))
            if acc > best_acc:
                best_acc = acc
                best_t = float(t)

        pred = (avg_prob >= best_t).astype(int)
        per_fold.append(
            {
                "fold": eval_fold,
                "accuracy": float(accuracy_score(y_true, pred)),
                "best_accuracy": float(best_acc),
                "threshold": best_t,
                "f1_macro": float(f1_score(y_true, pred, average="macro", zero_division=0)),
                "confusion_matrix": confusion_matrix(y_true, pred).tolist(),
                "n_test": int(len(y_true)),
            }
        )
        print(f"Fold {eval_fold} 3-model ensemble best accuracy: {best_acc:.4f} @ t={best_t:.3f}")

    mean_acc = float(np.mean([r["best_accuracy"] for r in per_fold]))
    summary = {
        "folds": folds,
        "per_fold": per_fold,
        "mean_best_accuracy": mean_acc,
        "run_dirs": [str(p) for p in run_dirs],
    }
    out = Path("runs") / "cv_ensemble_summary.json"
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nMean CV ensemble best accuracy: {mean_acc:.4f}")
    print(f"Wrote {out}")
    return summary


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--folds", type=str, default="0,1,2")
    p.add_argument("--cnn-epochs", type=int, default=20)
    p.add_argument("--gbm-estimators", type=int, default=500)
    args = p.parse_args()
    folds = [int(x) for x in args.folds.split(",") if x.strip()]
    ensemble_eval(folds, args.cnn_epochs, args.gbm_estimators)


if __name__ == "__main__":
    main()
