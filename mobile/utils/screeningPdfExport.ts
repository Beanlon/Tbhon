import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { TBHON_LOGO } from "../constants/branding";
import { SCREENING_CHECKLIST_QUESTIONS } from "../constants/screeningChecklist";
import type { FusionModalityBreakdown } from "./tbRiskFusion";

export type ScreeningPdfChecklistRow = {
  question: string;
  category: string;
  answer: "Yes" | "No" | "Not answered";
};

export type ScreeningPdfExportData = {
  completedAt?: string | null;
  riskLevel: "low" | "moderate" | "high";
  riskTitle: string;
  riskSummary: string;
  tbProbabilityPercent?: number | null;
  riskBreakdown: string[];
  inputSummary: string[];
  checklistRows: ScreeningPdfChecklistRow[];
  recommendations: string[];
};

const PDF_DISCLAIMER =
  "This report is a screening aid only and is not a medical diagnosis. Consult a healthcare professional for care decisions.";

const PDF_MEDIA_DISCLAIMER =
  "Cough audio replay and sputum image analysis feedback are available only inside the TBhon app and are not included in this PDF export.";

const RISK_COLORS: Record<string, string> = {
  low: "#16A34A",
  moderate: "#D97706",
  high: "#DC2626",
};

let logoDataUriPromise: Promise<string> | null = null;

async function loadLogoDataUri(): Promise<string> {
  if (!logoDataUriPromise) {
    logoDataUriPromise = (async () => {
      try {
        const asset = Asset.fromModule(TBHON_LOGO);
        await asset.downloadAsync();
        if (!asset.localUri) return "";
        const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return `data:image/png;base64,${base64}`;
      } catch {
        return "";
      }
    })();
  }
  return logoDataUriPromise;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(completedAt?: string | null): string {
  if (!completedAt) return new Date().toLocaleString();
  const d = new Date(completedAt);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : completedAt;
}

function categoryLabel(category: string): string {
  return category.toLowerCase() === "risk" ? "Exposure & risk" : "Symptoms";
}

export function fusionFactorsFromModalities(modalities: FusionModalityBreakdown[]): string[] {
  const lines = modalities
    .filter((m) => m.available && typeof m.probTb === "number")
    .map(
      (m) =>
        `${m.label}: ${((m.probTb as number) * 100).toFixed(1)}% TB signal (${m.riskLevel ?? "—"} risk)`,
    );
  return lines.length > 0 ? lines : ["Limited screening inputs available for this session."];
}

export function checklistRowsFromJson(raw: string | undefined): ScreeningPdfChecklistRow[] {
  if (!raw || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as { items?: unknown[] };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        const id = typeof rec.id === "string" ? rec.id : "";
        const canonical = SCREENING_CHECKLIST_QUESTIONS.find((q) => q.id === id);
        const question =
          typeof rec.label === "string"
            ? rec.label
            : canonical?.question ?? id;
        const category = canonical?.category ?? (id.startsWith("risk_") ? "risk" : "symptom");
        let answer: ScreeningPdfChecklistRow["answer"] = "Not answered";
        if (rec.value === true || rec.value === "true" || rec.value === 1) answer = "Yes";
        if (rec.value === false || rec.value === "false" || rec.value === 0) answer = "No";
        return { question, category: categoryLabel(category), answer };
      })
      .filter((r): r is ScreeningPdfChecklistRow => r !== null);
  } catch {
    return [];
  }
}

