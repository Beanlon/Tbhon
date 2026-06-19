"""Generate DurTect-style metrics compilation figures for Chapter VI.

Outputs under docs/figures/:
  - cough_metrics_compilation_8_epochs.png
  - cough_train_loss.png, cough_val_f1_macro.png, cough_val_f1_tb.png, ...
  - sputum_metrics_compilation_30_epochs.png
  - sputum_train_loss.png, sputum_val_macro_f1.png, ...
  - figure_6_ml_metrics_compilation.png (combined chapter figure)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "docs" / "figures"
COUGH_RUN = ROOT / "ml" / "runs" / "20260531_014419"
COUGH_LOG = COUGH_RUN / "epoch_log.jsonl"
SPUTUM_LOG = ROOT / "ml (phlegm)" / "runs" / "train_binary_resnet18.log"

YOLO_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"]


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def read_text_auto(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace")
    return raw.decode("utf-8", errors="replace")


def parse_phlegm_log(path: Path) -> list[dict[str, Any]]:
    pattern = re.compile(
        r"epoch\s+(\d+)/(\d+)\s+train_loss=([\d.]+)\s+val_acc=([\d.]+)\s+"
        r"val_macro_f1=([\d.]+)\s+best_val_macro_f1=([\d.]+)"
    )
    rows: list[dict[str, Any]] = []
    for line in read_text_auto(path).splitlines():
        m = pattern.search(line)
        if not m:
            continue
        rows.append(
            {
                "epoch": int(m.group(1)),
                "epochs_total": int(m.group(2)),
                "train_loss": float(m.group(3)),
                "val_accuracy": float(m.group(4)),
                "val_f1_macro": float(m.group(5)),
                "best_val_f1_macro": float(m.group(6)),
            }
        )
    return rows


def _smooth(values: list[float], weight: float = 0.6) -> np.ndarray:
    arr = np.asarray(values, dtype=float)
    if len(arr) < 2:
        return arr
    out = arr.copy()
    for i in range(1, len(out)):
        out[i] = weight * out[i] + (1.0 - weight) * out[i - 1]
    return out


def _plot_series(ax, epochs: list[int], values: list[float], label: str, color: str, smooth: bool = True) -> None:
    y = np.asarray(values, dtype=float)
    ax.plot(epochs, y, "o-", color=color, linewidth=1.2, markersize=4, alpha=0.35, label=f"{label} (raw)")
    if smooth and len(y) > 1:
        ax.plot(epochs, _smooth(values), color=color, linewidth=2.2, label=f"{label} (smooth)")
    ax.set_xlabel("Epoch")
    ax.grid(True, alpha=0.3, linestyle="--")
    ax.legend(fontsize=7, loc="best")


def metrics_summary_table(rows: list[dict[str, Any]], keys: list[tuple[str, str]]) -> list[list[str]]:
    out = [["Metric", "Minimum", "Maximum"]]
    for label, key in keys:
        vals = [float(r[key]) for r in rows if key in r]
        if not vals:
            continue
        out.append([label, f"{min(vals):.4f}", f"{max(vals):.4f}"])
    return out


def save_compilation(
    rows: list[dict[str, Any]],
    panels: list[tuple[str, str, str]],
    title: str,
    out_path: Path,
) -> None:
    n = len(panels)
    ncols = 3
    nrows = int(np.ceil(n / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(12, 3.6 * nrows))
    fig.patch.set_facecolor("white")
    axes_flat = np.atleast_1d(axes).ravel()
    epochs = [int(r["epoch"]) for r in rows]

    for i, (ylabel, key, color) in enumerate(panels):
        ax = axes_flat[i]
        values = [float(r[key]) for r in rows]
        _plot_series(ax, epochs, values, ylabel, color)
        ax.set_title(ylabel, fontsize=10, fontweight="bold")

    for j in range(len(panels), len(axes_flat)):
        axes_flat[j].axis("off")

    fig.suptitle(title, fontsize=13, fontweight="bold", y=1.02)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_single_curve(
    rows: list[dict[str, Any]],
    key: str,
    ylabel: str,
    title: str,
    out_path: Path,
    color: str = "#1f77b4",
) -> None:
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    fig.patch.set_facecolor("white")
    epochs = [int(r["epoch"]) for r in rows]
    values = [float(r[key]) for r in rows]
    _plot_series(ax, epochs, values, ylabel, color)
    ax.set_title(title, fontsize=11, fontweight="bold")
    ax.set_ylabel(ylabel)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=180, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_combined_chapter_figure(cough_rows: list[dict], sputum_rows: list[dict], out_path: Path) -> None:
    fig = plt.figure(figsize=(14, 11))
    fig.patch.set_facecolor("white")
    outer = fig.add_gridspec(2, 1, height_ratios=[1.15, 0.85], hspace=0.42)
    cough_gs = outer[0].subgridspec(2, 3, hspace=0.38, wspace=0.30)
    sputum_gs = outer[1].subgridspec(1, 3, hspace=0.38, wspace=0.30)

    fig.text(
        0.5,
        0.96,
        f"(a) Hybrid Cough CNN — Metrics Compilation at {len(cough_rows)} Epochs",
        ha="center",
        fontsize=12,
        fontweight="bold",
    )
    fig.text(
        0.5,
        0.47,
        f"(b) Sputum ResNet18 Binary Classifier — Metrics Compilation at {len(sputum_rows)} Epochs",
        ha="center",
        fontsize=12,
        fontweight="bold",
    )

    cough_panels = [
        ("Train Loss", "train_loss", YOLO_COLORS[0]),
        ("Val Accuracy", "val_accuracy", YOLO_COLORS[1]),
        ("Val Macro F1", "val_f1_macro", YOLO_COLORS[2]),
        ("Val F1 Non-TB", "val_f1_no_tb", YOLO_COLORS[3]),
        ("Val F1 TB", "val_f1_tb", YOLO_COLORS[4]),
        ("Learning Rate", "lr", YOLO_COLORS[5]),
    ]
    cough_epochs = [int(r["epoch"]) for r in cough_rows]
    for i, (ylabel, key, color) in enumerate(cough_panels):
        r, c = divmod(i, 3)
        ax = fig.add_subplot(cough_gs[r, c])
        _plot_series(ax, cough_epochs, [float(row[key]) for row in cough_rows], ylabel, color)
        ax.set_title(ylabel, fontsize=9, fontweight="bold")

    sputum_panels = [
        ("Train Loss", "train_loss", YOLO_COLORS[0]),
        ("Val Accuracy", "val_accuracy", YOLO_COLORS[1]),
        ("Val Macro F1", "val_f1_macro", YOLO_COLORS[2]),
    ]
    sputum_epochs = [int(r["epoch"]) for r in sputum_rows]
    for i, (ylabel, key, color) in enumerate(sputum_panels):
        ax = fig.add_subplot(sputum_gs[0, i])
        _plot_series(ax, sputum_epochs, [float(row[key]) for row in sputum_rows], ylabel, color)
        ax.set_title(ylabel, fontsize=9, fontweight="bold")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def generate_cough(rows: list[dict[str, Any]]) -> None:
    n = len(rows)
    save_compilation(
        rows,
        [
            ("Train Loss", "train_loss", YOLO_COLORS[0]),
            ("Val Accuracy", "val_accuracy", YOLO_COLORS[1]),
            ("Val Macro F1", "val_f1_macro", YOLO_COLORS[2]),
            ("Val F1 Non-TB", "val_f1_no_tb", YOLO_COLORS[3]),
            ("Val F1 TB", "val_f1_tb", YOLO_COLORS[4]),
            ("Learning Rate", "lr", YOLO_COLORS[5]),
        ],
        f"Hybrid Cough CNN — Metrics Compilation at {n} Epochs",
        FIG / f"cough_metrics_compilation_{n}_epochs.png",
    )
    singles = [
        ("train_loss", "Train Loss", "Cough CNN Training Loss"),
        ("val_f1_macro", "Val Macro F1", "Cough CNN Validation Macro F1"),
        ("val_f1_tb", "Val F1 TB", "Cough CNN Validation F1 (TB Class)"),
        ("val_f1_no_tb", "Val F1 Non-TB", "Cough CNN Validation F1 (Non-TB Class)"),
    ]
    for key, ylabel, title in singles:
        save_single_curve(rows, key, ylabel, title, FIG / f"cough_{key}.png")


def generate_sputum(rows: list[dict[str, Any]]) -> None:
    n = len(rows)
    save_compilation(
        rows,
        [
            ("Train Loss", "train_loss", YOLO_COLORS[0]),
            ("Val Accuracy", "val_accuracy", YOLO_COLORS[1]),
            ("Val Macro F1", "val_f1_macro", YOLO_COLORS[2]),
        ],
        f"Sputum ResNet18 Binary Classifier — Metrics Compilation at {n} Epochs",
        FIG / f"sputum_metrics_compilation_{n}_epochs.png",
    )
    for key, ylabel, title in [
        ("train_loss", "Train Loss", "Sputum ResNet18 Training Loss"),
        ("val_f1_macro", "Val Macro F1", "Sputum ResNet18 Validation Macro F1"),
        ("val_accuracy", "Val Accuracy", "Sputum ResNet18 Validation Accuracy"),
    ]:
        save_single_curve(rows, key, ylabel, title, FIG / f"sputum_{key}.png")


def main() -> int:
    if not COUGH_LOG.is_file():
        print(
            f"Missing {COUGH_LOG}\n"
            "Run: python ml/scripts/export_cough_epoch_log.py --run 20260531_014419",
            file=sys.stderr,
        )
        return 1
    if not SPUTUM_LOG.is_file():
        print(f"Missing {SPUTUM_LOG}", file=sys.stderr)
        return 1

    cough_rows = load_jsonl(COUGH_LOG)
    sputum_rows = parse_phlegm_log(SPUTUM_LOG)
    if not cough_rows:
        print("Cough epoch log is empty.", file=sys.stderr)
        return 1
    if not sputum_rows:
        print("Could not parse sputum training log.", file=sys.stderr)
        return 1

    generate_cough(cough_rows)
    generate_sputum(sputum_rows)
    save_combined_chapter_figure(
        cough_rows,
        sputum_rows,
        FIG / "figure_6_ml_metrics_compilation.png",
    )

    print("Generated metrics compilation figures:")
    for name in sorted(FIG.glob("*metrics_compilation*")) + sorted(FIG.glob("cough_*.png")) + sorted(
        FIG.glob("sputum_*.png")
    ):
        if name.name.startswith("sputum_annotated") or name.name.startswith("sputum_load"):
            continue
        print(f"  {name}")
    print(f"  {FIG / 'figure_6_ml_metrics_compilation.png'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
