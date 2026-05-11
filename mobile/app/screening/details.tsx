import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ApiError,
  getScreening,
  type ScreeningSessionDetail,
} from "../../services/backendApi";

type RiskLevel = "low" | "moderate" | "high";

type ChecklistDisplayItem = { id?: string; label: string; value?: boolean };

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
  checklistItems: ChecklistDisplayItem[];
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

  const checklistItems: ChecklistDisplayItem[] = s.symptomResponses
    .filter((x) => x.answerValue === true)
    .map((x) => ({
      id: x.question.questionId,
      label: x.question.questionText,
      value: true,
    }));

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
    checklistItems,
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

    let checklistItems: ChecklistDisplayItem[] = [];
    if (typeof params.checklist === "string" && params.checklist.length > 0) {
      try {
        const v = JSON.parse(params.checklist) as {
          items?: { id?: string; label?: string; value?: boolean }[];
        };
        const items = Array.isArray(v?.items) ? v.items : [];
        checklistItems = items.filter(
          (x): x is ChecklistDisplayItem & { label: string } =>
            Boolean(x && x.value === true && typeof x.label === "string" && x.label.length > 0),
        );
      } catch {
        checklistItems = [];
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
      checklistItems,
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
  const checklistItems = vm?.checklistItems ?? [];
  const savedRecommendation = vm?.savedRecommendation ?? null;
  const headerSubtitle = vm?.headerSubtitle ?? "Inputs & insights";

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
                    ok={checklistItems.length > 0}
                    label="Symptoms & exposure checklist"
                    sub={
                      checklistItems.length
                        ? `Selected: ${checklistItems.map((x) => x.label).slice(0, 5).join(" · ")}${checklistItems.length > 5 ? " …" : ""}`
                        : "No checklist items selected."
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