export async function buildScreeningPdfHtml(data: ScreeningPdfExportData): Promise<string> {
  const logo = await loadLogoDataUri();
  const accent = RISK_COLORS[data.riskLevel] ?? "#334155";
  const dateStr = formatDate(data.completedAt);
  const probLine =
    typeof data.tbProbabilityPercent === "number" && Number.isFinite(data.tbProbabilityPercent)
      ? `<p class="meta"><strong>Overall TB probability:</strong> ${data.tbProbabilityPercent.toFixed(1)}%</p>`
      : "";

  const breakdownItems =
    data.riskBreakdown.length > 0
      ? data.riskBreakdown.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
      : "<li>No detailed breakdown available.</li>";

  const inputItems =
    data.inputSummary.length > 0
      ? data.inputSummary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
      : "<li>No input summary available.</li>";

  const checklistRows =
    data.checklistRows.length > 0
      ? data.checklistRows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.question)}</td><td class="answer">${escapeHtml(row.answer)}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="3" class="empty">No checklist answers recorded.</td></tr>`;

  const recommendationItems = data.recommendations
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 28pt 32pt; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #0F172A; font-size: 11pt; line-height: 1.45; }
    .header { display: flex; align-items: center; gap: 16pt; margin-bottom: 18pt; padding-bottom: 14pt; border-bottom: 2px solid #E2E8F0; }
    .logo { height: 44pt; width: auto; }
    .brand { flex: 1; }
    .brand h1 { margin: 0; font-size: 20pt; color: #0B1530; letter-spacing: -0.3px; }
    .brand p { margin: 4pt 0 0; color: #64748B; font-size: 10pt; }
    .risk-banner { background: ${accent}14; border-left: 4px solid ${accent}; padding: 12pt 14pt; border-radius: 6pt; margin-bottom: 16pt; }
    .risk-banner h2 { margin: 0 0 4pt; color: ${accent}; font-size: 16pt; }
    .risk-banner p { margin: 0; color: #334155; }
    .meta { color: #64748B; font-size: 10pt; margin: 0 0 14pt; }
    h3 { margin: 18pt 0 8pt; font-size: 12pt; color: #0B1530; text-transform: uppercase; letter-spacing: 0.6px; }
    ul { margin: 0; padding-left: 18pt; }
    li { margin-bottom: 5pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 6pt; font-size: 10pt; }
    th, td { border: 1px solid #E2E8F0; padding: 7pt 8pt; text-align: left; vertical-align: top; }
    th { background: #F8FAFC; color: #475569; font-weight: 600; }
    td.answer { font-weight: 600; white-space: nowrap; width: 88pt; }
    td.empty { text-align: center; color: #94A3B8; font-style: italic; }
    .disclaimer { margin-top: 20pt; padding: 12pt; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6pt; font-size: 9.5pt; color: #475569; }
    .disclaimer strong { color: #334155; }
    .footer { margin-top: 14pt; font-size: 9pt; color: #94A3B8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    ${logo ? `<img class="logo" src="${logo}" alt="TBhon" />` : ""}
    <div class="brand">
      <h1>TBhon Screening Report</h1>
      <p>Personal TB pre-screening summary</p>
    </div>
  </div>

  <p class="meta"><strong>Date:</strong> ${escapeHtml(dateStr)}</p>

  <div class="risk-banner">
    <h2>${escapeHtml(data.riskTitle)}</h2>
    <p>${escapeHtml(data.riskSummary)}</p>
  </div>
  ${probLine}

  <h3>Risk breakdown</h3>
  <ul>${breakdownItems}</ul>

  <h3>Input summary</h3>
  <ul>${inputItems}</ul>

  <h3>Symptom checklist</h3>
  <table>
    <thead><tr><th>Section</th><th>Question</th><th>Answer</th></tr></thead>
    <tbody>${checklistRows}</tbody>
  </table>

  <h3>Recommended action</h3>
  <ul>${recommendationItems}</ul>

  <div class="disclaimer">
    <p><strong>Disclaimer:</strong> ${escapeHtml(PDF_DISCLAIMER)}</p>
    <p style="margin-top:8pt;">${escapeHtml(PDF_MEDIA_DISCLAIMER)}</p>
  </div>

  <p class="footer">Generated by TBhon · Screening aid only</p>
</body>
</html>`;
}

export async function shareScreeningPdf(data: ScreeningPdfExportData): Promise<void> {
  const html = await buildScreeningPdfHtml(data);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    UTI: Platform.OS === "ios" ? "com.adobe.pdf" : undefined,
    mimeType: "application/pdf",
    dialogTitle: "TBhon screening report",
  });
}

function formatPhlegmLoadLabel(load: string): string {
  const x = load.toLowerCase();
  if (x === "afb_positive") return "AFB detected";
  if (x === "afb_negative") return "AFB not detected";
  return load || "Not analyzed";
}

type DetailsPdfSource = {
  risk: "low" | "moderate" | "high";
  riskTitle: string;
  riskSummary: string;
  probTb: number | null;
  fusionModalities: FusionModalityBreakdown[];
  fusionFactors: string[];
  checklistRows: { questionText: string; category: string; answerYes: boolean | null }[];
  recommendations: string[];
  savedRecommendation: string | null;
  completedAt: string | null;
  audioCount: number;
  invalidAudio: boolean;
  invalidLabel: string;
  imageProvided: boolean;
  imageAnalyzed: boolean;
  phlegmLoad: string;
  phlegmConf: number | null;
  phlegmFailed: boolean;
};

