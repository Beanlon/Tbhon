import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ApiError,
  getScreening,
  type ScreeningSessionDetail,
} from "../../services/backendApi";
import { SCREENING_CHECKLIST_QUESTIONS } from "../../constants/screeningChecklist";

type RiskLevel = "low" | "moderate" | "high";

/** One row per canonical question; null = no saved answer for that question */
type ChecklistAnswerRow = {
  questionId: string;
  questionText: string;
  category: string;
  answerYes: boolean | null;
};

const RISK_COPY: Record<
  RiskLevel,
  {
    title: string;
    simple: string;
    factors: string[];
    recommendations: string[];
    color: string;
    pillBg: string;
  }
> = {
  low: {
    title: "Low Risk",
    simple: "The system detected patterns that suggest a low likelihood of TB.",
    factors: ["No abnormal cough patterns detected"],
    recommendations: [
      "Monitor symptoms",
      "Re-screen after 3–5 days",
      "Consult a healthcare provider if symptoms persist",
    ],
    color: "#16A34A",
    pillBg: "rgba(22,163,74,0.10)",
  },
  moderate: {
    title: "Moderate Risk",
    simple: "The system detected some patterns that may require further evaluation.",
    factors: ["Some irregular cough patterns detected"],
    recommendations: [
      "Consider re-screening after 1–3 days",
      "Consult a healthcare provider for further evaluation",
      "Seek care sooner if symptoms worsen",
    ],
    color: "#D97706",
    pillBg: "rgba(217,119,6,0.12)",
  },
  high: {
    title: "High Risk",
    simple:
      "The system detected patterns associated with higher TB risk. Further medical evaluation is recommended.",
    factors: ["Irregular cough patterns detected"],
    recommendations: [
      "Consult a healthcare provider as soon as possible",
      "Follow local TB testing guidance",
      "Seek urgent care if you have severe symptoms",
    ],
    color: "#DC2626",
    pillBg: "rgba(220,38,38,0.10)",
  },
};

function parseAudioUris(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length > 0) : [];
  } catch {
    return [];
  }
}

function coerceRisk(raw: string | null | undefined): RiskLevel {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "moderate" || s === "high") return s;
  return "low";
}

function pickSessionId(raw: string | string[] | undefined): string | undefined {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim().length > 0) {
    return raw[0].trim();
  }
  return undefined;
}

function formatPhlegmProbsJson(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const rec = raw as Record<string, number>;
  return Object.entries(rec)
    .map(([k, n]) => `${k}: ${(Number(n) * 100).toFixed(1)}%`)
    .join(" · ");
}

function categorySectionLabel(category: string): string {
  return category.toLowerCase() === "risk" ? "Exposure & risk" : "Symptoms";
}

function coerceBoolish(v: unknown): boolean | undefined {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

function readSessionChecklistPayload(session: unknown): unknown {
  if (!session || typeof session !== "object") return undefined;
  const s = session as Record<string, unknown>;
  return s.checklistPayload ?? s.checklist_payload;
}

/** Parses symptom_responses whether nested `question` exists or IDs are flat on each row. */
function symptomAnswerMapFromApi(session: unknown): Map<string, boolean> {
  const map = new Map<string, boolean>();
  if (!session || typeof session !== "object") return map;
  const s = session as Record<string, unknown>;
  const raw = s.symptomResponses ?? s.symptom_responses;
  if (!Array.isArray(raw)) return map;

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;

    const answerParsed =
      coerceBoolish(rec.answerValue) ??
      coerceBoolish(rec.answer_value);
    if (answerParsed === undefined) continue;

    let questionId = "";
    const qRaw = rec.question;
    if (qRaw && typeof qRaw === "object") {
      const q = qRaw as Record<string, unknown>;
      questionId =
        typeof q.questionId === "string"
          ? q.questionId
          : typeof q.question_id === "string"
            ? q.question_id
            : "";
    }
    if (!questionId) {
      questionId =
        typeof rec.questionId === "string"
          ? rec.questionId
          : typeof rec.question_id === "string"
            ? rec.question_id
            : "";
    }

    if (!questionId) continue;
    map.set(questionId, answerParsed);
  }
  return map;
}

