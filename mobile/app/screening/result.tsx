import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ApiError,
  getMe,
  fetchSessionSputumPreview,
  postCompleteScreening,
  sessionHasStoredSputumBytes,
  uploadCoughRecordingRaw,
  uploadSputumImageRaw,
  buildServerSputumImageUrl,
} from "../../services/backendApi";
import SputumSamplePhoto from "../components/SputumSamplePhoto";
import { clearScreeningCache } from "../../utils/screeningHistoryCache";
import { getAuthToken } from "../../utils/authStorage";
import { useTheme } from "../../contexts/ThemeContext";
import type { FusionModalityBreakdown } from "../../utils/tbRiskFusion";
import { peekProfile, setCachedProfile } from "../../utils/profileCache";
import { onUnverifiedScreeningCompleted } from "../../services/unverifiedEngagementNotifications";
import {
  isEmailVerified,
  promptEmailVerification,
} from "../../utils/emailVerifiedGate";
import { buildResultPdfExport, shareScreeningPdf } from "../../utils/screeningPdfExport";

type RiskLevel = "low" | "moderate" | "high";
type PhlegmTone = { color: string; bg: string; border: string; label: string };

const PHLEGM_TONE: Record<string, PhlegmTone> = {
  none: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", label: "None" },
  low: { color: "#059669", bg: "#ECFDF5", border: "#A7F3D0", label: "Low" },
  moderate: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", label: "Moderate" },
  high: { color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", label: "High" },
  afb_negative: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", label: "AFB not detected" },
  afb_positive: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", label: "AFB detected" },
};

function parseFusionBreakdown(raw: string | undefined): {
  probTb: number | null;
  modalities: FusionModalityBreakdown[];
  method: string;
} | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    const v = JSON.parse(raw) as {
      probTb?: number;
      modalities?: FusionModalityBreakdown[];
      method?: string;
    };
    return {
      probTb: typeof v.probTb === "number" && Number.isFinite(v.probTb) ? v.probTb : null,
      modalities: Array.isArray(v.modalities) ? v.modalities : [],
      method: typeof v.method === "string" ? v.method : "",
    };
  } catch {
    return null;
  }
}

const MODALITY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  checklist: "list-outline",
  cough: "mic-outline",
  sputum: "image-outline",
};

function phlegmTone(load: string): PhlegmTone {
  const k = load.toLowerCase();
  return PHLEGM_TONE[k] ?? { color: "#475569", bg: "#F1F5F9", border: "#E2E8F0", label: load || "—" };
}

const RISK_CONFIG: Record<
  RiskLevel,
  {
    emoji: string;
    label: string;
    tagline: string;
    recommendation: string;
    color: string;
    bg: string;
    ringColor: string;
  }
> = {
  low: {
    emoji: "🟢",
    label: "Low Risk",
    tagline: "Low TB Risk – Monitor symptoms.",
    recommendation:
      "Your results suggest a low risk of TB. Continue to maintain good health habits and monitor any symptoms. Consult a healthcare professional if symptoms persist.",
    color: "#16A34A",
    bg: "#F0FDF4",
    ringColor: "#86EFAC",
  },
  moderate: {
    emoji: "🟡",
    label: "Moderate Risk",
    tagline: "Moderate TB Risk – Further evaluation needed.",
    recommendation:
      "Your results indicate a moderate risk. We recommend scheduling a consultation with a healthcare professional for further evaluation and testing.",
    color: "#D97706",
    bg: "#FFFBEB",
    ringColor: "#FCD34D",
  },
  high: {
    emoji: "🔴",
    label: "High Risk",
    tagline: "High TB Risk – Seek medical attention.",
    recommendation:
      "Your results suggest a high risk of TB. Please consult a healthcare professional as soon as possible for proper diagnosis and treatment.",
    color: "#DC2626",
    bg: "#FEF2F2",
    ringColor: "#FCA5A5",
  },
};


