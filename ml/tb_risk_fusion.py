"""Multimodal TB screening risk fusion (Python mirror of mobile/utils/tbRiskFusion.ts).

Combines checklist symptoms, cough ML probability, and sputum ML probability
via weighted log-odds fusion for screening triage.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any

# Canonical checklist question IDs (matches mobile/constants/screeningChecklist.ts)
CHECKLIST_QUESTION_IDS = [
    "symptom_cough_3w",
    "symptom_blood_sputum",
    "symptom_chest_pain",
    "symptom_fever",
    "symptom_night_sweats",
    "symptom_weight_loss",
    "symptom_fatigue",
    "symptom_loss_appetite",
    "risk_contact_tb",
    "risk_high_burden_travel",
    "risk_congregate_setting",
]

SYMPTOM_IDS = CHECKLIST_QUESTION_IDS[:8]
RISK_IDS = CHECKLIST_QUESTION_IDS[8:]

MODALITY_WEIGHT = {
    "checklist": 0.85,
    "cough": 1.0,
    "sputum": 0.7,
}

CHECKLIST_LOG_ODDS: dict[str, float] = {
    "symptom_cough_3w": 1.2,
    "symptom_blood_sputum": 2.0,
    "symptom_chest_pain": 0.55,
    "symptom_fever": 0.75,
    "symptom_night_sweats": 1.05,
    "symptom_weight_loss": 0.95,
    "symptom_fatigue": 0.45,
    "symptom_loss_appetite": 0.45,
    "risk_contact_tb": 1.45,
    "risk_high_burden_travel": 0.65,
    "risk_congregate_setting": 0.85,
}

CHECKLIST_INTERCEPT = -2.4
FUSED_LOW_MAX = 0.38
FUSED_MODERATE_MAX = 0.62
EPS = 1e-6


def _clamp01(p: float) -> float:
    return min(1.0 - EPS, max(EPS, p))


def _logit(p: float) -> float:
    c = _clamp01(p)
    return math.log(c / (1.0 - c))


def _sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def prob_to_risk_level(p: float) -> str:
    if not math.isfinite(p):
        return "low"
    if p >= FUSED_MODERATE_MAX:
        return "high"
    if p >= FUSED_LOW_MAX:
        return "moderate"
    return "low"


def parse_checklist_payload(raw: str | dict | None) -> dict[str, bool]:
    if raw is None:
        return {}
    data: Any = raw
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return {}
    out: dict[str, bool] = {}
    for it in items:
        if isinstance(it, dict) and isinstance(it.get("id"), str):
            out[it["id"]] = bool(it.get("value"))
    return out


def checklist_concern_level(answers: dict[str, bool]) -> str:
    symptom_yes = sum(1 for qid in SYMPTOM_IDS if answers.get(qid) is True)
    risk_yes = sum(1 for qid in RISK_IDS if answers.get(qid) is True)
    if symptom_yes >= 3 or (symptom_yes >= 2 and risk_yes >= 1):
        return "high"
    if symptom_yes >= 1 or risk_yes >= 2:
        return "moderate"
    return "low"


def checklist_to_prob_tb(answers: dict[str, bool]) -> float:
    score = CHECKLIST_INTERCEPT
    for qid in CHECKLIST_QUESTION_IDS:
        if answers.get(qid) is True:
            score += CHECKLIST_LOG_ODDS.get(qid, 0.4)
    return _sigmoid(score)


def sputum_to_prob_tb(
    load: str,
    confidence: float | None,
    probs: dict[str, float] | None = None,
) -> float | None:
    if probs:
        pos = probs.get("afb_positive")
        if isinstance(pos, (int, float)) and math.isfinite(pos):
            return _clamp01(float(pos))
        high = float(probs.get("high", 0) or 0)
        moderate = float(probs.get("moderate", 0) or 0)
        low = float(probs.get("low", 0) or 0)
        none = float(probs.get("none", 0) or 0)
        if any(probs.get(k) is not None for k in ("high", "moderate", "low", "none")):
            return _clamp01(high * 0.85 + moderate * 0.55 + low * 0.2 + none * 0.05)

    x = (load or "").lower().strip()
    if not x:
        return None
    conf = confidence if isinstance(confidence, (int, float)) and math.isfinite(confidence) else 0.65

    if x == "afb_positive":
        return _clamp01(0.55 + 0.4 * conf)
    if x == "afb_negative":
        return _clamp01(0.45 - 0.35 * conf)
    if x == "high":
        return _clamp01(0.5 + 0.35 * conf)
    if x == "moderate":
        return _clamp01(0.35 + 0.25 * conf)
    if x == "low":
        return _clamp01(0.18 + 0.12 * (1.0 - conf))
    if x == "none":
        return _clamp01(0.08 + 0.07 * (1.0 - conf))
    return None


def _weighted_log_odds_fusion(parts: list[tuple[float, float]]) -> float:
    if not parts:
        return 0.12
    num = sum(w * _logit(p) for p, w in parts)
    den = sum(w for _, w in parts)
    return _sigmoid(num / den)


def _apply_safety_floors(
    prob: float,
    checklist_level: str,
    answers: dict[str, bool],
    sputum_load: str,
    sputum_conf: float | None,
) -> float:
    p = prob
    if checklist_level == "high":
        p = max(p, 0.58)
    elif checklist_level == "moderate":
        p = max(p, 0.42)

    if answers.get("symptom_blood_sputum") is True:
        p = max(p, 0.52)
    if answers.get("symptom_cough_3w") is True and answers.get("symptom_night_sweats") is True:
        p = max(p, 0.48)

    load = (sputum_load or "").lower()
    conf = sputum_conf if isinstance(sputum_conf, (int, float)) and math.isfinite(sputum_conf) else 0.0
    if load == "afb_positive" and conf >= 0.45:
        p = max(p, 0.55)
    if load in {"high", "moderate"} and conf >= 0.55:
        p = max(p, 0.45)

    return _clamp01(p)


@dataclass
class FusionResult:
    prob_tb: float
    risk_level: str
    checklist_level: str
    modalities: list[dict[str, Any]] = field(default_factory=list)
    method: str = (
        "Weighted log-odds fusion of checklist, cough ML, and sputum ML "
        "(screening triage — not a diagnosis)."
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "prob_tb": self.prob_tb,
            "risk_level": self.risk_level,
            "checklist_level": self.checklist_level,
            "modalities": self.modalities,
            "method": self.method,
        }


def fuse_tb_risk(
    *,
    checklist: str | dict | None = None,
    cough_prob_tb: float | None = None,
    cough_unavailable: bool = False,
    sputum_load: str = "",
    sputum_confidence: float | None = None,
    sputum_probs: dict[str, float] | str | None = None,
    sputum_analyzed: bool = False,
) -> FusionResult:
    answers = parse_checklist_payload(checklist)
    checklist_level = checklist_concern_level(answers) if answers else "low"
    checklist_prob = checklist_to_prob_tb(answers) if answers else None

    probs_dict: dict[str, float] | None = None
    if isinstance(sputum_probs, str) and sputum_probs.strip():
        try:
            parsed = json.loads(sputum_probs)
            if isinstance(parsed, dict):
                probs_dict = {str(k): float(v) for k, v in parsed.items() if isinstance(v, (int, float))}
        except json.JSONDecodeError:
            probs_dict = None
    elif isinstance(sputum_probs, dict):
        probs_dict = {str(k): float(v) for k, v in sputum_probs.items() if isinstance(v, (int, float))}

    sputum_prob = (
        sputum_to_prob_tb(sputum_load, sputum_confidence, probs_dict)
        if sputum_analyzed and sputum_load
        else None
    )

    cough_prob = (
        _clamp01(float(cough_prob_tb))
        if not cough_unavailable and cough_prob_tb is not None and math.isfinite(float(cough_prob_tb))
        else None
    )

    fusion_parts: list[tuple[float, float]] = []
    modalities: list[dict[str, Any]] = []

    if checklist_prob is not None:
        fusion_parts.append((checklist_prob, MODALITY_WEIGHT["checklist"]))
        yes_count = sum(1 for v in answers.values() if v)
        modalities.append(
            {
                "key": "checklist",
                "label": "Symptoms & exposure",
                "available": True,
                "weight": MODALITY_WEIGHT["checklist"],
                "prob_tb": checklist_prob,
                "risk_level": prob_to_risk_level(checklist_prob),
                "detail": f"{yes_count} yes of {len(CHECKLIST_QUESTION_IDS)} · concern {checklist_level}",
            }
        )
    else:
        modalities.append(
            {
                "key": "checklist",
                "label": "Symptoms & exposure",
                "available": False,
                "weight": MODALITY_WEIGHT["checklist"],
                "prob_tb": None,
                "risk_level": None,
                "detail": "No checklist answers",
            }
        )

    if cough_prob is not None:
        fusion_parts.append((cough_prob, MODALITY_WEIGHT["cough"]))
        modalities.append(
            {
                "key": "cough",
                "label": "Cough audio ML",
                "available": True,
                "weight": MODALITY_WEIGHT["cough"],
                "prob_tb": cough_prob,
                "risk_level": prob_to_risk_level(cough_prob),
                "detail": f"Hybrid CNN+GBM · mean prob {cough_prob * 100:.1f}%",
            }
        )
    else:
        modalities.append(
            {
                "key": "cough",
                "label": "Cough audio ML",
                "available": False,
                "weight": MODALITY_WEIGHT["cough"],
                "prob_tb": None,
                "risk_level": None,
                "detail": "Excluded (quality check failed)" if cough_unavailable else "No cough analysis",
            }
        )

    if sputum_prob is not None:
        fusion_parts.append((sputum_prob, MODALITY_WEIGHT["sputum"]))
        conf_txt = (
            f" · {sputum_confidence * 100:.0f}% conf"
            if isinstance(sputum_confidence, (int, float)) and math.isfinite(sputum_confidence)
            else ""
        )
        modalities.append(
            {
                "key": "sputum",
                "label": "Sputum smear ML",
                "available": True,
                "weight": MODALITY_WEIGHT["sputum"],
                "prob_tb": sputum_prob,
                "risk_level": prob_to_risk_level(sputum_prob),
                "detail": f"{sputum_load}{conf_txt}",
            }
        )
    else:
        modalities.append(
            {
                "key": "sputum",
                "label": "Sputum smear ML",
                "available": False,
                "weight": MODALITY_WEIGHT["sputum"],
                "prob_tb": None,
                "risk_level": None,
                "detail": "Analysis failed" if sputum_analyzed else "Not provided",
            }
        )

    prob_tb = _weighted_log_odds_fusion(fusion_parts)
    prob_tb = _apply_safety_floors(prob_tb, checklist_level, answers, sputum_load, sputum_confidence)

    return FusionResult(
        prob_tb=prob_tb,
        risk_level=prob_to_risk_level(prob_tb),
        checklist_level=checklist_level,
        modalities=modalities,
    )
