"""Generate Figure 6.1.4 — Multimodal Risk Fusion Workflow."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch, Wedge

ROOT = Path(__file__).resolve().parents[1]
FIG_DIR = ROOT / "docs" / "figures"
OUT_COMBINED = FIG_DIR / "figure_6_1_4_multimodal_risk_fusion_workflow.png"
OUT_WORKFLOW = FIG_DIR / "multimodal_risk_fusion_workflow.png"
OUT_RESULT = FIG_DIR / "multimodal_fusion_result_mockup.png"

EPS = 1e-6
FUSED_LOW_MAX = 0.38
FUSED_MODERATE_MAX = 0.62


def _box(ax, x, y, w, h, text, fc="#E3F2FD", ec="#1565C0", fontsize=8.5, bold=False, lw=1.4):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.012,rounding_size=0.015",
        linewidth=lw,
        edgecolor=ec,
        facecolor=fc,
    )
    ax.add_patch(patch)
    weight = "bold" if bold else "normal"
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fontsize, fontweight=weight)


def _arrow(ax, x1, y1, x2, y2, color="#37474F", rad=0.0, label: str | None = None):
    ax.add_patch(
        FancyArrowPatch(
            (x1, y1),
            (x2, y2),
            arrowstyle="-|>",
            mutation_scale=11,
            linewidth=1.25,
            color=color,
            connectionstyle=f"arc3,rad={rad}",
        )
    )
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx, my + 0.015, label, ha="center", va="bottom", fontsize=7, color=color)


def clamp01(p: float) -> float:
    return min(1 - EPS, max(EPS, p))


def logit(p: float) -> float:
    c = clamp01(p)
    return math.log(c / (1 - c))


def sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1 / (1 + z)
    z = math.exp(x)
    return z / (1 + z)


def weighted_log_odds_fusion(parts: list[tuple[float, float]]) -> float:
    num = den = 0.0
    for prob, weight in parts:
        num += weight * logit(prob)
        den += weight
    return sigmoid(num / den) if den > 0 else 0.12


def prob_to_risk_level(p: float) -> str:
    if p >= FUSED_MODERATE_MAX:
        return "High"
    if p >= FUSED_LOW_MAX:
        return "Moderate"
    return "Low"


def risk_color(level: str) -> str:
    return {"Low": "#16A34A", "Moderate": "#D97706", "High": "#DC2626"}.get(level, "#64748B")


def example_fusion() -> dict:
    """Representative screening session used for the result mockup."""
    checklist_prob = 0.442
    cough_prob = 0.521
    sputum_prob = 0.716
    weights = {"checklist": 0.85, "cough": 1.0, "sputum": 0.7}
    fused = weighted_log_odds_fusion(
        [
            (checklist_prob, weights["checklist"]),
            (cough_prob, weights["cough"]),
            (sputum_prob, weights["sputum"]),
        ]
    )
    # Safety floor: high checklist concern + AFB-positive sputum
    fused = max(fused, 0.58, 0.55)
    fused = clamp01(fused)
    level = prob_to_risk_level(fused)
    return {
        "fused_prob": fused,
        "risk_level": level,
        "modalities": [
            {
                "key": "checklist",
                "label": "Symptoms & exposure",
                "prob": checklist_prob,
                "weight": weights["checklist"],
                "detail": "4/11 yes · moderate",
                "level": prob_to_risk_level(checklist_prob),
            },
            {
                "key": "cough",
                "label": "Cough audio ML",
                "prob": cough_prob,
                "weight": weights["cough"],
                "detail": "CNN+GBM · 52.1%",
                "level": prob_to_risk_level(cough_prob),
            },
            {
                "key": "sputum",
                "label": "Sputum smear ML",
                "prob": sputum_prob,
                "weight": weights["sputum"],
                "detail": "AFB+ · 72% conf",
                "level": prob_to_risk_level(sputum_prob),
            },
        ],
    }


def draw_fusion_workflow(ax, example: dict) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(
        0.5,
        0.97,
        "(a) Multimodal risk fusion workflow",
        ha="center",
        fontsize=11,
        fontweight="bold",
    )

    # Inputs
    _box(
        ax,
        0.04,
        0.72,
        0.18,
        0.14,
        "1. Symptom checklist\n(11 yes/no items)\n→ P(TB) via weighted\nlogistic symptom model",
        fc="#E8F5E9",
        ec="#2E7D32",
        fontsize=7.2,
        bold=True,
    )
    _box(
        ax,
        0.04,
        0.52,
        0.18,
        0.14,
        "2. Cough audio ML\nHybrid CNN + GBM\n→ mean P(TB) across\nquality-valid clips (×3)",
        fc="#E3F2FD",
        ec="#1565C0",
        fontsize=7.2,
        bold=True,
    )
    _box(
        ax,
        0.04,
        0.32,
        0.18,
        0.14,
        "3. Sputum smear ML\nResNet18 AFB binary\n→ P(TB) from AFB+/−\nclass probability",
        fc="#FFF3E0",
        ec="#EF6C00",
        fontsize=7.2,
        bold=True,
    )

    # Fusion core
    _box(
        ax,
        0.34,
        0.48,
        0.22,
        0.20,
        "Weighted log-odds fusion\n\nlogit(p) = Σ(wᵢ·logit(pᵢ)) / Σwᵢ\n\nw_checklist = 0.85\nw_cough = 1.00\nw_sputum = 0.70",
        fc="#F3E5F5",
        ec="#6A1B9A",
        fontsize=7.4,
        bold=True,
    )

    # Safety floors
    _box(
        ax,
        0.62,
        0.50,
        0.18,
        0.16,
        "Clinical safety floors\n\n· High checklist concern\n· Hemoptysis / cough+sweats\n· Confident AFB-positive",
        fc="#FCE4EC",
        ec="#C2185B",
        fontsize=7.2,
    )

    # Output
    level = example["risk_level"]
    color = risk_color(level)
    _box(
        ax,
        0.84,
        0.50,
        0.13,
        0.16,
        f"Triage output\n\nP(TB) = {example['fused_prob']:.1%}\n\n{level} risk\n\nPersist session +\ndisclaimer",
        fc="#FFFFFF",
        ec=color,
        fontsize=7.4,
        bold=True,
        lw=2.0,
    )

    _arrow(ax, 0.22, 0.79, 0.34, 0.62, color="#2E7D32", label="w=0.85")
    _arrow(ax, 0.22, 0.59, 0.34, 0.58, color="#1565C0", label="w=1.00")
    _arrow(ax, 0.22, 0.39, 0.34, 0.54, color="#EF6C00", label="w=0.70")
    _arrow(ax, 0.56, 0.58, 0.62, 0.58, color="#6A1B9A")
    _arrow(ax, 0.80, 0.58, 0.84, 0.58, color="#C2185B")

    # Risk bands
    ax.text(
        0.34,
        0.24,
        "Risk bands:  Low < 38%   ·   Moderate 38–62%   ·   High ≥ 62%   (screening triage only — not a diagnosis)",
        ha="left",
        fontsize=7.5,
        color="#455A64",
        style="italic",
    )

    # Data flow footer
    _box(ax, 0.04, 0.08, 0.28, 0.10, "Inputs from screening session\n(checklist JSON + ML API)", fc="#FFFFFF", ec="#90A4AE", fontsize=7.2)
    _box(ax, 0.36, 0.08, 0.28, 0.10, "Computed in mobile app\nfuseTbRisk() · processing.tsx", fc="#FFFFFF", ec="#90A4AE", fontsize=7.2)
    _box(ax, 0.68, 0.08, 0.28, 0.10, "Displayed on result screen\n+ screening history / PDF note", fc="#FFFFFF", ec="#90A4AE", fontsize=7.2)


def draw_result_mockup(ax, example: dict) -> None:
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(
        0.5,
        0.97,
        "(b) Sample multimodal fusion and triage result output (TBhon mobile app)",
        ha="center",
        fontsize=11,
        fontweight="bold",
    )

    # Phone frame
    phone = FancyBboxPatch(
        (0.22, 0.06),
        0.56,
        0.86,
        boxstyle="round,pad=0.02,rounding_size=0.03",
        linewidth=2.0,
        edgecolor="#334155",
        facecolor="#F8FAFC",
    )
    ax.add_patch(phone)

    level = example["risk_level"]
    color = risk_color(level)
    fused_pct = example["fused_prob"] * 100

    # Header risk ring
    cx, cy, r = 0.50, 0.78, 0.09
    ax.add_patch(Circle((cx, cy), r, fill=False, edgecolor=color, linewidth=3.5))
    ax.add_patch(
        Wedge((cx, cy), r, 90, 90 + 360 * example["fused_prob"], width=0.018, facecolor=color, edgecolor="none")
    )
    ax.text(cx, cy + 0.025, level.upper(), ha="center", va="center", fontsize=13, fontweight="bold", color=color)
    ax.text(cx, cy - 0.035, "RISK", ha="center", va="center", fontsize=7, color="#64748B", fontweight="bold")
    ax.text(
        0.50,
        0.66,
        "Triage risk score — not a diagnosis",
        ha="center",
        fontsize=7.5,
        color="#64748B",
        fontweight="bold",
    )

    # Fusion breakdown card
    card = FancyBboxPatch(
        (0.26, 0.22),
        0.48,
        0.40,
        boxstyle="round,pad=0.012,rounding_size=0.015",
        linewidth=1.2,
        edgecolor="#CBD5E1",
        facecolor="#FFFFFF",
    )
    ax.add_patch(card)
    ax.text(0.28, 0.58, "FUSION MODEL BREAKDOWN", ha="left", fontsize=7, color="#64748B", fontweight="bold")

    ax.text(0.28, 0.54, "Combined TB screening probability", ha="left", fontsize=7, color="#64748B")
    ax.text(0.28, 0.49, f"{fused_pct:.1f}", ha="left", fontsize=22, fontweight="bold", color=color)
    ax.text(0.37, 0.495, "%", ha="left", fontsize=9, color="#64748B", fontweight="bold")

    bar_x, bar_y, bar_w = 0.28, 0.455, 0.44
    ax.add_patch(FancyBboxPatch((bar_x, bar_y), bar_w, 0.012, boxstyle="round,pad=0", facecolor="#E2E8F0", edgecolor="none"))
    ax.add_patch(
        FancyBboxPatch(
            (bar_x, bar_y),
            bar_w * example["fused_prob"],
            0.012,
            boxstyle="round,pad=0",
            facecolor=color,
            edgecolor="none",
        )
    )

    # Modality mini-cards
    xs = [0.28, 0.46, 0.64]
    icons = {"checklist": "✓", "cough": "♪", "sputum": "◉"}
    for i, m in enumerate(example["modalities"]):
        x = xs[i] - 0.09
        mc = FancyBboxPatch(
            (x, 0.26),
            0.16,
            0.16,
            boxstyle="round,pad=0.008,rounding_size=0.012",
            linewidth=1.0,
            edgecolor="#E2E8F0",
            facecolor="#F8FAFC",
        )
        ax.add_patch(mc)
        ax.text(x + 0.02, 0.395, icons.get(m["key"], "•"), ha="left", fontsize=8, color="#64748B")
        ax.text(x + 0.04, 0.395, m["label"][:12].upper(), ha="left", fontsize=5.5, color="#64748B", fontweight="bold")
        ax.text(x + 0.02, 0.34, f"{m['prob']*100:.1f}", ha="left", fontsize=11, fontweight="bold", color="#0F172A")
        ax.text(x + 0.08, 0.345, "%", ha="left", fontsize=6, color="#64748B")
        ax.text(
            x + 0.02,
            0.30,
            f"{m['level'].lower()} · w {m['weight']:.2f}",
            ha="left",
            fontsize=5.5,
            color="#64748B",
        )
        ax.text(x + 0.02, 0.275, m["detail"], ha="left", fontsize=5.2, color="#94A3B8")

    ax.text(
        0.50,
        0.14,
        "Weighted log-odds fusion of checklist, cough ML, and sputum ML",
        ha="center",
        fontsize=6.8,
        color="#64748B",
        style="italic",
    )
    ax.text(
        0.50,
        0.10,
        "Refer for GeneXpert / smear / clinical workup when risk is moderate or high",
        ha="center",
        fontsize=6.8,
        color="#B45309",
        fontweight="bold",
    )


def save_workflow(out_path: Path, example: dict) -> None:
    fig, ax = plt.subplots(figsize=(12, 7))
    fig.patch.set_facecolor("white")
    draw_fusion_workflow(ax, example)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_result_mockup(out_path: Path, example: dict) -> None:
    fig, ax = plt.subplots(figsize=(8, 9))
    fig.patch.set_facecolor("white")
    draw_result_mockup(ax, example)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def save_combined(out_path: Path, example: dict) -> None:
    fig = plt.figure(figsize=(13, 13))
    fig.patch.set_facecolor("white")
    gs = fig.add_gridspec(2, 1, height_ratios=[1.0, 1.05], hspace=0.06)
    ax_top = fig.add_subplot(gs[0, 0])
    ax_bot = fig.add_subplot(gs[1, 0])
    draw_fusion_workflow(ax_top, example)
    draw_result_mockup(ax_bot, example)
    fig.suptitle(
        "Figure 6.1.4. Multimodal Risk Fusion Workflow",
        fontsize=13,
        fontweight="bold",
        y=0.995,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> int:
    example = example_fusion()
    save_workflow(OUT_WORKFLOW, example)
    save_result_mockup(OUT_RESULT, example)
    save_combined(OUT_COMBINED, example)
    print("Generated:")
    print(f"  {OUT_COMBINED}")
    print(f"  {OUT_WORKFLOW}")
    print(f"  {OUT_RESULT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