function checklistAnswerMapFromPayload(payload: unknown): Map<string, boolean> {
  const map = new Map<string, boolean>();
  if (!payload || typeof payload !== "object") return map;
  const p = payload as Record<string, unknown>;
  const raw = p.items;
  if (!Array.isArray(raw)) return map;

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id =
      typeof rec.id === "string"
        ? rec.id
        : typeof rec.question_id === "string"
          ? rec.question_id
          : "";
    if (!id) continue;
    const answerParsed = coerceBoolish(rec.value);
    if (answerParsed === undefined) continue;
    map.set(id, answerParsed);
  }
  return map;
}

/** Prefer normalized symptom rows from DB; fill gaps from saved checklist JSON */
function mergeAnswerMaps(primary: Map<string, boolean>, fallback: Map<string, boolean>): Map<string, boolean> {
  const out = new Map(fallback);
  for (const [k, v] of primary) out.set(k, v);
  return out;
}

function buildChecklistRowsFromAnswerMap(map: Map<string, boolean>): ChecklistAnswerRow[] {
  const used = new Set<string>();
  const ordered: ChecklistAnswerRow[] = [];

  for (const q of SCREENING_CHECKLIST_QUESTIONS) {
    used.add(q.id);
    ordered.push({
      questionId: q.id,
      questionText: q.question,
      category: q.category,
      answerYes: map.has(q.id) ? map.get(q.id)! : null,
    });
  }

  for (const [id, val] of map) {
    if (used.has(id)) continue;
    const canonical = SCREENING_CHECKLIST_QUESTIONS.find((x) => x.id === id);
    ordered.push({
      questionId: id,
      questionText: canonical?.question ?? id,
      category: canonical?.category ?? (id.startsWith("risk_") ? "risk" : "symptom"),
      answerYes: val,
    });
  }
  return ordered;
}

function mapSessionToViewModel(s: ScreeningSessionDetail): {
  risk: RiskLevel;
  probTb: number | null;
  audioUris: string[];
  imageUri: string;
  imageAnalyzed: boolean;
  phlegmLoad: string;
  phlegmConf: number | null;
  phlegmFailed: boolean;
  phlegmDetail: string;
  phlegmProbsText: string;
  invalidAudio: boolean;
  invalidLabel: string;
  invalidReasons: string[];
  checklistRows: ChecklistAnswerRow[];
  savedRecommendation: string | null;
  headerSubtitle: string;
} {
  const risk = coerceRisk(s.finalRiskLevel ?? s.result?.riskLevel);

  let probTb: number | null =
    typeof s.averageTbProbability === "number" && Number.isFinite(s.averageTbProbability)
      ? s.averageTbProbability
      : null;
  if (probTb === null) {
    for (const r of s.coughRecordings) {
      const p = r.audioPrediction?.probTb;
      if (typeof p === "number" && Number.isFinite(p)) {
        probTb = p;
        break;
      }
    }
  }

  const audioUris = s.coughRecordings.map((r) => r.fileUri).filter((u) => u.length > 0);

  const img = s.sputumImage;
  const imageUri = img?.fileUri ?? "";
  const pp = img?.phlegmPrediction ?? null;
  const imageAnalyzed = Boolean(pp);
  const phlegmLoad = pp?.predictedLoad ?? "";
  const phlegmConf =
    pp && typeof pp.confidence === "number" && Number.isFinite(pp.confidence)
      ? pp.confidence
      : null;
  const imageProvided = imageUri.length > 0;
  const phlegmFailed = imageProvided && !imageAnalyzed;

  const rawReasons = s.result?.invalidAudioReasonsJson;
  const invalidReasons = Array.isArray(rawReasons)
    ? rawReasons.filter((x): x is string => typeof x === "string")
    : [];

  const fromResponses = symptomAnswerMapFromApi(s);
  const fromPayload = checklistAnswerMapFromPayload(readSessionChecklistPayload(s));
  const merged = mergeAnswerMaps(fromResponses, fromPayload);
  const checklistRows = buildChecklistRowsFromAnswerMap(merged);

  const completed = s.completedAt ? new Date(s.completedAt) : null;
  const headerSubtitle =
    completed && Number.isFinite(completed.getTime())
      ? `Saved screening · ${completed.toLocaleString()}`
      : "Saved screening";

  return {
    risk,
    probTb,
    audioUris,
    imageUri,
    imageAnalyzed,
    phlegmLoad,
    phlegmConf,
    phlegmFailed,
    phlegmDetail: "",
    phlegmProbsText: formatPhlegmProbsJson(pp?.probabilitiesJson),
    invalidAudio: Boolean(s.result?.invalidAudio),
    invalidLabel: s.result?.invalidAudioLabel ?? "",
    invalidReasons,
    checklistRows,
    savedRecommendation: s.result?.recommendation ?? null,
    headerSubtitle,
  };
}

