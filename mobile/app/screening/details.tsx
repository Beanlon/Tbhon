import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Audio } from "expo-av";
import type { AVPlaybackStatus } from "expo-av/build/AV.types";
import {
  ApiError,
  buildServerSputumImageUrl,
  downloadSessionCoughToCache,
  getAuthMediaHeaders,
  getMe,
  getScreening,
  getScreeningPatientAccess,
  patchScreeningReferral,
  resolveMediaUrl,
  type ScreeningSessionDetail,
} from "../../services/backendApi";
import SputumSamplePhoto from "../components/SputumSamplePhoto";
import PatientRecoveryPanel from "./PatientRecoveryPanel";
import PatientSlipPanel from "./PatientSlipPanel";
import { SCREENING_CHECKLIST_QUESTIONS } from "../../constants/screeningChecklist";
import { SPUTUM_DETAILS_MISSING_LABEL, formatSputumDetailsMissingSub } from "../../constants/iotScreening";
import { DETAILS_CHECKLIST_EMPTY_HINT } from "../../constants/screeningBoothCopy";
import { REFERRAL_STATUS_LABELS, canRunScreenings, resolveUserRole, type ReferralStatus } from "../../constants/userRole";
import { useTheme } from "../../contexts/ThemeContext";
import { fuseTbRisk, type FusionModalityBreakdown } from "../../utils/tbRiskFusion";
import { peekProfile, setCachedProfile } from "../../utils/profileCache";
import { ensureNotificationInboxUser, markSessionScreeningNotificationsRead } from "../../utils/notificationInbox";
import {
  isEmailVerified,
  promptEmailVerification,
} from "../../utils/emailVerifiedGate";
import { buildDetailsPdfExport, shareScreeningPdf } from "../../utils/screeningPdfExport";
import {
  ADD_PATIENT_DETAILS,
  CLIENT_RECORD_TITLE,
  NO_PATIENT_ON_FILE,
  PATIENT_NOT_RECORDED,
  PATIENT_DETAILS_SCREEN_TITLE,
  STAFF_DETAILS_SCREEN_TITLE,
} from "../../constants/accountModel";
import { formatClientFullName, formatClientSubtitle, buildClientDetailRows, type ClientDetailRow } from "../../utils/clientDisplay";

type RiskLevel = "low" | "moderate" | "high";

/** One row per canonical question; null = no saved answer for that question */
type ChecklistAnswerRow = {
  questionId: string;
  questionText: string;
  category: string;
  answerYes: boolean | null;
};

