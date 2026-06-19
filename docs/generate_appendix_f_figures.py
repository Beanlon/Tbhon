"""Generate Appendix F model performance figures for TBhon."""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "docs" / "figures"
COUGH_METRICS = ROOT / "ml" / "runs" / "20260531_014419" / "metrics.json"
SPUTUM_METRICS = ROOT / "ml (phlegm)" / "runs" / "phlegm_afb_binary_20260531_133949" / "metrics.json"


def _bar_pair(title: str, labels: list[str], cough_vals: list[float], sputum_vals: list[float], ylabel: str, out: Path) -> None:
    x = np.arange(len(labels))
    w = 0.35
    fig, ax = plt.subplots(figsize=(7.5, 4.5))
    ax.bar(x - w / 2, cough_vals, w, label="Cough (Hybrid CNN+GBM)", color="#1565C0")
    ax.bar(x + w / 2, sputum_vals, w, label="Sputum (ResNet18 AFB)", color="#2E7D32")
    ax.set_ylabel(ylabel)
    ax.set_title(title, fontweight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylim(0, 1.05)
    ax.legend()
    ax.grid(axis="y", alpha=0.25)
    for i, v in enumerate(cough_vals):
        ax.text(i - w / 2, v + 0.02, f"{v:.1%}", ha="center", fontsize=8)
    for i, v in enumerate(sputum_vals):
        if not np.isnan(v):
            ax.text(i + w / 2, v + 0.02, f"{v:.1%}", ha="center", fontsize=8)
    plt.tight_layout()
    fig.savefig(out, dpi=180, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    FIG.mkdir(parents=True, exist_ok=True)
    cough = json.loads(COUGH_METRICS.read_text(encoding="utf-8"))
    sputum = json.loads(SPUTUM_METRICS.read_text(encoding="utf-8"))

    # Test-set precision (F.1)
    _bar_pair(
        "Appendix F.1 — Test-Set Precision by Class",
        ["Class 0 / AFB−", "Class 1 / AFB+"],
        [0.7913, 0.6431],
        [0.2727, 0.9854],
        "Precision",
        FIG / "appendix_f_1_precision_test.png",
    )

    # Test-set recall (F.2)
    _bar_pair(
        "Appendix F.2 — Test-Set Recall by Class",
        ["Class 0 / AFB−", "Class 1 / AFB+"],
        [0.8825, 0.4763],
        [0.5000, 0.9619],
        "Recall",
        FIG / "appendix_f_2_recall_test.png",
    )

    # Macro F1 validation curves (F.3 — TBhon analogue to mAP)
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    for ax, img, title in [
        (axes[0], FIG / "cough_val_f1_macro.png", "Cough CNN — Validation Macro F1"),
        (axes[1], FIG / "sputum_val_f1_macro.png", "Sputum ResNet18 — Validation Macro F1"),
    ]:
        if img.is_file():
            ax.imshow(plt.imread(str(img)))
        ax.set_title(title, fontsize=10, fontweight="bold")
        ax.axis("off")
    fig.suptitle("Appendix F.3 — Validation Macro F1 Curves", fontweight="bold")
    plt.tight_layout()
    fig.savefig(FIG / "appendix_f_3_macro_f1_curves.png", dpi=180, bbox_inches="tight")
    plt.close(fig)

    # Loss curves (F.4)
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    for ax, img, title in [
        (axes[0], FIG / "cough_train_loss.png", "Cough CNN — Training Loss"),
        (axes[1], FIG / "sputum_train_loss.png", "Sputum ResNet18 — Training Loss"),
    ]:
        if img.is_file():
            ax.imshow(plt.imread(str(img)))
        ax.set_title(title, fontsize=10, fontweight="bold")
        ax.axis("off")
    fig.suptitle("Appendix F.4 — Training Loss Curves", fontweight="bold")
    plt.tight_layout()
    fig.savefig(FIG / "appendix_f_4_train_loss_curves.png", dpi=180, bbox_inches="tight")
    plt.close(fig)

    # Confusion matrices (F.5)
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    for ax, img, title in [
        (axes[0], FIG / "cough_confusion_matrix.png", "Cough Hybrid Classifier"),
        (axes[1], FIG / "sputum_confusion_matrix.png", "Sputum AFB Binary Classifier"),
    ]:
        if img.is_file():
            ax.imshow(plt.imread(str(img)))
        ax.set_title(title, fontsize=10, fontweight="bold")
        ax.axis("off")
    fig.suptitle("Appendix F.5 — Test-Set Confusion Matrices", fontweight="bold")
    plt.tight_layout()
    fig.savefig(FIG / "appendix_f_5_confusion_matrices.png", dpi=180, bbox_inches="tight")
    plt.close(fig)

    print("Wrote Appendix F figures under docs/figures/")


if __name__ == "__main__":
    main()
