"""Compute UAT/ISO summary statistics from docs/uat_scores.json."""
from __future__ import annotations

import json
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "uat_scores.json"
OUT = ROOT / "docs" / "uat_summary.json"


def likert_interp(value: float) -> str:
    if value >= 4.50:
        return "SA"
    if value >= 3.50:
        return "A"
    if value >= 2.50:
        return "N"
    if value >= 1.50:
        return "D"
    return "SD"


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    evaluators = payload["evaluators"]
    dims = payload["dimensions"]
    n = len(evaluators)

    dim_means: dict[str, float] = {}
    for key, spec in dims.items():
        idx = [i - 1 for i in spec["items"]]
        per_eval = [mean(ev["scores"][i] for i in idx) for ev in evaluators]
        dim_means[key] = mean(per_eval)

    all_scores = [mean(ev["scores"]) for ev in evaluators]
    grand_mean = mean(all_scores)

    overall_counts: dict[str, int] = {}
    for ev in evaluators:
        rating = ev["overall_rating"]
        overall_counts[rating] = overall_counts.get(rating, 0) + 1

    summary = {
        "n": n,
        "grand_mean": round(grand_mean, 2),
        "grand_mean_interp": likert_interp(grand_mean),
        "dimensions": {
            key: {
                "label": dims[key]["label"],
                "mean": round(dim_means[key], 2),
                "interpretation": likert_interp(dim_means[key]),
            }
            for key in dims
        },
        "evaluation_areas": {
            "Ease of Use": {
                "mean": round(dim_means["usability"], 2),
                "interpretation": likert_interp(dim_means["usability"]),
            },
            "Accessibility": {
                "mean": round(dim_means["functional"], 2),
                "interpretation": likert_interp(dim_means["functional"]),
            },
            "Responsiveness": {
                "mean": round(dim_means["performance"], 2),
                "interpretation": likert_interp(dim_means["performance"]),
            },
            "User Satisfaction": {
                "mean": round(dim_means["satisfaction"], 2),
                "interpretation": likert_interp(dim_means["satisfaction"]),
            },
        },
        "overall_ratings": [
            {
                "rating": rating,
                "frequency": count,
                "percentage": round(100.0 * count / n, 1),
            }
            for rating, count in sorted(
                overall_counts.items(),
                key=lambda x: ["Excellent", "Good", "Fair", "Poor", "Very Poor"].index(x[0]),
            )
        ],
        "evaluators": [
            {
                "name": ev["name"],
                "role": ev["role"],
                "organization": ev["organization"],
                "date": ev["date"],
                "overall_rating": ev["overall_rating"],
                "mean_24": round(mean(ev["scores"]), 2),
            }
            for ev in evaluators
        ],
    }
    OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
