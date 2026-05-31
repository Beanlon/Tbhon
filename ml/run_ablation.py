"""Run cough-model ablation experiments from the accuracy plan.

Usage (from ml/):
  python run_ablation.py
  python run_ablation.py --quick   # fewer epochs for smoke validation
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Experiment:
    name: str
    args: list[str]


EXPERIMENTS = [
    Experiment(
        "A_legacy_64mels_4s",
        ["--legacy-arch", "--n-mels", "64", "--clip-seconds", "4"],
    ),
    Experiment(
        "B_resblock_64mels_4s",
        ["--n-mels", "64", "--clip-seconds", "4"],
    ),
    Experiment(
        "C_resblock_128mels_6s",
        ["--n-mels", "128", "--clip-seconds", "6"],
    ),
]


def run_one(exp: Experiment, *, epochs: int, fold: int) -> dict:
    cmd = [
        sys.executable,
        "train_tb_cough_cnn.py",
        "--fold",
        str(fold),
        "--epochs",
        str(epochs),
        *exp.args,
    ]
    print(f"\n=== {exp.name} ===")
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)

    runs = sorted(Path("runs").glob("*/metrics.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not runs:
        raise RuntimeError(f"No metrics.json produced for {exp.name}")
    metrics_path = runs[0]
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    return {
        "name": exp.name,
        "run_dir": str(metrics_path.parent),
        "test_f1_macro": metrics.get("best_f1_macro"),
        "test": metrics.get("test", {}),
        "decision_threshold": metrics.get("decision_threshold"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fold", type=int, default=0)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--quick", action="store_true", help="Use 3 epochs per experiment.")
    parser.add_argument("--only", type=str, default=None, help="Run a single experiment name.")
    args = parser.parse_args()

    epochs = 3 if args.quick else args.epochs
    experiments = EXPERIMENTS
    if args.only:
        experiments = [e for e in EXPERIMENTS if e.name == args.only]
        if not experiments:
            raise SystemExit(f"Unknown experiment: {args.only}")

    results: list[dict] = []
    for exp in experiments:
        results.append(run_one(exp, epochs=epochs, fold=args.fold))

    summary_path = Path("runs") / "ablation_summary.json"
    existing: list[dict] = []
    if summary_path.exists():
        try:
            existing = json.loads(summary_path.read_text(encoding="utf-8"))
        except Exception:
            existing = []
    merged = {row["name"]: row for row in existing if row.get("name")}
    for row in results:
        merged[row["name"]] = row
    final = list(merged.values())
    summary_path.write_text(json.dumps(final, indent=2), encoding="utf-8")
    print("\n=== Ablation summary ===")
    for row in final:
        f1 = row.get("test_f1_macro")
        print(f"{row['name']}: test macro-F1={f1}")
    print(f"Wrote {summary_path}")

    best = max(final, key=lambda r: float(r.get("test_f1_macro") or 0.0))
    baseline = 0.629
    best_f1 = float(best.get("test_f1_macro") or 0.0)
    print(f"\nBest experiment: {best['name']} (F1={best_f1:.4f})")
    if best_f1 > baseline:
        print(f"Beats baseline {baseline:.3f}; deploy: {best['run_dir']}/model.pt")
    else:
        print(f"Did not beat baseline {baseline:.3f}; keep runs/20260504_005928/model.pt")


if __name__ == "__main__":
    main()
