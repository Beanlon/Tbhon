"""Select the best hybrid cough checkpoint and update ml/production_model.json.

Usage (from repo root):
  python ml/scripts/promote_cough_model.py
  python ml/scripts/promote_cough_model.py --run 20260531_014419
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
RUNS = ML_DIR / "runs"
MANIFEST = ML_DIR / "production_model.json"


def score_run(run_dir: Path) -> tuple[float, dict] | None:
    model_pt = run_dir / "model.pt"
    metrics_path = run_dir / "metrics.json"
    if not model_pt.is_file() or not metrics_path.is_file():
        return None
    try:
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    f1 = float(metrics.get("best_f1_macro", 0.0) or 0.0)
    if f1 <= 0:
        return None
    is_hybrid = (run_dir / "hybrid_bundle.pkl").is_file()
    return f1, {
        "run_id": run_dir.name,
        "model_path": f"runs/{run_dir.name}/model.pt",
        "model_type": "hybrid_cnn" if is_hybrid else "cnn",
        "best_f1_macro": f1,
        "test_accuracy": float(metrics.get("test_accuracy", 0.0) or 0.0),
        "fold": metrics.get("fold"),
        "notes": (
            "Best single-fold hybrid CNN+GBM on held-out test split. "
            "Deploy model.pt and hybrid_bundle.pkl together."
            if is_hybrid
            else "CNN-only checkpoint."
        ),
    }


def find_best_hybrid() -> dict:
    best: tuple[float, dict] | None = None
    for run_dir in sorted(RUNS.iterdir()):
        if not run_dir.is_dir():
            continue
        row = score_run(run_dir)
        if row is None:
            continue
        f1, payload = row
        if payload["model_type"] != "hybrid_cnn":
            continue
        if best is None or f1 > best[0]:
            best = (f1, payload)
    if best is None:
        raise RuntimeError("No hybrid runs with metrics.json under ml/runs/")
    return best[1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Update ml/production_model.json")
    parser.add_argument("--run", help="Specific run folder name under ml/runs/")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.run:
        row = score_run(RUNS / args.run)
        if row is None:
            print(f"Run not found or missing metrics: {args.run}", file=sys.stderr)
            return 1
        payload = row[1]
    else:
        payload = find_best_hybrid()

    text = json.dumps(payload, indent=2) + "\n"
    print(text)
    if args.dry_run:
        return 0
    MANIFEST.write_text(text, encoding="utf-8")
    print(f"Wrote {MANIFEST}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