export default function ResultScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  /** Risk ring scales with viewport so it never overflows narrow phones */
  const ring = useMemo(() => {
    const pad = 48;
    const maxByScreen = Math.max(120, windowWidth - pad);
    const outer = Math.min(180, Math.min(maxByScreen, Math.round(windowWidth * 0.44)));
    const scale = outer / 180;
    const inner = Math.round(130 * scale);
    const borderWidth = Math.max(4, Math.round(6 * scale));
    const emojiSize = Math.max(34, Math.min(52, Math.round(52 * scale)));
    const radius = outer / 2;
    const innerRadius = inner / 2;
    return { outer, inner, borderWidth, emojiSize, radius, innerRadius };
  }, [windowWidth]);

  const params = useLocalSearchParams<{
    risk?: string;
    probTb?: string;
    audioUris?: string;
    iotRecordingIds?: string;
    imageUri?: string;
    checklist?: string;
    invalidAudio?: string;
    invalidLabel?: string;
    invalidReasons?: string;
    uploadError?: string;
    apiAttempt?: string;
    wifiRequired?: string;
    phlegmAnalyzed?: string;
    phlegmLoad?: string;
    phlegmConfidence?: string;
    phlegmProbs?: string;
    phlegmError?: string;
    phlegmErrorDetail?: string;
    fusionBreakdown?: string;
    sessionId?: string;
    deviceSputum?: string;
    sputumByteSize?: string;
    sputumCapturedAt?: string;
  }>();

  const risk: RiskLevel =
    params.risk === "moderate" || params.risk === "high" ? params.risk : "low";

  const cfg = RISK_CONFIG[risk];
  const probTb = typeof params.probTb === "string" ? Number(params.probTb) : null;
  const fusionBreakdown = parseFusionBreakdown(
    typeof params.fusionBreakdown === "string" ? params.fusionBreakdown : undefined,
  );
  const invalidAudio = params.invalidAudio === "1";
  const invalidLabel = typeof params.invalidLabel === "string" ? params.invalidLabel : "";
  const uploadError = params.uploadError === "1";
  const apiAttempt = typeof params.apiAttempt === "string" ? params.apiAttempt : "";
  const wifiRequired = params.wifiRequired === "1";
  const checklist = typeof params.checklist === "string" ? params.checklist : "";

  const phlegmAnalyzed = params.phlegmAnalyzed === "1";
  const phlegmLoad = typeof params.phlegmLoad === "string" ? params.phlegmLoad : "";
  const phlegmConfidence =
    typeof params.phlegmConfidence === "string" && params.phlegmConfidence.length > 0
      ? Number(params.phlegmConfidence)
      : null;
  const phlegmFailed = params.phlegmError === "1";

  const imageUriParam =
    typeof params.imageUri === "string" && params.imageUri.trim().length > 0
      ? params.imageUri.trim()
      : "";

  const audioCount = useMemo(() => {
    if (typeof params.audioUris !== "string" || params.audioUris.length === 0) return 0;
    try {
      const parsed = JSON.parse(params.audioUris) as unknown;
      if (!Array.isArray(parsed)) return 0;
      return parsed.filter((x): x is string => typeof x === "string" && x.length > 0).length;
    } catch {
      return 0;
    }
  }, [params.audioUris]);

  const imageProvided =
    imageUriParam.length > 0 || params.deviceSputum === "1" || phlegmAnalyzed;

  const handleDownloadPdf = useCallback(async () => {
    let profile = peekProfile();
    if (!isEmailVerified(profile)) {
      try {
        const { user } = await getMe();
        setCachedProfile(user);
        profile = user;
      } catch {
        // keep cached profile
      }
    }
    if (!isEmailVerified(profile)) {
      promptEmailVerification(router);
      return;
    }

    try {
      const pdfData = buildResultPdfExport({
        risk,
        riskTitle: cfg.label,
        riskSummary: cfg.tagline,
        recommendation: cfg.recommendation,
        probTb: typeof probTb === "number" && Number.isFinite(probTb) ? probTb : null,
        fusionModalities: fusionBreakdown?.modalities ?? [],
        checklistJson: checklist,
        invalidAudio,
        invalidLabel,
        audioCount,
        phlegmAnalyzed,
        phlegmLoad,
        phlegmConfidence: phlegmConfidence,
        phlegmFailed,
        imageProvided,
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
  }, [
    audioCount,
    cfg.label,
    cfg.recommendation,
    cfg.tagline,
    checklist,
    fusionBreakdown?.modalities,
    imageProvided,
    invalidAudio,
    invalidLabel,
    phlegmAnalyzed,
    phlegmConfidence,
    phlegmFailed,
    phlegmLoad,
    probTb,
    risk,
    router,
  ]);

  /** Prefer server-stored sputum bytes once screening is saved (not phone-local file). */
  const [displayImageUri, setDisplayImageUri] = useState("");

  const [savedSessionId, setSavedSessionId] = useState<string | null>(() => {
    const id = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
    return id.length > 0 ? id : null;
  });

  const persistScreeningAttempted = useRef(false);
  useEffect(() => {
    if (persistScreeningAttempted.current) return;
    persistScreeningAttempted.current = true;

    const run = async () => {
      const token = await getAuthToken();
      if (!token) return;

      let audioList: string[] = [];
      if (typeof params.audioUris === "string") {
        try {
          const parsed = JSON.parse(params.audioUris) as unknown;
          if (Array.isArray(parsed)) {
            audioList = parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
          }
        } catch {
          /* ignore */
        }
      }

      // IoT recording IDs assigned by the backend when the ESP32 uploaded.
      // Paired by index with audioList (localUri[i] corresponds to recordingId[i]).
      let iotRecordingIdList: string[] = [];
      if (typeof params.iotRecordingIds === "string" && params.iotRecordingIds.length > 0) {
        try {
          const parsed = JSON.parse(params.iotRecordingIds) as unknown;
          if (Array.isArray(parsed)) {
            iotRecordingIdList = parsed.filter(
              (x): x is string => typeof x === "string" && x.length > 0,
            );
          }
        } catch {
          /* ignore */
        }
      }

      let invalidReasonList: string[] | undefined;
      if (typeof params.invalidReasons === "string") {
        try {
          const parsed = JSON.parse(params.invalidReasons) as unknown;
          if (Array.isArray(parsed)) {
            invalidReasonList = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          /* ignore */
        }
      }

      const avgProb = typeof probTb === "number" && Number.isFinite(probTb) ? probTb : null;

      try {
        const draftSessionId =
          typeof params.sessionId === "string" && params.sessionId.trim().length > 0
            ? params.sessionId.trim()
            : undefined;

        const isLocalImage =
          imageUriParam.startsWith("file://") || imageUriParam.startsWith("content://");

        const serverHasSputumBefore =
          draftSessionId && (params.deviceSputum === "1" || isLocalImage)
            ? await sessionHasStoredSputumBytes(draftSessionId)
            : false;

        const includeLocalImageUriInComplete =
          imageUriParam.length > 0 && (!isLocalImage || !serverHasSputumBefore);

        // In the IoT flow the ESP32 already uploaded the audio bytes directly
        // to the server. Sending local file paths as audioUris confuses the
        // backend into creating new empty rows instead of linking the existing
        // IoT recordings by sessionId (the same mechanism that works for sputum).
        const iotCoughFlow = iotRecordingIdList.length > 0;

        const response = await postCompleteScreening({
          riskLevel: risk,
          recommendation: cfg.recommendation,
          ...(draftSessionId ? { sessionId: draftSessionId } : {}),
          ...(checklist.length > 0 ? { checklist } : {}),
          audioUris: iotCoughFlow ? [] : audioList,
          ...(includeLocalImageUriInComplete ? { imageUri: imageUriParam } : {}),
          ...(uploadError ? { uploadError: true } : {}),
          ...(invalidAudio ? { invalidAudio: true } : {}),
          ...(invalidLabel.length > 0 ? { invalidAudioLabel: invalidLabel } : {}),
          ...(invalidReasonList && invalidReasonList.length > 0
            ? { invalidAudioReasons: invalidReasonList }
            : {}),
          ...(apiAttempt.length > 0 ? { apiAttempt } : {}),
          averageTbProbability: avgProb,
          ...(phlegmAnalyzed ? { phlegmAnalyzed: true } : {}),
          ...(phlegmLoad.length > 0 ? { phlegmLoad } : {}),
          ...(phlegmConfidence !== null && Number.isFinite(phlegmConfidence)
            ? { phlegmConfidence }
            : {}),
          ...(typeof params.phlegmProbs === "string" && params.phlegmProbs.length > 0
            ? { phlegmProbs: params.phlegmProbs }
            : {}),
        });
        clearScreeningCache();

        const profile = peekProfile();
        if (profile && profile.emailVerified !== true) {
          void onUnverifiedScreeningCompleted({
            sessionId: response?.session?.sessionId,
            riskLabel: cfg.label,
          });
        }

        // Upload the raw audio + image bytes so any device on this account
        // can replay/view the originals — not just this phone. Failures here
        // are best-effort; the screening metadata is already saved.
        const sessionId = response?.session?.sessionId;
        if (typeof sessionId === "string" && sessionId.length > 0) {
          setSavedSessionId(sessionId);

          if (iotCoughFlow) {
            // IoT path: the ESP32 already uploaded the WAV bytes to the server
            // via POST /iot/cough-recordings. The backend links those recordings
            // to this screening by sessionId when postCompleteScreening is called
            // with audioUris:[]. Re-uploading the locally-cached copy here would
            // create duplicate DB rows (this is what caused the duplication bug).
            console.log(
              `[Screening] IoT cough: skipping raw re-upload — bytes already on server (${iotRecordingIdList.length} recording(s))`,
            );
          } else {
            // Non-IoT path: backend created new empty rows and returned their IDs.
            // Upload the locally-recorded bytes to fill them.
            const recordings = Array.isArray(response.session.coughRecordings)
              ? response.session.coughRecordings
              : [];
            const pairs = recordings
              .map((r, i) => ({ recordingId: r.recordingId, uri: audioList[i] }))
              .filter(
                (p): p is { recordingId: string; uri: string } =>
                  typeof p.recordingId === "string" &&
                  p.recordingId.length > 0 &&
                  typeof p.uri === "string" &&
                  p.uri.length > 0,
              );
            for (const { recordingId, uri } of pairs) {
              try {
                await uploadCoughRecordingRaw({ sessionId, recordingId, localUri: uri });
              } catch (e) {
                const msg =
                  e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
                console.warn(`[Screening] cough raw upload failed for ${recordingId}:`, msg);
              }
            }
          }

          const serverHasSputumAfter = await sessionHasStoredSputumBytes(sessionId);
          const skipStaleLocalSputumUpload =
            isLocalImage &&
            imageUriParam.length > 0 &&
            (serverHasSputumBefore || serverHasSputumAfter || params.deviceSputum === "1");

          if (imageUriParam.length > 0 && isLocalImage && !skipStaleLocalSputumUpload) {
            try {
              await uploadSputumImageRaw({ sessionId, localUri: imageUriParam });
            } catch (e) {
              if (__DEV__) {
                const msg =
                  e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
                console.warn("[Screening] sputum raw upload failed:", msg);
              }
            }
          } else if (__DEV__ && skipStaleLocalSputumUpload) {
            console.log(
              "[Screening] Skipped local sputum re-upload; using server bytes for session",
              sessionId,
            );
          }

          try {
            const preview = await fetchSessionSputumPreview(sessionId);
            const serverUrl = buildServerSputumImageUrl(
              sessionId,
              preview
                ? {
                    hasRawData: true,
                    sessionId: preview.sessionId,
                    byteSize: preview.byteSize,
                    capturedAt: preview.capturedAt,
                  }
                : null,
            );
            if (serverUrl) setDisplayImageUri(serverUrl);
          } catch {
            /* details screen refetches from API */
          }

          clearScreeningCache();
        }
      } catch (e) {
        if (__DEV__) {
          const msg =
            e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
          console.warn("[Screening] Could not persist screening:", msg);
        }
      }
    };

    void run();
  }, []);

  return (
    <>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "right", "bottom", "left"]}>
      <View className="flex-row items-center justify-between border-b px-4 pb-3 pt-2 sm:px-5 md:px-6" style={{ borderColor: colors.borderLight }}>
        <View className="size-11" />
        <View className="min-w-0 flex-1 items-center px-2">
          <Text className="text-center text-sm font-bold sm:text-base" style={{ color: colors.text }} numberOfLines={1}>
            Screening Result
          </Text>
        </View>
        <Pressable
          onPress={() => router.dismissAll()}
          className="size-11 items-center justify-center rounded-full active:opacity-90"
          style={{ backgroundColor: colors.surfaceAlt }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pb-8 pt-8 sm:px-6 md:px-8">
          {uploadError && (
            <View
              className="mb-4 rounded-2xl border p-3.5"
              style={{
                borderColor: isDark ? "rgba(248,113,113,0.45)" : "#FECACA",
                backgroundColor: isDark ? "rgba(127,29,29,0.30)" : "#FEF2F2",
              }}
            >
              {wifiRequired ? (
                <View
                  className="mb-3 rounded-xl border p-3"
                  style={{
                    borderColor: isDark ? "rgba(251,191,36,0.45)" : "#FCD34D",
                    backgroundColor: isDark ? "rgba(120,53,15,0.30)" : "#FFFBEB",
                  }}
                >
                  <Text className="mb-1.5 text-sm font-bold" style={{ color: isDark ? "#FDE68A" : "#78350F" }}>No Wi‑Fi connection</Text>
                  <Text className="text-xs leading-5" style={{ color: isDark ? "#FDE68A" : "#451A03" }}>
                    Please connect to the same Wi‑Fi network as your screening device and try again.
                  </Text>
                </View>
              ) : null}
              <Text className="mb-1.5 text-sm font-bold" style={{ color: isDark ? "#FCA5A5" : "#7F1D1D" }}>Could not complete analysis</Text>
              <Text className="text-xs leading-5" style={{ color: isDark ? "#FECACA" : "#450A0A" }}>
                We could not connect to the analysis service. Please check your internet connection and try again.
                If the problem persists, contact support.
              </Text>
            </View>
          )}
          {invalidAudio && (
            <View
              className="mb-4 rounded-2xl border p-3.5"
              style={{
                borderColor: isDark ? "rgba(251,191,36,0.45)" : "#FCD34D",
                backgroundColor: isDark ? "rgba(120,53,15,0.30)" : "#FFFBEB",
              }}
            >
              <Text className="mb-1.5 text-sm font-bold" style={{ color: isDark ? "#FDE68A" : "#78350F" }}>Recording quality issue detected</Text>
              <Text className="text-xs leading-snug" style={{ color: isDark ? "#FDE68A" : "#78350F" }}>
                {invalidLabel === "silence"
                  ? "The recording was too quiet / silent. Please cough once clearly within 3–10 seconds."
                  : invalidLabel === "speech"
                    ? "This sounded more like speech/throat-clearing than a cough. Please record a single clear cough."
                    : invalidLabel === "replay"
                      ? "This may be playback/replay audio. Please record directly from the phone microphone."
                      : invalidLabel === "noise"
                        ? "This sounded like steady background noise. Please move to a quieter place and re-record."
                        : "We couldn’t confidently detect a real cough in this recording. Please re-record in a quiet environment and cough once clearly."}
              </Text>
            </View>
          )}
          <View className="mb-6 w-full max-w-md items-center self-center sm:mb-8">
            <View
              className="items-center justify-center overflow-hidden rounded-full"
              style={{
                width: ring.outer,
                height: ring.outer,
                borderRadius: ring.radius,
                borderWidth: ring.borderWidth,
                backgroundColor: isDark ? "rgba(255,255,255,0.08)" : cfg.bg,
                borderColor: cfg.ringColor,
              }}
            >
              <View
                className="items-center justify-center rounded-full"
                style={{
                  width: ring.inner,
                  height: ring.inner,
                  borderRadius: ring.innerRadius,
                  backgroundColor: colors.card,
                  shadowColor: cfg.color,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.25 : 0.15,
                  shadowRadius: 12,
                  elevation: 4,
                }}
              >
                <Text style={{ fontSize: ring.emojiSize, lineHeight: ring.emojiSize + 4 }}>{cfg.emoji}</Text>
              </View>
            </View>

            <Text
              className="mt-4 text-center text-2xl font-bold sm:mt-5 sm:text-3xl"
              style={{ color: cfg.color }}
            >
              {cfg.label}
            </Text>

            <Text className="mt-2 px-1 text-center text-sm font-bold sm:text-base" style={{ color: colors.text }}>
              {cfg.tagline}
            </Text>

            <Text className="mt-1.5 px-2 text-center text-xs italic" style={{ color: colors.textMuted }}>
              This is not a medical diagnosis
            </Text>
          </View>

          <View className="mb-6">
            <SputumSamplePhoto
              key={savedSessionId ?? "no-session"}
              sessionId={savedSessionId}
              uri={displayImageUri}
              height={220}
              label={displayImageUri.length > 0 ? "Sputum sample (from server)" : undefined}
            />
          </View>

          {(() => {
            const fusedProb =
              fusionBreakdown?.probTb ??
              (typeof probTb === "number" && Number.isFinite(probTb) ? probTb : null);
            const modalities = fusionBreakdown?.modalities ?? [];
            const hasFusion = fusedProb !== null || modalities.length > 0;
            const hasPhlegm = phlegmAnalyzed && phlegmLoad.length > 0;
            if (!hasFusion && !hasPhlegm && !phlegmFailed) return null;

            const tone = hasPhlegm ? phlegmTone(phlegmLoad) : null;
            const fusedPct = fusedProb !== null ? Math.round(fusedProb * 1000) / 10 : null;
            const fusedWidth =
              fusedProb !== null ? Math.max(2, Math.min(100, fusedProb * 100)) : 0;

            return (
              <View className="mb-6 rounded-2xl border p-4" style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}>
                <View className="mb-3 flex-row items-center gap-2">
                  <Ionicons name="pulse-outline" size={16} color={colors.textMuted} />
                  <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>
                    Fusion model breakdown
                  </Text>
                </View>

                {fusedPct !== null ? (
                  <View
                    className="mb-3 rounded-xl border p-3"
                    style={{ borderColor: cfg.ringColor, backgroundColor: colors.surface }}
                  >
                    <Text className="text-[11px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                      Combined TB screening probability
                    </Text>
                    <View className="mt-1 flex-row items-baseline gap-1">
                      <Text className="text-3xl font-bold" style={{ color: cfg.color }}>
                        {fusedPct.toFixed(1)}
                      </Text>
                      <Text className="text-sm font-bold" style={{ color: colors.textMuted }}>%</Text>
                    </View>
                    <View className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.borderLight }}>
                      <View
                        className="h-1.5 rounded-full"
                        style={{ width: `${fusedWidth}%`, backgroundColor: cfg.color }}
                      />
                    </View>
                  </View>
                ) : null}

                <View className="flex-row flex-wrap gap-3">
                  {modalities.length > 0
                    ? modalities.map((m) => (
                        <View
                          key={m.key}
                          className="flex-1 rounded-xl border p-3"
                          style={{
                            minWidth: 150,
                            borderColor: colors.borderLight,
                            backgroundColor: colors.surface,
                            opacity: m.available ? 1 : 0.72,
                          }}
                        >
                          <View className="mb-1.5 flex-row items-center gap-1.5">
                            <Ionicons
                              name={MODALITY_ICON[m.key] ?? "ellipse-outline"}
                              size={14}
                              color={colors.textMuted}
                            />
                            <Text className="text-[11px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                              {m.label}
                            </Text>
                          </View>
                          {m.available && typeof m.probTb === "number" ? (
                            <>
                              <View className="flex-row items-baseline gap-1">
                                <Text className="text-xl font-bold" style={{ color: colors.text }}>
                                  {(m.probTb * 100).toFixed(1)}
                                </Text>
                                <Text className="text-xs font-bold" style={{ color: colors.textMuted }}>%</Text>
                              </View>
                              <Text className="text-[11px] capitalize" style={{ color: colors.textMuted }}>
                                {m.riskLevel ?? "—"} risk · weight {m.weight.toFixed(2)}
                              </Text>
                            </>
                          ) : (
                            <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>
                              Not used
                            </Text>
                          )}
                          <Text className="mt-1 text-[11px] leading-4" style={{ color: colors.textMuted }}>
                            {m.detail}
                          </Text>
                        </View>
                      ))
                    : null}

                  {modalities.length === 0 && hasPhlegm && tone ? (
                    <View
                      className="flex-1 rounded-xl border p-3"
                      style={{ minWidth: 150, borderColor: colors.borderLight, backgroundColor: colors.surface }}
                    >
                      <View className="mb-1.5 flex-row items-center gap-1.5">
                        <Ionicons name="image-outline" size={14} color={colors.textMuted} />
                        <Text className="text-[11px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                          Phlegm image
                        </Text>
                      </View>
                      <View className="self-start rounded-full border px-2.5 py-1" style={{ backgroundColor: tone.bg, borderColor: tone.border }}>
                        <Text className="text-xs font-bold" style={{ color: tone.color }}>
                          {tone.label}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {phlegmFailed ? (
                    <View
                      className="flex-1 rounded-xl border p-3"
                      style={{
                        minWidth: 150,
                        borderColor: isDark ? "rgba(251,191,36,0.45)" : "#FDE68A",
                        backgroundColor: isDark ? "rgba(120,53,15,0.30)" : "#FFFBEB",
                      }}
                    >
                      <View className="mb-1.5 flex-row items-center gap-1.5">
                        <Ionicons name="alert-circle-outline" size={14} color={isDark ? "#FCD34D" : "#B45309"} />
                        <Text className="text-[11px] font-bold uppercase tracking-wide" style={{ color: isDark ? "#FDE68A" : "#B45309" }}>
                          Phlegm image
                        </Text>
                      </View>
                      <Text className="text-sm font-bold" style={{ color: isDark ? "#FDE68A" : "#78350F" }}>Unavailable</Text>
                      <Text className="mt-0.5 text-[11px]" style={{ color: isDark ? "#FDE68A" : "#92400E" }}>
                        Could not analyze the image. Open Details for the error.
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text className="mt-3 text-[11px] italic leading-4" style={{ color: colors.textMuted }}>
                  {fusionBreakdown?.method ||
                    "Weighted log-odds fusion of checklist, cough ML, and sputum ML. Screening triage only — not a diagnosis."}
                </Text>
              </View>
            );
          })()}

          <View
            className="mb-7 rounded-2xl border p-5"
            style={{
              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : cfg.bg,
              borderColor: cfg.ringColor,
            }}
          >
            <View className="mb-2.5 flex-row items-center gap-2">
              <Ionicons name="information-circle" size={20} color={cfg.color} />
              <Text className="text-sm font-bold" style={{ color: cfg.color }}>
                Recommendation
              </Text>
            </View>
            <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>{cfg.recommendation}</Text>
          </View>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/screening/details",
                params: {
                  from: "result",
                  risk,
                  probTb: typeof probTb === "number" && Number.isFinite(probTb) ? String(probTb) : "",
                  audioUris: typeof params.audioUris === "string" ? params.audioUris : "[]",
                  ...(savedSessionId ? { sessionId: savedSessionId } : {}),
                  checklist,
                  invalidAudio: invalidAudio ? "1" : "0",
                  invalidLabel,
                  invalidReasons: typeof params.invalidReasons === "string" ? params.invalidReasons : "[]",
                  phlegmAnalyzed: params.phlegmAnalyzed ?? "0",
                  phlegmLoad: params.phlegmLoad ?? "",
                  phlegmConfidence: params.phlegmConfidence ?? "",
                  phlegmProbs: params.phlegmProbs ?? "{}",
                  phlegmError: params.phlegmError ?? "0",
                  phlegmErrorDetail: params.phlegmErrorDetail ?? "",
                  fusionBreakdown: typeof params.fusionBreakdown === "string" ? params.fusionBreakdown : "",
                },
              } as any)
            }
            className="mb-3 items-center justify-center rounded-2xl py-4 active:opacity-90"
            style={{ backgroundColor: isDark ? "#4458A6" : "#1A3478" }}
            accessibilityRole="button"
          >
            <Text className="text-base font-bold text-white">View Details</Text>
          </Pressable>

          <Pressable
            onPress={() => void handleDownloadPdf()}
            className="mb-3 items-center justify-center rounded-2xl border py-4 active:opacity-90"
            style={{ borderColor: colors.borderLight, backgroundColor: colors.surfaceAlt }}
            accessibilityRole="button"
            accessibilityLabel="Download screening PDF"
          >
            <Text className="text-base font-bold" style={{ color: colors.text }}>Download PDF</Text>
          </Pressable>

          <Pressable
            onPress={() => router.dismissAll()}
            className="items-center justify-center rounded-2xl border py-4 active:opacity-90"
            style={{ borderColor: colors.borderLight, backgroundColor: colors.surfaceAlt }}
            accessibilityRole="button"
          >
            <Text className="text-base font-bold" style={{ color: colors.text }}>Return Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
    </>
  );
}
