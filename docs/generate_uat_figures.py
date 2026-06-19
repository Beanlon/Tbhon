"""Generate UAT and ISO summary bar charts for Chapter 6."""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "docs" / "figures"
SUMMARY = ROOT / "docs" / "uat_summary.json"


def _bar_chart(labels: list[str], values: list[float], title: str, out: Path, ylim: tuple[float, float] = (3.0, 5.1)) -> None:
    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    colors = ["#1565C0" if v >= 4.5 else "#FB8C00" if v >= 3.5 else "#C62828" for v in values]
    bars = ax.bar(labels, values, color=colors, edgecolor="#263238", linewidth=0.8)
    ax.axhline(4.5, color="#2E7D32", linestyle="--", linewidth=1.0, label="SA threshold (4.50)")
    ax.set_ylim(*ylim)
    ax.set_ylabel("Weighted Mean (1–5 Likert)")
    ax.set_title(title, fontsize=12, fontweight="bold")
    ax.grid(axis="y", alpha=0.25)
    for bar, val in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.03, f"{val:.2f}", ha="center", va="bottom", fontsize=9)
    plt.xticks(rotation=15, ha="right")
    plt.tight_layout()
    fig.savefig(out, dpi=180, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    FIG.mkdir(parents=True, exist_ok=True)
    summary = json.loads(SUMMARY.read_text(encoding="utf-8"))

    iso_labels = [
        "Functional",
        "Performance",
        "Usability",
        "Reliability",
        "Security",
        "Satisfaction",
        "Grand Mean",
    ]
    iso_values = [
        summary["dimensions"]["functional"]["mean"],
        summary["dimensions"]["performance"]["mean"],
        summary["dimensions"]["usability"]["mean"],
        summary["dimensions"]["reliability"]["mean"],
        summary["dimensions"]["security"]["mean"],
        summary["dimensions"]["satisfaction"]["mean"],
        summary["grand_mean"],
    ]
    _bar_chart(
        iso_labels,
        iso_values,
        f"ISO/IEC 25010 Software Quality Evaluation (n = {summary['n']})",
        FIG / "figure_6_7_1_iso_quality_summary.png",
    )

    uat_labels = list(summary["evaluation_areas"].keys())
    uat_values = [summary["evaluation_areas"][k]["mean"] for k in uat_labels]
    _bar_chart(
        uat_labels,
        uat_values,
        f"User Acceptance Testing Summary (n = {summary['n']})",
        FIG / "figure_6_6_1_uat_summary.png",
    )

    ratings = summary["overall_ratings"]
    fig, ax = plt.subplots(figsize=(6.5, 4.2))
    labels = [r["rating"] for r in ratings]
    freqs = [r["frequency"] for r in ratings]
    ax.bar(labels, freqs, color="#1565C0", edgecolor="#263238")
    ax.set_ylabel("Frequency")
    ax.set_title(f"Overall UAT Performance Rating (n = {summary['n']})", fontweight="bold")
    for i, (lbl, f) in enumerate(zip(labels, freqs)):
        pct = summary["overall_ratings"][i]["percentage"]
        ax.text(i, f + 0.05, f"{f} ({pct}%)", ha="center", va="bottom", fontsize=9)
    plt.tight_layout()
    fig.savefig(FIG / "figure_6_6_2_uat_overall_rating.png", dpi=180, bbox_inches="tight")
    plt.close(fig)
    print("Wrote UAT/ISO figures")


if __name__ == "__main__":
    main()
