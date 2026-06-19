"""Generate a simple fusion diagram: checklist + cough + sputum → fused risk."""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

ROOT = Path(__file__).resolve().parents[1]
FIG_DIR = ROOT / "docs" / "figures"
OUT = FIG_DIR / "fusion_diagram_checklist_cough_sputum.png"
OUT_ALT = FIG_DIR / "figure_6_5_fusion_diagram.png"


def _box(ax, x, y, w, h, text, fc, ec, fontsize=9, bold=False):
    ax.add_patch(
        FancyBboxPatch(
            (x, y),
            w,
            h,
            boxstyle="round,pad=0.015,rounding_size=0.02",
            linewidth=1.6,
            edgecolor=ec,
            facecolor=fc,
        )
    )
    ax.text(
        x + w / 2,
        y + h / 2,
        text,
        ha="center",
        va="center",
        fontsize=fontsize,
        fontweight="bold" if bold else "normal",
    )


def _arrow(ax, x1, y1, x2, y2, color="#37474F", rad=0.0):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle="-|>",
            mutation_scale=14,
            linewidth=1.6,
            color=color,
            connectionstyle=f"arc3,rad={rad}",
        )
    )


def draw(ax) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # Three inputs
    _box(
        ax,
        0.04,
        0.62,
        0.20,
        0.22,
        "Symptom checklist\n(11 items)\n\nWeighted logistic\nsymptom model\n→ P(TB)",
        fc="#E8F5E9",
        ec="#2E7D32",
        fontsize=8.5,
        bold=True,
    )
    _box(
        ax,
        0.04,
        0.34,
        0.20,
        0.22,
        "Cough audio ML\n(hybrid CNN + GBM)\n\nMean P(TB) across\n3 quality-valid clips",
        fc="#E3F2FD",
        ec="#1565C0",
        fontsize=8.5,
        bold=True,
    )
    _box(
        ax,
        0.04,
        0.06,
        0.20,
        0.22,
        "Sputum smear ML\n(ResNet18 AFB binary)\n\nAFB class probability\n→ P(TB)",
        fc="#FFF3E0",
        ec="#EF6C00",
        fontsize=8.5,
        bold=True,
    )

    # Plus junction
    ax.text(0.30, 0.50, "+", ha="center", va="center", fontsize=28, fontweight="bold", color="#64748B")

    # Fusion
    _box(
        ax,
        0.36,
        0.30,
        0.24,
        0.40,
        "Weighted log-odds\nfusion\n\nw_checklist = 0.85\nw_cough = 1.00\nw_sputum = 0.70\n\n+ clinical safety\nfloors",
        fc="#F3E5F5",
        ec="#6A1B9A",
        fontsize=8.8,
        bold=True,
    )

    _arrow(ax, 0.24, 0.73, 0.36, 0.58, color="#2E7D32", rad=-0.08)
    _arrow(ax, 0.24, 0.45, 0.36, 0.50, color="#1565C0")
    _arrow(ax, 0.24, 0.17, 0.36, 0.42, color="#EF6C00", rad=0.08)

    # Output
    _box(
        ax,
        0.72,
        0.30,
        0.22,
        0.40,
        "Fused TB risk\n\nprob_tb\n\nLow  < 38%\nModerate  38–62%\nHigh  ≥ 62%\n\nTriage output\n(not diagnosis)",
        fc="#FFFFFF",
        ec="#D97706",
        fontsize=8.8,
        bold=True,
    )
    _arrow(ax, 0.60, 0.50, 0.72, 0.50, color="#6A1B9A", rad=0.0)

    ax.text(
        0.50,
        0.92,
        "Multimodal risk fusion: checklist + cough + sputum → fused risk",
        ha="center",
        fontsize=12,
        fontweight="bold",
    )
    ax.text(
        0.50,
        0.04,
        "Implemented in mobile/utils/tbRiskFusion.ts · fuseTbRisk() during screening processing",
        ha="center",
        fontsize=7.5,
        color="#64748B",
        style="italic",
    )


def save(path: Path) -> None:
    fig, ax = plt.subplots(figsize=(11, 5.5))
    fig.patch.set_facecolor("white")
    draw(ax)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> int:
    save(OUT)
    save(OUT_ALT)
    print(f"Generated:\n  {OUT}\n  {OUT_ALT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