export function buildDetailsPdfExport(source: DetailsPdfSource): ScreeningPdfExportData {
  const riskBreakdown = [...source.fusionFactors];
  if (source.imageAnalyzed && source.phlegmLoad.length > 0) {
    riskBreakdown.push(
      `Sputum smear model: ${formatPhlegmLoadLabel(source.phlegmLoad)} (screening signal, not a certified diagnosis).`,
    );
  }
  if (!source.imageAnalyzed && source.imageProvided && source.phlegmFailed) {
    riskBreakdown.push("Phlegm model did not return a result; fusion used checklist and cough signals only.");
  }

  const inputSummary: string[] = [];
  const answered = source.checklistRows.filter((r) => r.answerYes !== null).length;
  inputSummary.push(
    answered > 0
      ? `Symptom checklist: ${answered} of ${source.checklistRows.length} questions answered.`
      : "Symptom checklist: no saved answers.",
  );
  if (source.invalidAudio) {
    inputSummary.push(
      `Cough audio: authenticity check flagged (${source.invalidLabel || "see app for details"}).`,
    );
  } else if (source.audioCount > 0) {
    const prob =
      source.probTb !== null && Number.isFinite(source.probTb)
        ? ` · ${(source.probTb * 100).toFixed(1)}% TB signal`
        : "";
    inputSummary.push(`Cough audio: ${source.audioCount} recording(s) analyzed${prob}.`);
  } else {
    inputSummary.push("Cough audio: no recordings stored for this session.");
  }
  if (source.imageProvided && source.imageAnalyzed) {
    const conf =
      source.phlegmConf !== null && Number.isFinite(source.phlegmConf)
        ? ` (${(source.phlegmConf * 100).toFixed(0)}% model confidence)`
        : "";
    inputSummary.push(`Sputum image: analyzed — ${formatPhlegmLoadLabel(source.phlegmLoad)}${conf}.`);
  } else if (source.imageProvided) {
    inputSummary.push("Sputum image: captured but analysis unavailable.");
  } else {
    inputSummary.push("Sputum image: not provided.");
  }

  const checklistRows: ScreeningPdfChecklistRow[] = source.checklistRows.map((row) => ({
    question: row.questionText,
    category: categoryLabel(row.category),
    answer: row.answerYes === null ? "Not answered" : row.answerYes ? "Yes" : "No",
  }));

  const recommendations = source.savedRecommendation
    ? [source.savedRecommendation]
    : source.recommendations;

  return {
    completedAt: source.completedAt,
    riskLevel: source.risk,
    riskTitle: source.riskTitle,
    riskSummary: source.riskSummary,
    tbProbabilityPercent:
      source.probTb !== null && Number.isFinite(source.probTb) ? source.probTb * 100 : null,
    riskBreakdown,
    inputSummary,
    checklistRows,
    recommendations,
  };
}

type ResultPdfSource = {
  risk: "low" | "moderate" | "high";
  riskTitle: string;
  riskSummary: string;
  recommendation: string;
  probTb: number | null;
  fusionModalities: FusionModalityBreakdown[];
  checklistJson: string;
  invalidAudio: boolean;
  invalidLabel: string;
  audioCount: number;
  phlegmAnalyzed: boolean;
  phlegmLoad: string;
  phlegmConfidence: number | null;
  phlegmFailed: boolean;
  imageProvided: boolean;
};

export function buildResultPdfExport(source: ResultPdfSource): ScreeningPdfExportData {
  const fusionFactors = fusionFactorsFromModalities(source.fusionModalities);
  const riskBreakdown = [...fusionFactors];
  if (source.phlegmAnalyzed && source.phlegmLoad.length > 0) {
    riskBreakdown.push(`Sputum smear model: ${formatPhlegmLoadLabel(source.phlegmLoad)}.`);
  }

  const checklistRows = checklistRowsFromJson(source.checklistJson);
  const inputSummary: string[] = [
    checklistRows.length > 0
      ? `Symptom checklist: ${checklistRows.filter((r) => r.answer !== "Not answered").length} answers recorded.`
      : "Symptom checklist: no answers recorded.",
  ];
  if (source.invalidAudio) {
    inputSummary.push(`Cough audio: flagged (${source.invalidLabel || "see app"}).`);
  } else if (source.audioCount > 0) {
    inputSummary.push(`Cough audio: ${source.audioCount} clip(s) included in screening.`);
  } else {
    inputSummary.push("Cough audio: not available.");
  }
  if (source.phlegmAnalyzed) {
    inputSummary.push(`Sputum image: ${formatPhlegmLoadLabel(source.phlegmLoad)}.`);
  } else if (source.imageProvided) {
    inputSummary.push("Sputum image: provided; analysis pending or unavailable.");
  } else {
    inputSummary.push("Sputum image: not provided.");
  }

  return {
    riskLevel: source.risk,
    riskTitle: source.riskTitle,
    riskSummary: source.riskSummary,
    tbProbabilityPercent:
      source.probTb !== null && Number.isFinite(source.probTb) ? source.probTb * 100 : null,
    riskBreakdown,
    inputSummary,
    checklistRows,
    recommendations: [source.recommendation],
  };
}
