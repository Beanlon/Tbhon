/**
 * Multimodal TB screening risk fusion.
 *
 * Combines three independent signals via weighted log-odds fusion:
 *   1. Pre-screening checklist (11 yes/no symptom + exposure questions)
 *   2. Cough audio ML probability (hybrid CNN+GBM, mean of valid clips)
 *   3. Sputum smear image ML probability (AFB / load grade)
 *
 * Method: logit(p_fused) = Σ(w_i · logit(p_i)) / Σ(w_i) over available modalities.
 * Weights reflect held-out test reliability of each model/modality.
 *
 * This is a screening triage score — not a diagnosis.
 */

import { SCREENING_CHECKLIST_QUESTIONS } from "../constants/screeningChecklist";

export type RiskLevel = "low" | "moderate" | "high";

export type ChecklistAnswer = {
  id: string;
  value: boolean;
};

/** Per-modality contribution returned for UI / audit trail. */
export type FusionModalityBreakdown = {
  key: "checklist" | "cough" | "sputum";
  label: string;
  available: boolean;
  weight: number;
  probTb: number | null;
  riskLevel: RiskLevel | null;
  detail: string;
};

export type FusionResult = {
  probTb: number;
  riskLevel: RiskLevel;
  checklistLevel: RiskLevel;
  modalities: FusionModalityBreakdown[];
  /** Human-readable summary of how the score was built. */
  method: string;
};

/** Modality reliability weights (held-out test performance / clinical role). */
const MODALITY_WEIGHT = {
  checklist: 0.85,
  cough: 1.0,
  sputum: 0.7,
} as const;

/**
 * Log-odds contribution when a checklist item is answered "yes".
 * Derived from WHO TB symptom-screening priorities (persistent cough, hemoptysis,
 * systemic symptoms, and exposure factors). Higher = stronger TB association.
 */
const CHECKLIST_LOG_ODDS: Record<string, number> = {
  symptom_cough_3w: 1.2,
  symptom_blood_sputum: 2.0,
  symptom_chest_pain: 0.55,
  symptom_fever: 0.75,
  symptom_night_sweats: 1.05,
  symptom_weight_loss: 0.95,
  symptom_fatigue: 0.45,
  symptom_loss_appetite: 0.45,
  risk_contact_tb: 1.45,
  risk_high_burden_travel: 0.65,
  risk_congregate_setting: 0.85,
};

/** Population prior for symptomatic screening populations (log-odds intercept). */
const CHECKLIST_INTERCEPT = -2.4;

/** Risk bands on fused probability (calibrated for screening triage). */
const FUSED_LOW_MAX = 0.38;
const FUSED_MODERATE_MAX = 0.62;

const EPS = 1e-6;

function clamp01(p: number): number {
  return Math.min(1 - EPS, Math.max(EPS, p));
}

function logit(p: number): number {
  const c = clamp01(p);
  return Math.log(c / (1 - c));
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export function probToRiskLevel(p: number): RiskLevel {
  if (!Number.isFinite(p)) return "low";
  if (p >= FUSED_MODERATE_MAX) return "high";
  if (p >= FUSED_LOW_MAX) return "moderate";
  return "low";
}

/** Parse checklist JSON payload from screening navigation / backend storage. */
export function parseChecklistPayload(raw: string | undefined | null): ChecklistAnswer[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as {
      items?: Array<{ id?: string; value?: boolean }>;
    };
    if (!Array.isArray(parsed?.items)) return [];
    return parsed.items
      .filter((it) => typeof it?.id === "string")
      .map((it) => ({ id: it.id as string, value: Boolean(it.value) }));
  } catch {
    return [];
  }
}

function answersToMap(answers: ChecklistAnswer[]): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const a of answers) m.set(a.id, a.value);
  return m;
}

/** Rule-based concern tier (same clinical logic as checklist summary screen). */
export function checklistConcernLevel(answers: ChecklistAnswer[]): RiskLevel {
  const map = answersToMap(answers);
  const symptomYes = SCREENING_CHECKLIST_QUESTIONS.filter(
    (q) => q.category === "symptom" && map.get(q.id) === true,
  ).length;
  const riskYes = SCREENING_CHECKLIST_QUESTIONS.filter(
    (q) => q.category === "risk" && map.get(q.id) === true,
  ).length;

  if (symptomYes >= 3 || (symptomYes >= 2 && riskYes >= 1)) return "high";
  if (symptomYes >= 1 || riskYes >= 2) return "moderate";
  return "low";
}