export default function ScreeningDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId?: string;
    risk?: string;
    probTb?: string;
    audioUris?: string;
    imageUri?: string;
    checklist?: string;
    invalidAudio?: string;
    invalidLabel?: string;
    invalidReasons?: string;
    phlegmAnalyzed?: string;
    phlegmLoad?: string;
    phlegmConfidence?: string;
    phlegmProbs?: string;
    phlegmError?: string;
    phlegmErrorDetail?: string;
  }>();

  const sessionId = pickSessionId(params.sessionId);

  const [remoteLoading, setRemoteLoading] = useState(Boolean(sessionId));
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteVm, setRemoteVm] = useState<ReturnType<typeof mapSessionToViewModel> | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistBodyMounted, setChecklistBodyMounted] = useState(false);
  const [checklistContentHeight, setChecklistContentHeight] = useState(0);
  const checklistHeightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setChecklistOpen(false);
    setChecklistBodyMounted(false);
    setChecklistContentHeight(0);
    checklistHeightAnim.setValue(0);
  }, [sessionId]);

  useEffect(() => {
    if (checklistOpen) setChecklistBodyMounted(true);
  }, [checklistOpen]);

  useEffect(() => {
    if (!sessionId) {
      setRemoteLoading(false);
      setRemoteError(null);
      setRemoteVm(null);
      return;
    }
    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError(null);
    void (async () => {
      try {
        const { session } = await getScreening(sessionId);
        if (cancelled) return;
        setRemoteVm(mapSessionToViewModel(session));
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not load screening.";
        setRemoteError(message);
        setRemoteVm(null);
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const paramVm = useMemo(() => {
    if (sessionId) return null;
    const risk: RiskLevel =
      params.risk === "moderate" || params.risk === "high" ? params.risk : "low";
    const probTbRaw = typeof params.probTb === "string" ? Number(params.probTb) : NaN;
    const probTb = Number.isFinite(probTbRaw) ? probTbRaw : null;

    const audioUris = parseAudioUris(params.audioUris);
    const imageUri = typeof params.imageUri === "string" ? params.imageUri : "";
    const imageProvided = imageUri.length > 0;
    const imageAnalyzed = params.phlegmAnalyzed === "1";
    const phlegmLoad = typeof params.phlegmLoad === "string" ? params.phlegmLoad : "";
    const phlegmConfStr =
      typeof params.phlegmConfidence === "string" ? params.phlegmConfidence : "";
    const phlegmConfRaw = phlegmConfStr.length > 0 ? Number(phlegmConfStr) : NaN;
    const phlegmConf = Number.isFinite(phlegmConfRaw) ? phlegmConfRaw : null;
    const phlegmFailed = params.phlegmError === "1";
    const phlegmDetail = typeof params.phlegmErrorDetail === "string" ? params.phlegmErrorDetail : "";

    let phlegmProbsText = "";
    if (typeof params.phlegmProbs === "string" && params.phlegmProbs.length > 0) {
      try {
        const v = JSON.parse(params.phlegmProbs) as Record<string, number>;
        phlegmProbsText = formatPhlegmProbsJson(v);
      } catch {
        phlegmProbsText = "";
      }
    }

    const invalidAudio = params.invalidAudio === "1";
    const invalidLabel = typeof params.invalidLabel === "string" ? params.invalidLabel : "";
    let invalidReasons: string[] = [];
    if (typeof params.invalidReasons === "string" && params.invalidReasons.length > 0) {
      try {
        const v = JSON.parse(params.invalidReasons);
        invalidReasons = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      } catch {
        invalidReasons = [];
      }
    }

    let checklistRows: ChecklistAnswerRow[] = [];
    if (typeof params.checklist === "string" && params.checklist.length > 0) {
      try {
        const v = JSON.parse(params.checklist) as {
          items?: { id?: string; label?: string; value?: boolean }[];
        };
        const items = Array.isArray(v?.items) ? v.items : [];
        const byId = new Map<string, boolean>();
        for (const x of items) {
          if (!x || typeof x.id !== "string" || x.id.length === 0) continue;
          if (typeof x.value !== "boolean") continue;
          byId.set(x.id, x.value);
        }
        checklistRows = SCREENING_CHECKLIST_QUESTIONS.map((q) => ({
          questionId: q.id,
          questionText: q.question,
          category: q.category,
          answerYes: byId.has(q.id) ? byId.get(q.id)! : null,
        }));
      } catch {
        checklistRows = [];
      }
    }

    return {
      risk,
      probTb,
      audioUris,
      imageUri,
      imageAnalyzed,
      phlegmLoad,
      phlegmConf,
      phlegmFailed,
      phlegmDetail,
      phlegmProbsText,
      invalidAudio,
      invalidLabel,
      invalidReasons,
      checklistRows,
      savedRecommendation: null as string | null,
      headerSubtitle: "Inputs & insights",
    };
  }, [sessionId, params]);

  const vm = remoteVm ?? paramVm;

  const risk = vm?.risk ?? "low";
  const probTb = vm?.probTb ?? null;
  const hasProb = probTb !== null && Number.isFinite(probTb);
  const confidence = hasProb && probTb !== null ? Math.max(probTb, 1 - probTb) : NaN;

  const audioUris = vm?.audioUris ?? [];
  const audioAnalyzed = audioUris.length > 0;

  const imageUri = vm?.imageUri ?? "";
  const imageProvided = imageUri.length > 0;
  const imageAnalyzed = vm?.imageAnalyzed ?? false;
  const phlegmLoad = vm?.phlegmLoad ?? "";
  const phlegmConf = vm?.phlegmConf ?? NaN;
  const phlegmFailed = vm?.phlegmFailed ?? false;
  const phlegmDetail = vm?.phlegmDetail ?? "";
  const phlegmProbsText = vm?.phlegmProbsText ?? "";

  const invalidAudio = vm?.invalidAudio ?? false;
  const invalidLabel = vm?.invalidLabel ?? "";
  const invalidReasons = vm?.invalidReasons ?? [];
  const checklistRows = vm?.checklistRows ?? [];
  const checklistAnswered = checklistRows.filter((r) => r.answerYes !== null);
  const checklistYesCount = checklistAnswered.filter((r) => r.answerYes === true).length;
  const checklistNoCount = checklistAnswered.filter((r) => r.answerYes === false).length;
  const hasSavedChecklist = checklistAnswered.length > 0;
  const savedRecommendation = vm?.savedRecommendation ?? null;
  const headerSubtitle = vm?.headerSubtitle ?? "Inputs & insights";

  const checklistCollapsedSubtitle = useMemo(() => {
    if (checklistRows.length === 0) {
      return "Tap to expand checklist details.";
    }
    if (hasSavedChecklist) {
      return `${checklistYesCount} Yes · ${checklistNoCount} No (${checklistAnswered.length} answers)`;
    }
    return `${checklistRows.length} questions · answers not stored`;
  }, [
    checklistAnswered.length,
    checklistNoCount,
    checklistRows.length,
    checklistYesCount,
    hasSavedChecklist,
  ]);

  const toggleChecklistOpen = () => {
    setChecklistOpen((open) => !open);
  };

  const onChecklistContentLayout = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    setChecklistContentHeight((prev) => (h > 0 && prev !== h ? h : prev));
  };

  useEffect(() => {
    const target = checklistOpen ? checklistContentHeight : 0;
    if (checklistOpen && checklistContentHeight === 0) return;
    checklistHeightAnim.stopAnimation();
    Animated.timing(checklistHeightAnim, {
      toValue: target,
      duration: checklistOpen ? 320 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [checklistOpen, checklistContentHeight]);

  const copy = RISK_COPY[risk];

  const Card = ({ title, children }: { title: string; children: ReactNode }) => (
    <View className="mb-3 rounded-3xl border border-slate-200 bg-white p-5">
      <Text className="mb-3 text-base font-bold text-slate-900">{title}</Text>
      {children}
    </View>
  );

  const Bullet = ({ text }: { text: string }) => (
    <View className="mb-2 flex-row items-start gap-3">
      <View className="mt-2 size-2 rounded-full" style={{ backgroundColor: copy.color }} />
      <Text className="flex-1 text-base leading-6 text-slate-700">{text}</Text>
    </View>
  );

  const CheckRow = ({ ok, label, sub }: { ok: boolean; label: string; sub?: string }) => (
    <View className="mb-3 flex-row items-start gap-3">
      <Ionicons name={ok ? "checkmark-circle" : "information-circle"} size={22} color={ok ? "#059669" : "#64748b"} />
      <View className="min-w-0 flex-1">
        <Text className="text-base font-bold text-slate-900">{label}</Text>
        {sub ? <Text className="mt-1 text-sm leading-5 text-slate-500">{sub}</Text> : null}
      </View>
    </View>
  );

  const showRemoteSpinner = Boolean(sessionId) && remoteLoading;
  const showRemoteError = Boolean(sessionId) && !remoteLoading && remoteError;

  return (
    <>
      <StatusBar style="dark" backgroundColor="#f8fafc" translucent={false} />
      <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "right", "bottom", "left"]}>
        <View className="flex-row items-center justify-between border-b border-slate-900/10 bg-slate-50 px-4 pb-3 pt-2 sm:px-5 md:px-6">
          <Pressable
            onPress={() => router.back()}
            className="size-11 items-center justify-center rounded-full bg-slate-900/5 active:bg-slate-900/10"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color="#0f172a" />
          </Pressable>

          <View className="min-w-0 flex-1 items-center px-2">
            <Text className="text-center text-lg font-bold text-slate-900 sm:text-xl" numberOfLines={2}>
              Result Details
            </Text>
            <Text className="mt-1 text-center text-sm font-semibold text-slate-500 sm:text-base" numberOfLines={2}>
              {headerSubtitle}
            </Text>
          </View>

          <View className="size-11" />
        </View>

        <ScrollView
          className="min-h-0 flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="px-4 pb-8 pt-4 sm:px-5 md:px-6">
            {showRemoteSpinner ? (
              <View className="min-h-[240px] items-center justify-center py-16">
                <ActivityIndicator size="large" color="#0f172a" />
                <Text className="mt-3 text-base text-slate-500">Loading screening summary…</Text>
              </View>
            ) : null}

            {showRemoteError ? (
              <View className="mb-4 rounded-3xl border border-red-200 bg-red-50 p-5">
                <Text className="text-base font-bold text-red-900">Could not open summary</Text>
                <Text className="mt-2 text-base leading-6 text-red-800">{remoteError}</Text>
              </View>
            ) : null}

            {!showRemoteSpinner && !showRemoteError && vm ? (
              <>
                {invalidAudio && (
                  <View className="mb-3 rounded-3xl border border-amber-300 bg-amber-50 p-5">
                    <Text className="mb-2 text-base font-bold text-amber-900">Audio authenticity check</Text>
                    <Text className="text-base leading-6 text-amber-900">
                      {invalidLabel === "silence"
                        ? "The recording was too quiet / silent. Please cough once clearly within 3–10 seconds."
                        : invalidLabel === "speech"
                          ? "This sounded more like speech/throat-clearing than a cough. Please record a single clear cough."
                          : invalidLabel === "replay"
                            ? "This may be playback/replay audio. Please record directly from the phone microphone."
                            : invalidLabel === "noise"
                              ? "This sounded like steady background noise. Please move to a quieter place and re-record."
                              : "We couldn’t confidently detect a real cough signal. Please re-record in a quiet environment and cough once clearly."}
                    </Text>
                    {invalidReasons.length > 0 && (
                      <View className="mt-2.5">
                        <Text className="mb-2 text-sm font-bold text-amber-900">Detected issues</Text>
                        {invalidReasons.map((r) => (
                          <Text key={r} className="text-sm leading-5 text-amber-900">
                            - {r}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                <Card title="Risk Breakdown">
                  <View className="mb-3 flex-row items-center justify-between gap-3">
                    <View
                      className="rounded-full border border-slate-900/10 px-4 py-2.5"
                      style={{ backgroundColor: copy.pillBg }}
                    >
                      <Text className="text-base font-bold" style={{ color: copy.color }}>
                        {copy.title}
                      </Text>
                    </View>
                    {hasProb ? (
                      <View className="min-w-0 items-end">
                        <Text className="text-base font-bold text-slate-900">
                          Confidence: {(confidence * 100).toFixed(0)}%
                        </Text>
                        <Text className="text-sm text-slate-500">
                          TB probability: {((probTb as number) * 100).toFixed(1)}%
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-sm font-bold text-slate-500">Confidence: —</Text>
                    )}
                  </View>

                  <Text className="text-base leading-6 text-slate-700">{copy.simple}</Text>
                </Card>

                <View className="mb-3 rounded-3xl border border-slate-200 bg-white p-5">
                  <Pressable
                    onPress={toggleChecklistOpen}
                    className="flex-row items-start justify-between gap-3 active:opacity-75"
                    accessibilityRole="button"
                    accessibilityLabel={
                      checklistOpen ? "Collapse symptoms and exposure checklist" : "Expand symptoms and exposure checklist"
                    }
                    accessibilityState={{ expanded: checklistOpen }}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-base font-bold text-slate-900">Symptoms & exposure checklist</Text>
                      {!checklistOpen ? (
                        <Text className="mt-1 text-sm leading-5 text-slate-500">{checklistCollapsedSubtitle}</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name={checklistOpen ? "chevron-up" : "chevron-down"}
                      size={22}
                      color="#64748b"
                      style={{ marginTop: 2 }}
                    />
                  </Pressable>

                  {checklistBodyMounted ? (
                    <Animated.View
                      pointerEvents={checklistOpen ? "auto" : "none"}
                      style={{
                        height: checklistHeightAnim,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        className="mt-4 border-t border-slate-100 pt-4"
                        style={{ position: "absolute", left: 0, right: 0, top: 0 }}
                        onLayout={onChecklistContentLayout}
                      >
                        {checklistRows.length === 0 ? (
                          <Text className="text-base leading-6 text-slate-600">
                            No checklist data for this view. Complete the symptom checklist before recording, finish while
                            signed in so answers save with your screening, then open Details from results or History.
                          </Text>
                        ) : (
                          <>
                            <Text className="mb-4 text-base leading-6 text-slate-600">
                              {hasSavedChecklist
                                ? "Answers stored with this session (Yes / No)."
                                : sessionId
                                  ? "No checklist answers were stored for this screening. Questions are shown for reference."
                                  : "Answer each question during screening; responses appear here after you finish."}
                            </Text>
                            <View className="gap-3">
                              {checklistRows.map((row) => (
                                <View
                                  key={row.questionId}
                                  className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                                >
                                  <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                                    {categorySectionLabel(row.category)}
                                  </Text>
                                  <Text className="text-base leading-6 text-slate-900">{row.questionText}</Text>
                                  <View className="mt-3 flex-row flex-wrap items-center gap-2">
                                    {row.answerYes === null ? (
                                      <Text className="text-sm font-semibold text-slate-400">Not recorded</Text>
                                    ) : (
                                      <View
                                        className="rounded-full px-3 py-1"
                                        style={{
                                          backgroundColor: row.answerYes
                                            ? "rgba(220,38,38,0.10)"
                                            : "rgba(15,23,42,0.06)",
                                        }}
                                      >
                                        <Text
                                          className="text-sm font-bold"
                                          style={{ color: row.answerYes ? "#B91C1C" : "#475569" }}
                                        >
                                          {row.answerYes ? "Yes" : "No"}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>
                              ))}
                            </View>
                          </>
                        )}
                      </View>
                    </Animated.View>
                  ) : null}
                </View>

                <Card title="Input Summary">
                  <CheckRow
                    ok={audioAnalyzed}
                    label="Cough audio analyzed"
                    sub={audioAnalyzed ? `Clips: ${audioUris.length}` : "No recorded audio was provided."}
                  />
                  <CheckRow
                    ok={imageProvided}
                    label={
                      imageProvided ? "Sputum / phlegm image received" : "Sputum / phlegm skipped (optional)"
                    }
                    sub={
                      imageProvided
                        ? imageAnalyzed
                          ? `AFB load grade: ${phlegmLoad || "—"}${
                              phlegmConf !== null && Number.isFinite(phlegmConf)
                                ? ` (confidence ${(phlegmConf * 100).toFixed(0)}%)`
                                : ""
                            }${phlegmProbsText ? `. ${phlegmProbsText}` : ""}`
                          : phlegmFailed
                            ? phlegmDetail
                              ? `Analysis failed: ${phlegmDetail.slice(0, 200)}`
                              : "Analysis failed — check that infer_api can load ml (phlegm) checkpoints."
                            : "Image captured; analysis not run."
                        : "No sample photo — results use cough audio (and checklist) only."
                    }
                  />
                  <CheckRow
                    ok={hasSavedChecklist}
                    label="Symptoms & exposure checklist"
                    sub={
                      hasSavedChecklist
                        ? `${checklistYesCount} Yes · ${checklistNoCount} No (${checklistAnswered.length} answers)`
                        : "No checklist responses for this session."
                    }
                  />
                </Card>

                <Card title="Factor Insights">
                  {copy.factors.map((t) => (
                    <Bullet key={t} text={t} />
                  ))}
                  {imageAnalyzed && phlegmLoad.length > 0 && (
                    <Bullet
                      text={`Sputum smear model: ${phlegmLoad} AFB load (none / low / moderate / high). This is not a certified diagnosis.`}
                    />
                  )}
                  {!imageAnalyzed && imageProvided && phlegmFailed && (
                    <Bullet text="Phlegm model did not return a result; overall risk may rely on cough audio only." />
                  )}
                </Card>

                <Card title="Recommendations">
                  {savedRecommendation ? (
                    <Text className="text-base leading-6 text-slate-700">{savedRecommendation}</Text>
                  ) : (
                    copy.recommendations.map((t) => <Bullet key={t} text={t} />)
                  )}
                </Card>

                <Card title="Disclaimer">
                  <Text className="text-base italic leading-6 text-slate-600">
                    This result is not a medical diagnosis.
                  </Text>
                </Card>
              </>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
