"""Generate Figure 5.4 — Hybrid CNN + GBM cough architecture and confusion matrix."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ML = ROOT / "ml"
FIG_DIR = ROOT / "docs" / "figures"
PRODUCTION = ML / "production_model.json"


def load_production_metrics() -> tuple[dict, Path]:
    if not PRODUCTION.is_file():
        raise FileNotFoundError(f"Missing {PRODUCTION}")
    prod = json.loads(PRODUCTION.read_text(encoding="utf-8"))
    model_path = ML / prod["model_path"]
    run_dir = model_path.parent
    metrics_path = run_dir / "metrics.json"
    if not metrics_path.is_file():
        raise FileNotFoundError(f"Missing metrics at {metrics_path}")
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    config_path = run_dir / "config.json"
    if config_path.is_file():
        metrics["_config"] = json.loads(config_path.read_text(encoding="utf-8"))
    metrics["_run_id"] = prod.get("run_id", run_dir.name)
    return metrics, run_dir


def _box(ax, x, y, w, h, text, fc="#E3F2FD", ec="#1565C0", fontsize=9, bold=False):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.015,rounding_size=0.02",
        linewidth=1.4,
        edgecolor=ec,
        facecolor=fc,
    )
    ax.add_patch(patch)
    weight = "bold" if bold else "normal"
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fontsize, fontweight=weight)


def _arrow(ax, x1, y1, x2, y2, color="#37474F"):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle="-|>",
            mutation_scale=11,
            linewidth=1.3,
            color=color,
        )
    )


def draw_architecture_panel(ax, metrics: dict) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(0.5, 0.97, "(a) Hybrid CNN + GBM architecture", ha="center", fontsize=11, fontweight="bold")

    cfg = metrics.get("_config") or {}
    sr = cfg.get("sample_rate", 16000)
    clip = cfg.get("clip_seconds", 4.0)
    n_mels = cfg.get("n_mels", 64)
    blend_w = float(metrics.get("blend_cnn_weight", 0.05))
    threshold = float(metrics.get("decision_threshold", 0.395))
    gbm_n = cfg.get("gbm_n_estimators", 300)

    # Input
    _box(ax, 0.38, 0.84, 0.24, 0.08, f"Cough audio\n{sr} Hz · {clip:.0f}s clip", fc="#E8F5E9", ec="#2E7D32", fontsize=8.5)
    _arrow(ax, 0.50, 0.84, 0.50, 0.78)

    # Split
    _box(ax, 0.38, 0.70, 0.24, 0.07, "Preprocessing", fc="#FFFDE7", ec="#F9A825", fontsize=9, bold=True)
    _arrow(ax, 0.44, 0.70, 0.22, 0.62)
    _arrow(ax, 0.56, 0.70, 0.78, 0.62)

    # CNN branch (left)
    _box(ax, 0.04, 0.48, 0.36, 0.13, f"Log-Mel spectrogram\n({n_mels} mel bands)", fc="#E3F2FD", ec="#1565C0", fontsize=8.5)
    _arrow(ax, 0.22, 0.48, 0.22, 0.42)
    _box(
        ax,
        0.04,
        0.28,
        0.36,
        0.13,
        "LegacySmallAudioCNN\nConv → BN → ReLU → Pool (×3)\nFC → P(TB)_CNN",
        fc="#BBDEFB",
        ec="#0D47A1",
        fontsize=8,
    )

    # GBM branch (right)
    _box(
        ax,
        0.60,
        0.48,
        0.36,
        0.13,
        "Hand-crafted features\nMFCC · Δ · ΔΔ · Mel stats\nRMS · ZCR · amplitude stats",
        fc="#FFF3E0",
        ec="#EF6C00",
        fontsize=8,
    )
    _arrow(ax, 0.78, 0.48, 0.78, 0.42)
    _box(
        ax,
        0.60,
        0.28,
        0.36,
        0.13,
        f"Gradient Boosting\n({gbm_n} estimators)\nImputer → Scaler → GBM\n→ P(TB)_GBM",
        fc="#FFE0B2",
        ec="#E65100",
        fontsize=8,
    )

    # Merge
    _arrow(ax, 0.22, 0.28, 0.42, 0.20)
    _arrow(ax, 0.78, 0.28, 0.58, 0.20)
    _box(
        ax,
        0.28,
        0.12,
        0.44,
        0.10,
        f"Weighted blend\nP(TB) = {blend_w:.2f}·CNN + {1 - blend_w:.2f}·GBM",
        fc="#F3E5F5",
        ec="#6A1B9A",
        fontsize=8.5,
        bold=True,
    )
    _arrow(ax, 0.50, 0.12, 0.50, 0.06)
    _box(
        ax,
        0.32,
        0.01,
        0.36,
        0.06,
        f"Decision (θ = {threshold:.3f})  →  TB / No-TB",
        fc="#E8EAF6",
        ec="#283593",
        fontsize=8.5,
        bold=True,
    )


def draw_confusion_panel(ax, metrics: dict) -> None:
    cm = np.array(metrics["confusion_matrix"], dtype=np.int64)
    acc = float(metrics.get("test_accuracy", 0.0))
    f1 = float(metrics.get("best_f1_macro", 0.0))
    class_names = ["No-TB", "TB"]

    ax.set_title("(b) Test-set confusion matrix", fontsize=11, fontweight="bold", pad=10)
    im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
    ax.figure.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    ax.set(
        xticks=np.arange(len(class_names)),
        yticks=np.arange(len(class_names)),
        xticklabels=class_names,
        yticklabels=class_names,
        ylabel="True label",
        xlabel="Predicted label",
    )
    thresh = cm.max() / 2.0 if cm.size else 0.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(
                j,
                i,
                format(cm[i, j], "d"),
                ha="center",
                va="center",
                fontsize=14,
                fontweight="bold",
                color="white" if cm[i, j] > thresh else "#1A237E",
            )

    tn, fp, fn, tp = cm[0, 0], cm[0, 1], cm[1, 0], cm[1, 1]
    summary = (
        f"Accuracy: {acc * 100:.2f}%   Macro-F1: {f1 * 100:.2f}%\n"
        f"TN={tn}  FP={fp}  FN={fn}  TP={tp}   (n={cm.sum()})"
    )
    ax.text(0.5, -0.22, summary, transform=ax.transAxes, ha="center", fontsize=9, color="#37474F")


def draw_metrics_panel(ax, metrics: dict) -> None:
    ax.axis("off")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.text(0.5, 0.92, "(c) Test performance summary", ha="center", fontsize=11, fontweight="bold")

    report = metrics.get("classification_report", "")
    rows = [
        ("Test accuracy", f"{float(metrics.get('test_accuracy', 0)) * 100:.2f}%"),
        ("Macro F1-score", f"{float(metrics.get('best_f1_macro', 0)) * 100:.2f}%"),
        ("CNN blend weight", f"{float(metrics.get('blend_cnn_weight', 0)):.2f}"),
        ("Decision threshold", f"{float(metrics.get('decision_threshold', 0)):.3f}"),
        ("Run ID", str(metrics.get("_run_id", "—"))),
    ]
    for line in report.splitlines():
        if line.strip().startswith("0 ") or line.strip().startswith("1 "):
            parts = line.split()
            label = "No-TB" if parts[0] == "0" else "TB"
            rows.append((f"{label} precision", f"{float(parts[1]) * 100:.1f}%"))
            rows.append((f"{label} recall", f"{float(parts[2]) * 100:.1f}%"))
            rows.append((f"{label} F1", f"{float(parts[3]) * 100:.1f}%"))

    y = 0.78
    for label, value in rows:
        ax.text(0.08, y, label, fontsize=9, color="#455A64")
        ax.text(0.92, y, value, fontsize=9, ha="right", fontweight="bold", color="#1565C0")
        ax.plot([0.06, 0.94], [y - 0.03, y - 0.03], color="#ECEFF1", linewidth=0.8)
        y -= 0.085
        if y < 0.05:
            break


def save_combined_figure(out_path: Path, metrics: dict) -> None:
    fig = plt.figure(figsize=(14, 10))
    fig.patch.set_facecolor("white")

    ax_arch = fig.add_axes([0.04, 0.52, 0.92, 0.42])
    draw_architecture_panel(ax_arch, metrics)

    ax_cm = fig.add_axes([0.08, 0.08, 0.38, 0.38])
    draw_confusion_panel(ax_cm, metrics)

    ax_met = fig.add_axes([0.54, 0.08, 0.42, 0.38])
    draw_metrics_panel(ax_met, metrics)

    fig.suptitle(
        "Figure 5.4. Hybrid CNN + GBM Cough Classification Architecture and Test Performance",
        fontsize=13,
        fontweight="bold",
        y=0.98,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_confusion_only(out_path: Path, metrics: dict) -> None:
    fig, ax = plt.subplots(figsize=(5.5, 4.8))
    draw_confusion_panel(ax, metrics)
    ax.set_title("Hybrid Cough Classifier — Confusion Matrix (Test Fold)", fontsize=11, fontweight="bold")
    fig.patch.set_facecolor("white")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=180, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_architecture_only(out_path: Path, metrics: dict) -> None:
    fig = plt.figure(figsize=(12, 7))
    fig.patch.set_facecolor("white")
    ax = fig.add_axes([0.04, 0.06, 0.92, 0.88])
    draw_architecture_panel(ax, metrics)
    ax.text(
        0.5,
        0.97,
        "Hybrid CNN + GBM Cough TB Classifier",
        ha="center",
        fontsize=13,
        fontweight="bold",
        transform=ax.transAxes,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> int:
    try:
        metrics, _run_dir = load_production_metrics()
    except FileNotFoundError as exc:
        print(exc, file=sys.stderr)
        return 1

    combined = FIG_DIR / "figure_5_4_cough_architecture_and_confusion_matrix.png"
    arch_only = FIG_DIR / "cough_hybrid_architecture.png"
    cm_only = FIG_DIR / "cough_confusion_matrix.png"

    save_combined_figure(combined, metrics)
    save_architecture_only(arch_only, metrics)
    save_confusion_only(cm_only, metrics)

    print("Generated:")
    print(f"  {combined}")
    print(f"  {arch_only}")
    print(f"  {cm_only}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