/** Checklist-only TB probability via weighted logistic symptom model. */
export function checklistToProbTb(answers: ChecklistAnswer[]): number {
  const map = answersToMap(answers);
  let score = CHECKLIST_INTERCEPT;
  for (const q of SCREENING_CHECKLIST_QUESTIONS) {
    if (map.get(q.id) === true) {
      score += CHECKLIST_LOG_ODDS[q.id] ?? 0.4;
    }
  }
  return sigmoid(score);
}

/** Map sputum model output to P(TB | sputum). Prefers explicit class probabilities. */
export function sputumToProbTb(
  load: string,
  confidence: number | null,
  probsJson?: Record<string, number> | null,
): number | null {
  const probs = probsJson ?? null;
  if (probs) {
    const pos = probs.afb_positive;
    if (typeof pos === "number" && Number.isFinite(pos)) return clamp01(pos);
    const high = probs.high;
    const moderate = probs.moderate;
    if (typeof high === "number" || typeof moderate === "number") {
      const h = typeof high === "number" ? high : 0;
      const m = typeof moderate === "number" ? moderate : 0;
      const low = typeof probs.low === "number" ? probs.low : 0;
      const none = typeof probs.none === "number" ? probs.none : 0;
      return clamp01(h * 0.85 + m * 0.55 + low * 0.2 + none * 0.05);
    }
  }

  const x = load.toLowerCase().trim();
  if (!x) return null;
  const conf = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0.65;

  if (x === "afb_positive") return clamp01(0.55 + 0.4 * conf);
  if (x === "afb_negative") return clamp01(0.45 - 0.35 * conf);
  if (x === "high") return clamp01(0.5 + 0.35 * conf);
  if (x === "moderate") return clamp01(0.35 + 0.25 * conf);
  if (x === "low") return clamp01(0.18 + 0.12 * (1 - conf));
  if (x === "none") return clamp01(0.08 + 0.07 * (1 - conf));
  return null;
}

function weightedLogOddsFusion(
  parts: Array<{ prob: number; weight: number }>,
): number {
  if (parts.length === 0) return 0.12;
  let num = 0;
  let den = 0;
  for (const { prob, weight } of parts) {
    num += weight * logit(prob);
    den += weight;
  }
  return sigmoid(num / den);
}

/** Apply clinical safety floors after probabilistic fusion. */
function applySafetyFloors(
  prob: number,
  checklistLevel: RiskLevel,
  answers: ChecklistAnswer[],
  sputumLoad: string,
  sputumConf: number | null,
): number {
  let p = prob;
  const map = answersToMap(answers);

  if (checklistLevel === "high") p = Math.max(p, 0.58);
  else if (checklistLevel === "moderate") p = Math.max(p, 0.42);

  if (map.get("symptom_blood_sputum") === true) p = Math.max(p, 0.52);
  if (map.get("symptom_cough_3w") === true && map.get("symptom_night_sweats") === true) {
    p = Math.max(p, 0.48);
  }

  const load = sputumLoad.toLowerCase();
  const conf = typeof sputumConf === "number" && Number.isFinite(sputumConf) ? sputumConf : 0;
  if (load === "afb_positive" && conf >= 0.45) p = Math.max(p, 0.55);
  if ((load === "high" || load === "moderate") && conf >= 0.55) p = Math.max(p, 0.45);

  return clamp01(p);
}

export type FuseTbRiskInput = {
  checklistJson?: string | null;
  /** Mean TB probability from cough ML across valid clips (0–1). */
  coughProbTb?: number | null;
  /** When true, cough signal is excluded (spoof / quality failure). */
  coughUnavailable?: boolean;
  sputumLoad?: string;
  sputumConfidence?: number | null;
  sputumProbsJson?: string | Record<string, number> | null;
  sputumAnalyzed?: boolean;
};