type CoughPlaybackClip = {
  uri: string;
  recordingId?: string;
  mimeType?: string | null;
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

function formatPhlegmLoadLabel(load: string): string {
  const x = load.toLowerCase();
  if (x === "afb_positive") return "AFB detected";
  if (x === "afb_negative") return "AFB not detected";
  return load || "—";
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

function checklistJsonFromRows(rows: ChecklistAnswerRow[]): string {
  const items = rows
    .filter((r) => r.answerYes !== null)
    .map((r) => ({
      id: r.questionId,
      label: r.questionText,
      value: r.answerYes === true,
    }));
  return JSON.stringify({ version: 2, items });
}

function meanCoughProbFromSession(s: ScreeningSessionDetail): number | null {
  const probs = s.coughRecordings
    .map((r) => r.audioPrediction?.probTb)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
  if (probs.length === 0) return null;
  return probs.reduce((a, b) => a + b, 0) / probs.length;
}

function fusionFactorsFromModalities(modalities: FusionModalityBreakdown[]): string[] {
  const lines = modalities
    .filter((m) => m.available && typeof m.probTb === "number")
    .map(
      (m) =>
        `${m.label}: ${((m.probTb as number) * 100).toFixed(1)}% TB signal (${m.riskLevel ?? "—"} risk)`,
    );
  return lines.length > 0 ? lines : ["Limited screening inputs available for this session."];
}

function mapSessionToViewModel(s: ScreeningSessionDetail): {
  risk: RiskLevel;
  probTb: number | null;
  fusionModalities: FusionModalityBreakdown[];
  fusionMethod: string;
  audioClips: CoughPlaybackClip[];
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
  completedAt: string | null;
  clientName: string;
  clientSubtitle: string;
  clientDetailRows: ClientDetailRow[];
  sputumSkipReason: string | null;
  staffNotes: string | null;
  referralStatus: ReferralStatus;
  referralNotes: string | null;
  awaitingSputum: boolean;
  sputumDeferReason: string | null;
  sputumFinalizedAt: string | null;
  preliminaryRiskLevel: string | null;
  coughProbForFinalize: number | null;
  wasDeviceSession: boolean;
} {
  const risk = coerceRisk(s.finalRiskLevel ?? s.result?.riskLevel);

  const coughProb = meanCoughProbFromSession(s);
  const invalidAudio = Boolean(s.result?.invalidAudio);

  const fromResponses = symptomAnswerMapFromApi(s);
  const fromPayload = checklistAnswerMapFromPayload(readSessionChecklistPayload(s));
  const merged = mergeAnswerMaps(fromResponses, fromPayload);
  const checklistRows = buildChecklistRowsFromAnswerMap(merged);

  const img = s.sputumImage ?? null;
  const pp = img?.phlegmPrediction ?? null;
  const phlegmLoad = pp?.predictedLoad ?? "";
  const phlegmConf =
    pp && typeof pp.confidence === "number" && Number.isFinite(pp.confidence)
      ? pp.confidence
      : null;

  let phlegmProbs: Record<string, number> | null = null;
  if (pp?.probabilitiesJson && typeof pp.probabilitiesJson === "object") {
    phlegmProbs = pp.probabilitiesJson as Record<string, number>;
  }

  const fusion = fuseTbRisk({
    checklistJson: checklistJsonFromRows(checklistRows),
    coughProbTb: coughProb,
    coughUnavailable: invalidAudio || coughProb === null,
    sputumLoad: phlegmLoad,
    sputumConfidence: phlegmConf,
    sputumProbsJson: phlegmProbs,
    sputumAnalyzed: Boolean(pp),
  });

  let probTb: number | null =
    typeof s.averageTbProbability === "number" && Number.isFinite(s.averageTbProbability)
      ? s.averageTbProbability
      : fusion.probTb;

  // Only server-persisted media (hasRawData + fileUrl). Never use phone-local file:// paths.
  const audioClips: CoughPlaybackClip[] = s.coughRecordings.flatMap((r) => {
    if (!r.hasRawData || typeof r.fileUrl !== "string" || r.fileUrl.length === 0) return [];
    const uri = resolveMediaUrl(r.fileUrl) ?? "";
    if (uri.length === 0) return [];
    const clip: CoughPlaybackClip = { uri };
    if (typeof r.recordingId === "string") clip.recordingId = r.recordingId;
    if (r.mimeType != null) clip.mimeType = r.mimeType;
    return [clip];
  });

  const imageUri = buildServerSputumImageUrl(s.sessionId, img) ?? "";
  const imageAnalyzed = Boolean(pp);
  const imageProvided = Boolean(img?.hasRawData && imageUri.length > 0);
  const phlegmFailed = imageProvided && !imageAnalyzed;

  const rawReasons = s.result?.invalidAudioReasonsJson;
  const invalidReasons = Array.isArray(rawReasons)
    ? rawReasons.filter((x): x is string => typeof x === "string")
    : [];
  const invalidLabel = s.result?.invalidAudioLabel ?? "";

  const completed = s.completedAt ? new Date(s.completedAt) : null;
  const headerSubtitle =
    completed && Number.isFinite(completed.getTime())
      ? `${formatClientFullName(s.client)} · ${completed.toLocaleString()}`
      : formatClientFullName(s.client);

  return {
    risk,
    probTb,
    fusionModalities: fusion.modalities,
    fusionMethod: fusion.method,
    audioClips,
    imageUri,
    imageAnalyzed,
    phlegmLoad,
    phlegmConf,
    phlegmFailed,
    phlegmDetail: "",
    phlegmProbsText: formatPhlegmProbsJson(pp?.probabilitiesJson),
    invalidAudio,
    invalidLabel,
    invalidReasons,
    checklistRows,
    savedRecommendation: s.result?.recommendation ?? null,
    headerSubtitle,
    completedAt: s.completedAt ?? null,
    clientName: formatClientFullName(s.client),
    clientSubtitle: formatClientSubtitle(s.client),
    clientDetailRows: buildClientDetailRows(s.client),
    sputumSkipReason: s.sputumSkipReason ?? null,
    staffNotes: s.staffNotes ?? null,
    referralStatus: (s.result?.referralStatus as ReferralStatus | undefined) ?? "none",
    referralNotes: s.result?.referralNotes ?? null,
    awaitingSputum: s.awaitingSputum === true,
    sputumDeferReason: s.sputumDeferReason ?? null,
    sputumFinalizedAt: s.sputumFinalizedAt ?? null,
    preliminaryRiskLevel: s.preliminaryRiskLevel ?? null,
    // Re-fusion at finalize needs the pure cough probability (mean of audio
    // predictions), not the stored fused average which already folds in checklist.
    coughProbForFinalize: coughProb,
    wasDeviceSession: s.coughRecordings.some((r) => r.source === "iot"),
  };
}

function DetailsCard({
  title,
  children,
  cardBorder,
  cardBg,
  textColor,
}: {
  title: string;
  children: ReactNode;
  cardBorder: string;
  cardBg: string;
  textColor: string;
}) {
  return (
    <View className="mb-3 rounded-3xl border p-5" style={{ borderColor: cardBorder, backgroundColor: cardBg }}>
      <Text className="mb-3 text-base font-bold" style={{ color: textColor }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function DetailsBullet({
  text,
  accentColor,
  textSecondary,
}: {
  text: string;
  accentColor: string;
  textSecondary: string;
}) {
  return (
    <View className="mb-2 flex-row items-start gap-3">
      <View className="mt-2 size-2 rounded-full" style={{ backgroundColor: accentColor }} />
      <Text className="flex-1 text-base leading-6" style={{ color: textSecondary }}>
        {text}
      </Text>
    </View>
  );
}

function DetailsCheckRow({
  ok,
  label,
  sub,
  successColor,
  textMuted,
  textColor,
}: {
  ok: boolean;
  label: string;
  sub?: string;
  successColor: string;
  textMuted: string;
  textColor: string;
}) {
  return (
    <View className="mb-3 flex-row items-start gap-3">
      <Ionicons name={ok ? "checkmark-circle" : "information-circle"} size={22} color={ok ? successColor : textMuted} />
      <View className="min-w-0 flex-1">
        <Text className="text-base font-bold" style={{ color: textColor }}>
          {label}
        </Text>
        {sub ? <Text className="mt-1 text-sm leading-5" style={{ color: textMuted }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const SputumSampleCard = memo(function SputumSampleCard({
  sessionId,
  imageUri,
  imageProvided,
  onOpenViewer,
  cardBorder,
  cardBg,
  textColor,
}: {
  sessionId?: string;
  imageUri: string;
  imageProvided: boolean;
  onOpenViewer: () => void;
  cardBorder: string;
  cardBg: string;
  textColor: string;
}) {
  return (
    <DetailsCard title="Sputum smear" cardBorder={cardBorder} cardBg={cardBg} textColor={textColor}>
      <SputumSamplePhoto
        sessionId={sessionId}
        uri={imageUri}
        height={260}
        onPress={imageProvided ? onOpenViewer : undefined}
      />
    </DetailsCard>
  );
});

export default function ScreeningDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerPadTop = Math.max(insets.top, 16) + 10;
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{
    sessionId?: string;
    from?: string;
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
    fusionBreakdown?: string;
    sputumSkipReason?: string;
    resultStage?: string;
    sputumDeferReason?: string;
    deviceSputum?: string;
  }>();

  const fromScreeningFlow = params.from === "result";

  const sessionId = pickSessionId(params.sessionId);

  const [remoteLoading, setRemoteLoading] = useState(Boolean(sessionId));
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteVm, setRemoteVm] = useState<ReturnType<typeof mapSessionToViewModel> | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistBodyMounted, setChecklistBodyMounted] = useState(false);
  const [checklistContentHeight, setChecklistContentHeight] = useState(0);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerHeaders, setViewerHeaders] = useState<Record<string, string> | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [loadingAudioIndex, setLoadingAudioIndex] = useState<number | null>(null);
  const playingIndexRef = useRef<number | null>(null);
  const [audioHint, setAudioHint] = useState<string | null>(null);
  const soundRef = useRef<InstanceType<typeof Audio.Sound> | null>(null);
  const checklistHeightAnim = useRef(new Animated.Value(0)).current;

  // Unload audio on unmount to prevent leaks
  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    setChecklistOpen(false);
    setChecklistBodyMounted(false);
    setChecklistContentHeight(0);
    checklistHeightAnim.setValue(0);
    setImageViewerVisible(false);
    setPlayingIndex(null);
    setLoadingAudioIndex(null);
    playingIndexRef.current = null;
    setAudioHint(null);
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      void sound.stopAsync().catch(() => {});
      void sound.unloadAsync().catch(() => {});
    }
  }, [sessionId, checklistHeightAnim]);

  useEffect(() => {
    if (checklistOpen) setChecklistBodyMounted(true);
  }, [checklistOpen]);

  const loadRemoteSession = useCallback(
    async (showSpinner: boolean) => {
      if (!sessionId) return;
      if (showSpinner) {
        setRemoteLoading(true);
        setRemoteError(null);
        setRemoteVm(null);
      }
      try {
        const { session } = await getScreening(sessionId);
        if (session.sessionId !== sessionId) {
          throw new Error("Screening session mismatch.");
        }
        setRemoteVm(mapSessionToViewModel(session));
        if (showSpinner) setRemoteError(null);
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not load screening.";
        if (showSpinner) {
          setRemoteError(message);
          setRemoteVm(null);
        }
      } finally {
        if (showSpinner) setRemoteLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (!sessionId) {
      setRemoteLoading(false);
      setRemoteError(null);
      setRemoteVm(null);
      return;
    }
    void loadRemoteSession(true);
  }, [sessionId, loadRemoteSession]);

  useFocusEffect(
    useCallback(() => {
      if (sessionId) void loadRemoteSession(false);
    }, [sessionId, loadRemoteSession]),
  );

  const paramVm = useMemo(() => {
    if (sessionId) return null;
    const risk: RiskLevel =
      params.risk === "moderate" || params.risk === "high" ? params.risk : "low";
    const probTbRaw = typeof params.probTb === "string" ? Number(params.probTb) : NaN;
    let probTb = Number.isFinite(probTbRaw) ? probTbRaw : null;

    const audioClips: CoughPlaybackClip[] = parseAudioUris(params.audioUris)
      .filter(
        (u) => !u.toLowerCase().startsWith("file://") && !u.toLowerCase().startsWith("content://"),
      )
      .map((uri) => ({ uri }));
    const imageUri = "";
    const imageAnalyzed = params.phlegmAnalyzed === "1";
    const phlegmLoad = typeof params.phlegmLoad === "string" ? params.phlegmLoad : "";
    const phlegmConfStr =
      typeof params.phlegmConfidence === "string" ? params.phlegmConfidence : "";
    const phlegmConfRaw = phlegmConfStr.length > 0 ? Number(phlegmConfStr) : NaN;
    const phlegmConf = Number.isFinite(phlegmConfRaw) ? phlegmConfRaw : null;
    const phlegmFailed = params.phlegmError === "1";
    const phlegmDetail = typeof params.phlegmErrorDetail === "string" ? params.phlegmErrorDetail : "";

    let phlegmProbs: Record<string, number> | null = null;
    let phlegmProbsText = "";
    if (typeof params.phlegmProbs === "string" && params.phlegmProbs.length > 0) {
      try {
        const v = JSON.parse(params.phlegmProbs) as Record<string, number>;
        phlegmProbs = v;
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

    let fusionModalities: FusionModalityBreakdown[] = [];
    let fusionMethod = "";
    if (typeof params.fusionBreakdown === "string" && params.fusionBreakdown.length > 0) {
      try {
        const fb = JSON.parse(params.fusionBreakdown) as {
          modalities?: FusionModalityBreakdown[];
          method?: string;
        };
        fusionModalities = Array.isArray(fb.modalities) ? fb.modalities : [];
        fusionMethod = typeof fb.method === "string" ? fb.method : "";
      } catch {
        fusionModalities = [];
      }
    }
    if (fusionModalities.length === 0) {
      const checklistJson =
        typeof params.checklist === "string" && params.checklist.length > 0
          ? params.checklist
          : checklistJsonFromRows(checklistRows);
      const fusion = fuseTbRisk({
        checklistJson,
        coughProbTb: probTb,
        coughUnavailable: invalidAudio || probTb === null,
        sputumLoad: phlegmLoad,
        sputumConfidence: phlegmConf,
        sputumProbsJson: phlegmProbs,
        sputumAnalyzed: imageAnalyzed,
      });
      fusionModalities = fusion.modalities;
      fusionMethod = fusion.method;
      if (probTb === null) probTb = fusion.probTb;
    }

    return {
      risk,
      probTb,
      fusionModalities,
      fusionMethod,
      audioClips,
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
      completedAt: null,
      clientName: PATIENT_NOT_RECORDED,
      clientSubtitle: NO_PATIENT_ON_FILE,
      clientDetailRows: [],
      sputumSkipReason: null,
      staffNotes: null,
      referralStatus: "none" as ReferralStatus,
      referralNotes: null,
      awaitingSputum: params.resultStage === "preliminary",
      sputumDeferReason:
        typeof params.sputumDeferReason === "string" && params.sputumDeferReason.length > 0
          ? params.sputumDeferReason
          : null,
      sputumFinalizedAt: null,
      preliminaryRiskLevel: null,
      coughProbForFinalize: probTb,
      wasDeviceSession: params.deviceSputum === "1",
    };
  }, [sessionId, params]);

  const vm = remoteVm ?? paramVm;

  useEffect(() => {
    if (!sessionId || remoteLoading || remoteVm?.imageUri) return;

    let cancelled = false;
    const pollForServerImage = async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2500));
        if (cancelled) return;
        try {
          const { session } = await getScreening(sessionId);
          if (cancelled || session.sessionId !== sessionId) return;
          const nextVm = mapSessionToViewModel(session);
          setRemoteVm(nextVm);
          if (nextVm.imageUri) return;
        } catch {
          // The regular detail loader owns visible errors; this is only a media refresh.
        }
      }
    };

    void pollForServerImage();
    return () => {
      cancelled = true;
    };
  }, [remoteLoading, remoteVm?.imageUri, sessionId]);

  const risk = vm?.risk ?? "low";
  const probTb = vm?.probTb ?? null;
  const hasProb = probTb !== null && Number.isFinite(probTb);
  const confidence = hasProb && probTb !== null ? Math.max(probTb, 1 - probTb) : NaN;

  const audioClips = vm?.audioClips ?? [];
  const audioAnalyzed = audioClips.length > 0;

  const imageUri = vm?.imageUri ?? "";
  const imageProvided = imageUri.length > 0;
  const resolvedImageUri = useMemo(() => {
    if (!imageProvided) return "";
    if (imageUri.startsWith("iot://")) return "";
    return resolveMediaUrl(imageUri) || imageUri;
  }, [imageProvided, imageUri]);
  const viewerNeedsAuth = useMemo(
    () => /^https?:\/\//i.test(resolvedImageUri),
    [resolvedImageUri],
  );

  useEffect(() => {
    if (!imageViewerVisible || !viewerNeedsAuth) {
      setViewerHeaders(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const h = await getAuthMediaHeaders();
        if (!cancelled) setViewerHeaders(h);
      } catch {
        if (!cancelled) setViewerHeaders(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageViewerVisible, viewerNeedsAuth]);
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
  const clientName = vm?.clientName ?? PATIENT_NOT_RECORDED;
  const clientSubtitle = vm?.clientSubtitle ?? NO_PATIENT_ON_FILE;
  const clientDetailRows = vm?.clientDetailRows ?? [];
  const sputumSkipReasonDisplay =
    vm?.sputumSkipReason ??
    (typeof params.sputumSkipReason === "string" && params.sputumSkipReason.trim().length > 0
      ? params.sputumSkipReason.trim()
      : null);
  const staffNotesDisplay = vm?.staffNotes ?? null;
  const referralStatus = vm?.referralStatus ?? "none";
  const awaitingSputum = vm?.awaitingSputum ?? false;
  const sputumDeferReasonDisplay = vm?.sputumDeferReason ?? null;
  const sputumFinalizedAt = vm?.sputumFinalizedAt ?? null;
  const coughProbForFinalize = vm?.coughProbForFinalize ?? null;
  const wasDeviceSession = vm?.wasDeviceSession ?? false;
  const detailsSessionId =
    typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId.trim() : "";
  const [referralNotesDraft, setReferralNotesDraft] = useState("");
  const [referralSaving, setReferralSaving] = useState(false);
  const [isStaffBooth, setIsStaffBooth] = useState(() => {
    const role = resolveUserRole(peekProfile()?.role);
    return role ? canRunScreenings(role) : false;
  });

  useEffect(() => {
    void (async () => {
      let role = resolveUserRole(peekProfile()?.role);
      if (!role) {
        try {
          const { user } = await getMe();
          setCachedProfile(user);
          role = resolveUserRole(user.role);
        } catch {
          role = null;
        }
      }
      setIsStaffBooth(role ? canRunScreenings(role) : false);
    })();
  }, []);

  const markDetailsScreeningNotificationsRead = useCallback(() => {
    if (!detailsSessionId) return;
    ensureNotificationInboxUser(peekProfile()?.userId);
    void markSessionScreeningNotificationsRead(detailsSessionId);
  }, [detailsSessionId]);

  useEffect(() => {
    markDetailsScreeningNotificationsRead();
  }, [markDetailsScreeningNotificationsRead]);

  useFocusEffect(
    useCallback(() => {
      markDetailsScreeningNotificationsRead();
    }, [markDetailsScreeningNotificationsRead]),
  );

  useEffect(() => {
    setReferralNotesDraft(vm?.referralNotes ?? "");
  }, [vm?.referralNotes]);

  const saveReferralStatus = useCallback(
    async (next: ReferralStatus) => {
      if (!detailsSessionId) return;
      setReferralSaving(true);
      try {
        await patchScreeningReferral({
          sessionId: detailsSessionId,
          referralStatus: next,
          referralNotes: referralNotesDraft.trim(),
        });
        await loadRemoteSession(false);
      } catch (e) {
        Alert.alert(
          "Referral update failed",
          e instanceof ApiError ? e.message : "Could not save referral status.",
        );
      } finally {
        setReferralSaving(false);
      }
    },
    [detailsSessionId, loadRemoteSession, referralNotesDraft],
  );

  const hasPatientDetails = clientName !== PATIENT_NOT_RECORDED;
  const canShowPatientDetails = isStaffBooth && hasPatientDetails;
  const patientHeaderSubtitle = useMemo(() => {
    if (!vm?.completedAt) return "Screening result";
    const completed = new Date(vm.completedAt);
    return Number.isFinite(completed.getTime()) ? completed.toLocaleString() : "Screening result";
  }, [vm?.completedAt]);
  const visibleHeaderSubtitle = isStaffBooth ? headerSubtitle : patientHeaderSubtitle;

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
  const fusionModalities = vm?.fusionModalities ?? [];
  const fusionMethod = vm?.fusionMethod ?? "";
  const fusionFactors = useMemo(
    () => fusionFactorsFromModalities(fusionModalities),
    [fusionModalities],
  );
  const handleDownloadPdf = useCallback(
    async (overrideClaimUrl?: string | null) => {
      if (!vm) return;

      let profile = peekProfile();
      if (!isEmailVerified(profile)) {
        try {
          const { user } = await getMe();
          setCachedProfile(user);
          profile = user;
        } catch {
          // use cached profile if any
        }
      }
      if (!isEmailVerified(profile)) {
        promptEmailVerification(router, profile);
        return;
      }

      try {
        let patientClaimUrl = overrideClaimUrl ?? null;
        if (!patientClaimUrl && detailsSessionId && isStaffBooth) {
          try {
            const access = await getScreeningPatientAccess(detailsSessionId);
            patientClaimUrl = access.claimUrl;
          } catch {
            // Claimed, expired, or unavailable — PDF still exports without QR block.
          }
        }

        const pdfData = buildDetailsPdfExport({
          risk,
          riskTitle: copy.title,
          riskSummary: copy.simple,
          probTb: hasProb && probTb !== null ? probTb : null,
          fusionModalities,
          fusionFactors,
          checklistRows,
          recommendations: copy.recommendations,
          savedRecommendation,
          completedAt: vm.completedAt,
          audioCount: audioClips.length,
          invalidAudio,
          invalidLabel,
          imageProvided,
          imageAnalyzed,
          phlegmLoad,
          phlegmConf: Number.isFinite(phlegmConf) ? phlegmConf : null,
          phlegmFailed,
          patientName: canShowPatientDetails ? clientName : null,
          patientDetailRows: canShowPatientDetails ? clientDetailRows : [],
          patientClaimUrl,
        });
        await shareScreeningPdf(pdfData);
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not create PDF.";
        Alert.alert("Download PDF", message);
      }
    },
    [
      audioClips.length,
      checklistRows,
      clientDetailRows,
      clientName,
      copy.recommendations,
      copy.simple,
      copy.title,
      detailsSessionId,
      fusionFactors,
      fusionModalities,
      canShowPatientDetails,
      hasProb,
      imageAnalyzed,
      imageProvided,
      invalidAudio,
      invalidLabel,
      isStaffBooth,
      phlegmConf,
      phlegmFailed,
      phlegmLoad,
      probTb,
      risk,
      router,
      savedRecommendation,
      vm,
    ],
  );

  const handleShareSlipPdf = useCallback(
    (claimUrl: string) => handleDownloadPdf(claimUrl),
    [handleDownloadPdf],
  );

  const handleOpenImageViewer = useCallback(() => {
    setImageViewerVisible(true);
  }, []);

  const handleAddSmear = useCallback(() => {
    if (!detailsSessionId) return;
    const checklistJson = checklistJsonFromRows(checklistRows);
    router.push({
      pathname: wasDeviceSession ? "/screening/iot-sputum" : "/screening/phlegm",
      params: {
        sessionId: detailsSessionId,
        finalizeMode: "1",
        returnToSession: "1",
        audioDone: "1",
        ...(coughProbForFinalize !== null && Number.isFinite(coughProbForFinalize)
          ? { coughProbTb: String(coughProbForFinalize) }
          : {}),
        ...(checklistJson && checklistJson !== "{}" ? { checklist: checklistJson } : {}),
        ...(wasDeviceSession ? { iotMode: "1", deviceSputum: "1" } : {}),
      },
    } as never);
  }, [detailsSessionId, wasDeviceSession, coughProbForFinalize, checklistRows, router]);

  const showRemoteSpinner = Boolean(sessionId) && remoteLoading;
  const showRemoteError = Boolean(sessionId) && !remoteLoading && remoteError;

  const stopCurrentSound = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    playingIndexRef.current = null;
    setPlayingIndex(null);
    setLoadingAudioIndex(null);
    if (s) {
      await s.stopAsync().catch(() => {});
      await s.unloadAsync().catch(() => {});
    }
  }, []);

  const resolvePlaybackUri = useCallback(
    async (clip: CoughPlaybackClip): Promise<string> => {
      const isRemote = /^https?:\/\//i.test(clip.uri);
      if (!isRemote || !sessionId) return clip.uri;

      const recordingId =
        clip.recordingId ??
        clip.uri.match(/\/cough-recordings\/([^/?#]+)\/file/i)?.[1] ??
        "";
      if (!recordingId) return clip.uri;

      return downloadSessionCoughToCache(sessionId, recordingId, clip.mimeType);
    },
    [sessionId],
  );

  const playAudioAt = useCallback(async (index: number) => {
    // Tap again while playing = stop
    if (playingIndexRef.current === index) {
      await stopCurrentSound();
      return;
    }

    const clip = audioClips[index];
    if (!clip?.uri) {
      setAudioHint("Playback is not available for this clip.");
      return;
    }

    setAudioHint(null);
    // Stop any currently playing clip first
    await stopCurrentSound();

    playingIndexRef.current = index;
    setPlayingIndex(index);
    setLoadingAudioIndex(index);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const playUri = await resolvePlaybackUri(clip);
      if (playingIndexRef.current !== index) return;

      setAudioHint(null);
      const sound = new Audio.Sound();
      soundRef.current = sound;
      await sound.loadAsync({ uri: playUri }, { shouldPlay: true });
      if (playingIndexRef.current === index) {
        setLoadingAudioIndex(null);
      }

      // Cancelled while loading (user tapped stop during network fetch)
      if (soundRef.current !== sound) {
        void sound.stopAsync().catch(() => {});
        void sound.unloadAsync().catch(() => {});
        return;
      }

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.setOnPlaybackStatusUpdate(null);
          if (soundRef.current === sound) {
            soundRef.current = null;
            playingIndexRef.current = null;
          }
          setPlayingIndex((current) => (current === index ? null : current));
          setLoadingAudioIndex((current) => (current === index ? null : current));
          void sound.unloadAsync().catch(() => {});
        }
      });
    } catch (e) {
      if (soundRef.current === null || soundRef.current === undefined) {
        // Already stopped externally, no need to update UI
        return;
      }
      soundRef.current = null;
      playingIndexRef.current = null;
      setLoadingAudioIndex(null);
      setAudioHint(
        `Could not play this recording: ${e instanceof Error ? e.message : String(e)}`,
      );
      setPlayingIndex(null);
    }
  }, [audioClips, resolvePlaybackUri, stopCurrentSound]);

  return (
    <>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["right", "bottom", "left"]}>
        <View
          className="flex-row items-center justify-between px-4 pb-3 sm:px-5 md:px-6"
          style={{ paddingTop: headerPadTop, borderBottomWidth: 1, borderBottomColor: colors.borderLight, backgroundColor: colors.background }}
        >
          <Pressable
            onPress={() => {
              if (fromScreeningFlow) {
                router.replace("/home/HomeScreen" as any);
              } else {
                router.back();
              }
            }}
            className="size-11 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surfaceAlt }}
            accessibilityRole="button"
            accessibilityLabel={fromScreeningFlow ? "Go to home" : "Go back"}
          >
            <Ionicons name={fromScreeningFlow ? "home-outline" : "chevron-back"} size={22} color={colors.text} />
          </Pressable>

          <View className="min-w-0 flex-1 items-center px-2">
            <Text className="text-center text-lg font-bold sm:text-xl" style={{ color: colors.text }} numberOfLines={2}>
              {isStaffBooth ? STAFF_DETAILS_SCREEN_TITLE : PATIENT_DETAILS_SCREEN_TITLE}
            </Text>
            <Text className="mt-1 text-center text-sm font-semibold sm:text-base" style={{ color: colors.textMuted }} numberOfLines={2}>
              {visibleHeaderSubtitle}
            </Text>
          </View>

          <Pressable
            onPress={() => void handleDownloadPdf()}
            className="size-11 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surfaceAlt }}
            accessibilityRole="button"
            accessibilityLabel="Download screening PDF"
          >
            <Ionicons name="download-outline" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          className="min-h-0 flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="px-4 pb-8 pt-4 sm:px-5 md:px-6">
            {showRemoteSpinner ? (
              <View className="min-h-[240px] items-center justify-center py-16">
                <ActivityIndicator size="large" color={colors.primary} />
                <Text className="mt-3 text-base" style={{ color: colors.textMuted }}>Loading screening summary…</Text>
              </View>
            ) : null}

            {showRemoteError ? (
              <View className="mb-4 rounded-3xl border p-5" style={{ borderColor: colors.error, backgroundColor: colors.errorBg }}>
                <Text className="text-base font-bold" style={{ color: colors.error }}>Could not open summary</Text>
                <Text className="mt-2 text-base leading-6" style={{ color: colors.error }}>{remoteError}</Text>
              </View>
            ) : null}

            {!showRemoteSpinner && !showRemoteError && vm ? (
              <>
                {invalidAudio && (
                  <View className="mb-3 rounded-3xl border border-amber-300 bg-amber-50 p-5">
                    <Text className="mb-2 text-base font-bold" style={{ color: "#92400E" }}>Audio authenticity check</Text>
                    <Text className="text-base leading-6" style={{ color: "#92400E" }}>
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
                        <Text className="mb-2 text-sm font-bold" style={{ color: "#92400E" }}>Detected issues</Text>
                        {invalidReasons.map((r) => (
                          <Text key={r} className="text-sm leading-5" style={{ color: "#92400E" }}>
                            - {r}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {awaitingSputum ? (
                  <View
                    className="mb-3 rounded-3xl border p-5"
                    style={{ borderColor: "#D97706", backgroundColor: isDark ? "rgba(217,119,6,0.12)" : "#FFFBEB" }}
                  >
                    <View className="mb-1.5 flex-row items-center gap-2">
                      <Ionicons name="hourglass-outline" size={18} color="#D97706" />
                      <Text className="text-base font-extrabold" style={{ color: "#D97706" }}>
                        Sputum smear pending
                      </Text>
                    </View>
                    <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
                      This is a preliminary result from cough and symptoms. Add the sputum smear to finalize the triage score — it may change after the smear is analyzed.
                    </Text>
                    {sputumDeferReasonDisplay ? (
                      <Text className="mt-2 text-xs leading-5" style={{ color: colors.textMuted }}>
                        Staff noted: {sputumDeferReasonDisplay}
                      </Text>
                    ) : null}
                    {isStaffBooth && detailsSessionId.length > 0 ? (
                      <Pressable
                        onPress={handleAddSmear}
                        className="mt-4 flex-row items-center justify-center gap-2 rounded-xl py-3.5 active:opacity-90"
                        style={{ backgroundColor: "#D97706" }}
                        accessibilityRole="button"
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
                        <Text className="text-sm font-bold text-white">Add sputum smear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {sputumFinalizedAt && !awaitingSputum ? (
                  <View
                    className="mb-3 rounded-3xl border p-4"
                    style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
                  >
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="checkmark-done-circle-outline" size={18} color="#16A34A" />
                      <Text className="text-sm font-bold" style={{ color: colors.text }}>
                        Result updated after sputum smear
                      </Text>
                    </View>
                    <Text className="mt-1 text-xs leading-5" style={{ color: colors.textMuted }}>
                      Smear added {new Date(sputumFinalizedAt).toLocaleString()}.
                      {vm?.preliminaryRiskLevel
                        ? ` Preliminary was ${vm.preliminaryRiskLevel}.`
                        : ""}
                    </Text>
                  </View>
                ) : null}

                {isStaffBooth ? (
                  <DetailsCard
                    title={CLIENT_RECORD_TITLE}
                    cardBorder={colors.cardBorder}
                    cardBg={colors.card}
                    textColor={colors.text}
                  >
                    <Text className="text-base font-bold" style={{ color: colors.text }}>{clientName}</Text>
                    <Text className="mt-1 text-sm leading-5" style={{ color: colors.textMuted }}>{clientSubtitle}</Text>
                    {clientDetailRows.map((row) => (
                      <View key={row.label} className="mt-3">
                        <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                          {row.label}
                        </Text>
                        <Text className="mt-1 text-sm leading-5" style={{ color: colors.textSecondary }}>
                          {row.value}
                        </Text>
                      </View>
                    ))}
                    {!hasPatientDetails && detailsSessionId.length > 0 ? (
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: "/screening/client-intake",
                            params: { sessionId: detailsSessionId, from: "details" },
                          } as any)
                        }
                        className="mt-4 flex-row items-center justify-center gap-2 rounded-xl border py-3"
                        style={{ borderColor: colors.primary, backgroundColor: colors.primaryLight }}
                      >
                        <Ionicons name="person-add-outline" size={18} color={colors.primary} />
                        <Text className="text-sm font-bold" style={{ color: colors.primary }}>
                          {ADD_PATIENT_DETAILS}
                        </Text>
                      </Pressable>
                    ) : null}
                  </DetailsCard>
                ) : null}

                {detailsSessionId && isStaffBooth ? (
                  <PatientSlipPanel sessionId={detailsSessionId} onSharePdf={handleShareSlipPdf} />
                ) : null}

                {detailsSessionId && isStaffBooth ? <PatientRecoveryPanel sessionId={detailsSessionId} /> : null}

                <DetailsCard
                  title="Risk Breakdown"
                  cardBorder={colors.cardBorder}
                  cardBg={colors.card}
                  textColor={colors.text}
                >
                  <View className="mb-3 flex-row items-center justify-between gap-3">
                    <View
                      className="rounded-full border px-4 py-2.5"
                      style={{ backgroundColor: copy.pillBg, borderColor: colors.borderLight }}
                    >
                      <Text className="text-base font-bold" style={{ color: copy.color }}>
                        {copy.title}
                      </Text>
                    </View>
                    {hasProb ? (
                      <View className="min-w-0 items-end">
                        <Text className="text-base font-bold" style={{ color: colors.text }}>
                          Confidence: {(confidence * 100).toFixed(0)}%
                        </Text>
                        <Text className="text-sm" style={{ color: colors.textMuted }}>
                          Fused TB probability: {((probTb as number) * 100).toFixed(1)}%
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-sm font-bold" style={{ color: colors.textMuted }}>Confidence: —</Text>
                    )}
                  </View>

                  <Text className="text-base leading-6" style={{ color: colors.textSecondary }}>{copy.simple}</Text>
                  {fusionMethod.length > 0 ? (
                    <Text className="mt-3 text-sm italic leading-5" style={{ color: colors.textMuted }}>
                      {fusionMethod}
                    </Text>
                  ) : null}
                </DetailsCard>

                <DetailsCard
                  title="Input Summary"
                  cardBorder={colors.cardBorder}
                  cardBg={colors.card}
                  textColor={colors.text}
                >
                  <DetailsCheckRow
                    ok={audioAnalyzed}
                    label="Cough audio analyzed"
                    sub={audioAnalyzed ? `Clips: ${audioClips.length}` : "No recorded audio was provided."}
                    successColor={colors.success}
                    textMuted={colors.textMuted}
                    textColor={colors.text}
                  />
                  <DetailsCheckRow
                    ok={imageProvided}
                    label={
                      imageProvided ? "Sputum smear captured" : SPUTUM_DETAILS_MISSING_LABEL
                    }
                    sub={
                      imageProvided
                        ? imageAnalyzed
                          ? `Sputum screening: ${formatPhlegmLoadLabel(phlegmLoad)}${
                              phlegmConf !== null && Number.isFinite(phlegmConf)
                                ? ` (confidence ${(phlegmConf * 100).toFixed(0)}%)`
                                : ""
                            }${phlegmProbsText ? `. ${phlegmProbsText}` : ""}`
                          : phlegmFailed
                            ? phlegmDetail
                              ? `Analysis failed: ${phlegmDetail.slice(0, 200)}`
                              : "Analysis could not be completed for the sputum smear image."
                            : "Smear captured; analysis not run."
                        : formatSputumDetailsMissingSub(sputumSkipReasonDisplay ?? undefined)
                    }
                    successColor={colors.success}
                    textMuted={colors.textMuted}
                    textColor={colors.text}
                  />
                </DetailsCard>

                <View className="mb-3 rounded-3xl border p-5" style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}>
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
                      <Text className="text-base font-bold" style={{ color: colors.text }}>Symptoms & exposure checklist</Text>
                      {!checklistOpen ? (
                        <Text className="mt-1 text-sm leading-5" style={{ color: colors.textMuted }}>{checklistCollapsedSubtitle}</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name={checklistOpen ? "chevron-up" : "chevron-down"}
                      size={22}
                      color={colors.textMuted}
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
                        className="mt-4 border-t pt-4"
                        style={{ position: "absolute", left: 0, right: 0, top: 0, borderColor: colors.borderLight }}
                        onLayout={onChecklistContentLayout}
                      >
                        {checklistRows.length === 0 ? (
                          <Text className="text-base leading-6" style={{ color: colors.textSecondary }}>
                            {DETAILS_CHECKLIST_EMPTY_HINT}
                          </Text>
                        ) : (
                          <>
                            <Text className="mb-4 text-base leading-6" style={{ color: colors.textSecondary }}>
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
                                  className="rounded-2xl border px-4 py-4"
                                  style={{ borderColor: colors.borderLight, backgroundColor: colors.surface }}
                                >
                                  <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                                    {categorySectionLabel(row.category)}
                                  </Text>
                                  <Text className="text-base leading-6" style={{ color: colors.text }}>{row.questionText}</Text>
                                  <View className="mt-3 flex-row flex-wrap items-center gap-2">
                                    {row.answerYes === null ? (
                                      <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>Not recorded</Text>
                                    ) : (
                                      <View
                                        className="rounded-full px-3 py-1"
                                        style={{
                                          backgroundColor: row.answerYes
                                            ? "rgba(220,38,38,0.10)"
                                            : colors.primaryLight,
                                        }}
                                      >
                                        <Text
                                          className="text-sm font-bold"
                                          style={{ color: row.answerYes ? "#B91C1C" : colors.text }}
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

                <DetailsCard
                  title="Cough audio replay"
                  cardBorder={colors.cardBorder}
                  cardBg={colors.card}
                  textColor={colors.text}
                >
                  {audioClips.length > 0 ? (
                    <View className="gap-2">
                      {audioClips.map((_, i) => (
                        <Pressable
                          key={`audio-${i}`}
                          onPress={() => void playAudioAt(i)}
                          className="flex-row items-center justify-between rounded-xl border px-3.5 py-3 active:opacity-90"
                          style={{ borderColor: colors.borderLight, backgroundColor: colors.surfaceAlt }}
                          accessibilityRole="button"
                          accessibilityLabel={`Play cough clip ${i + 1}`}
                        >
                          <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                            Cough clip {i + 1}
                          </Text>
                          {loadingAudioIndex === i ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Ionicons
                              name={playingIndex === i ? "pause-circle" : "play-circle"}
                              size={20}
                              color={colors.primary}
                            />
                          )}
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text className="text-sm leading-5" style={{ color: colors.textMuted }}>
                      No playable cough clips were stored for this session.
                    </Text>
                  )}
                  {audioHint ? (
                    <Text className="mt-3 text-sm leading-5" style={{ color: colors.textMuted }}>
                      {audioHint}
                    </Text>
                  ) : null}
                </DetailsCard>

                <SputumSampleCard
                  sessionId={sessionId}
                  imageUri={resolvedImageUri || imageUri}
                  imageProvided={imageProvided}
                  onOpenViewer={handleOpenImageViewer}
                  cardBorder={colors.cardBorder}
                  cardBg={colors.card}
                  textColor={colors.text}
                />

                <DetailsCard
                  title="Factor Insights"
                  cardBorder={colors.cardBorder}
                  cardBg={colors.card}
                  textColor={colors.text}
                >
                  {fusionFactors.map((t) => (
                    <DetailsBullet key={t} text={t} accentColor={copy.color} textSecondary={colors.textSecondary} />
                  ))}
                  {fusionModalities.length === 0
                    ? copy.factors.map((t) => (
                        <DetailsBullet key={t} text={t} accentColor={copy.color} textSecondary={colors.textSecondary} />
                      ))
                    : null}
                  {imageAnalyzed && phlegmLoad.length > 0 && (
                    <DetailsBullet
                      text={`Sputum smear model: ${formatPhlegmLoadLabel(phlegmLoad)}. This is a screening signal, not a certified diagnosis.`}
                      accentColor={copy.color}
                      textSecondary={colors.textSecondary}
                    />
                  )}
                  {!imageAnalyzed && imageProvided && phlegmFailed && (
                    <DetailsBullet
                      text="Phlegm model did not return a result; fusion used checklist and cough signals only."
                      accentColor={copy.color}
                      textSecondary={colors.textSecondary}
                    />
                  )}
                </DetailsCard>

                <DetailsCard
                  title="Recommendations"
                  cardBorder={colors.cardBorder}
                  cardBg={colors.card}
                  textColor={colors.text}
                >
                  {savedRecommendation ? (
                    <Text className="text-base leading-6" style={{ color: colors.textSecondary }}>{savedRecommendation}</Text>
                  ) : (
                    copy.recommendations.map((t) => (
                      <DetailsBullet key={t} text={t} accentColor={copy.color} textSecondary={colors.textSecondary} />
                    ))
                  )}
                </DetailsCard>

                {staffNotesDisplay ? (
                  <DetailsCard
                    title="Staff notes"
                    cardBorder={colors.cardBorder}
                    cardBg={colors.card}
                    textColor={colors.text}
                  >
                    <Text className="text-base leading-6" style={{ color: colors.textSecondary }}>
                      {staffNotesDisplay}
                    </Text>
                  </DetailsCard>
                ) : null}

                {detailsSessionId && referralStatus !== "none" ? (
                  isStaffBooth ? (
                    <DetailsCard
                      title="Referral follow-up"
                      cardBorder={colors.cardBorder}
                      cardBg={colors.card}
                      textColor={colors.text}
                    >
                      <Text className="mb-3 text-sm leading-6" style={{ color: colors.textSecondary }}>
                        Status: {REFERRAL_STATUS_LABELS[referralStatus]}
                      </Text>
                      <TextInput
                        value={referralNotesDraft}
                        onChangeText={setReferralNotesDraft}
                        placeholder="GeneXpert / clinic notes"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        className="mb-3 min-h-[72px] rounded-xl border px-3 py-2 text-base"
                        style={{
                          borderColor: colors.inputBorder,
                          backgroundColor: colors.inputBg,
                          color: colors.text,
                          textAlignVertical: "top",
                        }}
                      />
                      <View className="flex-row flex-wrap gap-2">
                        {(["documented", "completed"] as ReferralStatus[]).map((status) => (
                          <Pressable
                            key={status}
                            disabled={referralSaving}
                            onPress={() => void saveReferralStatus(status)}
                            className="rounded-xl px-4 py-2 active:opacity-80"
                            style={{
                              backgroundColor:
                                referralStatus === status ? colors.primary : colors.surfaceAlt,
                            }}
                          >
                            <Text
                              className="text-sm font-semibold"
                              style={{
                                color: referralStatus === status ? "#fff" : colors.text,
                              }}
                            >
                              {REFERRAL_STATUS_LABELS[status]}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </DetailsCard>
                  ) : (
                    <DetailsCard
                      title="Referral follow-up"
                      cardBorder={colors.cardBorder}
                      cardBg={colors.card}
                      textColor={colors.text}
                    >
                      <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
                        Status: {REFERRAL_STATUS_LABELS[referralStatus]}
                      </Text>
                      {referralNotesDraft.trim().length > 0 ? (
                        <Text className="mt-3 text-sm leading-6" style={{ color: colors.textSecondary }}>
                          {referralNotesDraft.trim()}
                        </Text>
                      ) : null}
                    </DetailsCard>
                  )
                ) : null}

                <DetailsCard
                  title="Disclaimer"
                  cardBorder={colors.cardBorder}
                  cardBg={colors.card}
                  textColor={colors.text}
                >
                  <Text className="text-base italic leading-6" style={{ color: colors.textSecondary }}>
                    This result is not a medical diagnosis. Cough audio replay and sputum image feedback are
                    available only in the app.
                  </Text>
                </DetailsCard>
              </>
            ) : null}
          </View>
        </ScrollView>

        <Modal
          visible={imageViewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setImageViewerVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.86)" }}>
            <View
              style={{
                paddingTop: Math.max(insets.top, 18),
                paddingHorizontal: 16,
                flexDirection: "row",
                justifyContent: "flex-end",
              }}
            >
              <Pressable
                onPress={() => setImageViewerVisible(false)}
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
                accessibilityRole="button"
                accessibilityLabel="Close image viewer"
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 8, paddingBottom: Math.max(insets.bottom, 18) }}>
              {resolvedImageUri ? (
                viewerNeedsAuth && !viewerHeaders ? (
                  <View className="flex-1 items-center justify-center px-6">
                    <ActivityIndicator color="#C7D2FE" />
                    <Text className="mt-3 text-center text-sm font-semibold text-[#C7D2FE]">
                      Loading image…
                    </Text>
                  </View>
                ) : (
                  <Image
                    source={
                      viewerNeedsAuth && viewerHeaders
                        ? { uri: resolvedImageUri, headers: viewerHeaders }
                        : { uri: resolvedImageUri }
                    }
                    style={{ width: "100%", height: "100%" }}
                    contentFit="contain"
                    cachePolicy="none"
                  />
                )
              ) : (
                <View className="flex-1 items-center justify-center px-6">
                  <Ionicons name="image-outline" size={28} color="#C7D2FE" />
                  <Text className="mt-3 text-center text-sm font-semibold text-[#C7D2FE]">
                    Image preview unavailable.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}