export function fuseTbRisk(input: FuseTbRiskInput): FusionResult {
  const answers = parseChecklistPayload(input.checklistJson ?? "");
  const checklistLevel = answers.length > 0 ? checklistConcernLevel(answers) : "low";
  const checklistProb = answers.length > 0 ? checklistToProbTb(answers) : null;

  let sputumProbs: Record<string, number> | null = null;
  if (typeof input.sputumProbsJson === "string" && input.sputumProbsJson.trim().length > 0) {
    try {
      const v = JSON.parse(input.sputumProbsJson) as Record<string, number>;
      sputumProbs = v;
    } catch {
      sputumProbs = null;
    }
  } else if (input.sputumProbsJson && typeof input.sputumProbsJson === "object") {
    sputumProbs = input.sputumProbsJson;
  }

  const sputumLoad = typeof input.sputumLoad === "string" ? input.sputumLoad : "";
  const sputumConf =
    typeof input.sputumConfidence === "number" && Number.isFinite(input.sputumConfidence)
      ? input.sputumConfidence
      : null;
  const sputumProb =
    input.sputumAnalyzed && sputumLoad
      ? sputumToProbTb(sputumLoad, sputumConf, sputumProbs)
      : null;

  const coughProb =
    !input.coughUnavailable &&
    typeof input.coughProbTb === "number" &&
    Number.isFinite(input.coughProbTb)
      ? clamp01(input.coughProbTb)
      : null;

  const fusionParts: Array<{ prob: number; weight: number }> = [];
  const modalities: FusionModalityBreakdown[] = [];

  if (checklistProb !== null) {
    fusionParts.push({ prob: checklistProb, weight: MODALITY_WEIGHT.checklist });
    modalities.push({
      key: "checklist",
      label: "Symptoms & exposure",
      available: true,
      weight: MODALITY_WEIGHT.checklist,
      probTb: checklistProb,
      riskLevel: probToRiskLevel(checklistProb),
      detail: `${answers.filter((a) => a.value).length} yes of ${SCREENING_CHECKLIST_QUESTIONS.length} · concern ${checklistLevel}`,
    });
  } else {
    modalities.push({
      key: "checklist",
      label: "Symptoms & exposure",
      available: false,
      weight: MODALITY_WEIGHT.checklist,
      probTb: null,
      riskLevel: null,
      detail: "No checklist answers",
    });
  }

  if (coughProb !== null) {
    fusionParts.push({ prob: coughProb, weight: MODALITY_WEIGHT.cough });
    modalities.push({
      key: "cough",
      label: "Cough audio ML",
      available: true,
      weight: MODALITY_WEIGHT.cough,
      probTb: coughProb,
      riskLevel: probToRiskLevel(coughProb),
      detail: `Hybrid CNN+GBM · mean prob ${(coughProb * 100).toFixed(1)}%`,
    });
  } else {
    modalities.push({
      key: "cough",
      label: "Cough audio ML",
      available: false,
      weight: MODALITY_WEIGHT.cough,
      probTb: null,
      riskLevel: null,
      detail: input.coughUnavailable ? "Excluded (quality check failed)" : "No cough analysis",
    });
  }

  if (sputumProb !== null) {
    fusionParts.push({ prob: sputumProb, weight: MODALITY_WEIGHT.sputum });
    modalities.push({
      key: "sputum",
      label: "Sputum smear ML",
      available: true,
      weight: MODALITY_WEIGHT.sputum,
      probTb: sputumProb,
      riskLevel: probToRiskLevel(sputumProb),
      detail: `${sputumLoad}${sputumConf !== null ? ` · ${(sputumConf * 100).toFixed(0)}% conf` : ""}`,
    });
  } else {
    modalities.push({
      key: "sputum",
      label: "Sputum smear ML",
      available: false,
      weight: MODALITY_WEIGHT.sputum,
      probTb: null,
      riskLevel: null,
      detail: input.sputumAnalyzed ? "Analysis failed" : "Not provided",
    });
  }

  let probTb = weightedLogOddsFusion(fusionParts);
  probTb = applySafetyFloors(probTb, checklistLevel, answers, sputumLoad, sputumConf);

  const riskLevel = probToRiskLevel(probTb);

  return {
    probTb,
    riskLevel,
    checklistLevel,
    modalities,
    method: "Weighted log-odds fusion of checklist, cough ML, and sputum ML (screening triage — not a diagnosis).",
  };
}

/** Serialize breakdown for router params / backend storage. */
export function fusionToNavParams(fusion: FusionResult): {
  probTb: string;
  risk: RiskLevel;
  fusionBreakdown: string;
} {
  return {
    probTb: String(fusion.probTb),
    risk: fusion.riskLevel,
    fusionBreakdown: JSON.stringify({
      probTb: fusion.probTb,
      riskLevel: fusion.riskLevel,
      checklistLevel: fusion.checklistLevel,
      method: fusion.method,
      modalities: fusion.modalities,
    }),
  };
}
