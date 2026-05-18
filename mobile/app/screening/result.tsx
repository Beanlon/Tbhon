import { useEffect, useMemo, useRef } from "react";
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, postCompleteScreening } from "../../services/backendApi";
import { clearScreeningCache } from "../../utils/screeningHistoryCache";
import { getAuthToken } from "../../utils/authStorage";

type RiskLevel = "low" | "moderate" | "high";
type PhlegmTone = { color: string; bg: string; border: string; label: string };

const PHLEGM_TONE: Record<string, PhlegmTone> = {
  none: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0", label: "None" },
  low: { color: "#059669", bg: "#ECFDF5", border: "#A7F3D0", label: "Low" },
  moderate: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", label: "Moderate" },
  high: { color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", label: "High" },
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

const monoFont = Platform.OS === "ios" ? "Menlo" : "monospace";

export default function ResultScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

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
  }>();

  const risk: RiskLevel =
    params.risk === "moderate" || params.risk === "high" ? params.risk : "low";

  const cfg = RISK_CONFIG[risk];
  const probTb = typeof params.probTb === "string" ? Number(params.probTb) : null;
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
        await postCompleteScreening({
          riskLevel: risk,
          recommendation: cfg.recommendation,
          ...(checklist.length > 0 ? { checklist } : {}),
          audioUris: audioList,
          ...(typeof params.imageUri === "string" && params.imageUri.trim().length > 0
            ? { imageUri: params.imageUri }
            : {}),
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
      <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
      <SafeAreaView className="flex-1 bg-white" edges={["top", "right", "bottom", "left"]}>
      <View className="flex-row items-center justify-between border-b border-neutral-100 px-4 pb-3 pt-2 sm:px-5 md:px-6">
        <View className="size-11" />
        <View className="min-w-0 flex-1 items-center px-2">
          <Text className="text-center text-sm font-bold text-navy sm:text-base" numberOfLines={1}>
            Screening Result
          </Text>
        </View>
        <Pressable
          onPress={() => router.replace({ pathname: "/home/HomeScreen" as any })}
          className="size-11 items-center justify-center rounded-full active:bg-slate-900/10"
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color="#0f172a" />
        </Pressable>
      </View>

      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pb-8 pt-8 sm:px-6 md:px-8">
          {uploadError && (
            <View className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3.5">
              {wifiRequired ? (
                <View className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <Text className="mb-1.5 text-sm font-bold text-amber-900">Phone is on mobile data (4G/5G)</Text>
                  <Text className="text-xs leading-5 text-amber-950">
                    Addresses like <Text className="font-bold">192.168.x.x</Text> only work on the same{" "}
                    <Text className="font-bold">Wi‑Fi</Text> as your PC. Turn on Wi‑Fi, join the same network as the computer running{" "}
                    <Text className="font-bold">Expo</Text> and <Text className="font-bold">infer_api.py</Text>, then run screening again.
                  </Text>
                </View>
              ) : null}
              <Text className="mb-1.5 text-sm font-bold text-red-900">Could not reach the analysis server</Text>
              {!wifiRequired ? (
                <Text className="text-xs leading-5 text-red-950">
                  The app tries <Text className="font-bold">http://YOUR_IP:8081/_tb_infer</Text> first (Metro proxies to port 8000).{" "}
                  <Text className="font-bold">Restart Expo</Text> after updating the project so Metro loads the proxy. If it still fails, Windows may be blocking port{" "}
                  <Text className="font-bold">8000</Text> (direct URL) — use one of these:
                </Text>
              ) : (
                <Text className="text-xs leading-5 text-red-950">
                  After you are on Wi‑Fi, if it still fails, check Windows Firewall for port <Text className="font-bold">8000</Text> or use:
                </Text>
              )}
              <Text className="mt-2.5 text-xs leading-5 text-red-950">
                1) Open <Text className="font-bold">PowerShell as Administrator</Text> and run (then retry):
              </Text>
              <Text className="mt-1.5 text-xs text-red-950" style={{ fontFamily: monoFont }} selectable>
                netsh advfirewall firewall add rule name=&quot;TBhon API 8000&quot; dir=in action=allow protocol=TCP localport=8000 profile=private
              </Text>
              <Text className="mt-2.5 text-xs leading-5 text-red-950">
                2) <Text className="font-bold">Android + USB:</Text> run{" "}
                <Text className="font-bold">adb reverse tcp:8000 tcp:8000</Text> — the app will retry via{" "}
                <Text className="font-bold">127.0.0.1:8000</Text> automatically.
              </Text>
              <Text className="mt-2 text-xs leading-5 text-red-950">
                Keep <Text className="font-bold">python infer_api.py</Text> running in the <Text className="font-bold">ml</Text> folder.
              </Text>
              {apiAttempt.length > 0 ? (
                <Text className="mt-2.5 text-xs text-red-900" style={{ fontFamily: monoFont }} selectable>
                  Tried: {apiAttempt}
                </Text>
              ) : null}
            </View>
          )}
          {invalidAudio && (
            <View className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3.5">
              <Text className="mb-1.5 text-sm font-bold text-amber-900">Recording quality issue detected</Text>
              <Text className="text-xs leading-snug text-amber-900">
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
                backgroundColor: cfg.bg,
                borderColor: cfg.ringColor,
              }}
            >
              <View
                className="items-center justify-center rounded-full bg-white"
                style={{
                  width: ring.inner,
                  height: ring.inner,
                  borderRadius: ring.innerRadius,
                  shadowColor: cfg.color,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
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

            <Text className="mt-2 px-1 text-center text-sm font-bold text-navy sm:text-base">{cfg.tagline}</Text>

            <Text className="mt-1.5 px-2 text-center text-xs italic text-neutral-400">
              This is not a medical diagnosis
            </Text>
          </View>

          {(() => {
            const hasCough = typeof probTb === "number" && Number.isFinite(probTb);
            const hasPhlegm = phlegmAnalyzed && phlegmLoad.length > 0;
            if (!hasCough && !hasPhlegm && !phlegmFailed) return null;

            const tone = hasPhlegm ? phlegmTone(phlegmLoad) : null;
            const probPct = hasCough ? Math.round((probTb as number) * 1000) / 10 : null;
            const probWidth = hasCough ? Math.max(2, Math.min(100, (probTb as number) * 100)) : 0;

            return (
              <View className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
                <View className="mb-3 flex-row items-center gap-2">
                  <Ionicons name="pulse-outline" size={16} color="#475569" />
                  <Text className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Signals analyzed
                  </Text>
                </View>

                <View className="flex-row flex-wrap gap-3">
                  {hasCough ? (
                    <View
                      className="flex-1 rounded-xl border border-slate-100 bg-slate-50 p-3"
                      style={{ minWidth: 150 }}
                    >
                      <View className="mb-1.5 flex-row items-center gap-1.5">
                        <Ionicons name="mic-outline" size={14} color="#64748B" />
                        <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Cough audio
                        </Text>
                      </View>
                      <View className="flex-row items-baseline gap-1">
                        <Text className="text-2xl font-bold text-slate-900">{probPct?.toFixed(1)}</Text>
                        <Text className="text-sm font-bold text-slate-500">%</Text>
                      </View>
                      <Text className="text-[11px] text-slate-500">TB probability</Text>
                      <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <View
                          className="h-1.5 rounded-full"
                          style={{ width: `${probWidth}%`, backgroundColor: cfg.color }}
                        />
                      </View>
                    </View>
                  ) : null}

                  {hasPhlegm && tone ? (
                    <View
                      className="flex-1 rounded-xl border border-slate-100 bg-slate-50 p-3"
                      style={{ minWidth: 150 }}
                    >
                      <View className="mb-1.5 flex-row items-center gap-1.5">
                        <Ionicons name="image-outline" size={14} color="#64748B" />
                        <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Phlegm image
                        </Text>
                      </View>
                      <View className="self-start rounded-full border px-2.5 py-1" style={{ backgroundColor: tone.bg, borderColor: tone.border }}>
                        <Text className="text-xs font-bold" style={{ color: tone.color }}>
                          {tone.label}
                        </Text>
                      </View>
                      <Text className="mt-1.5 text-[11px] text-slate-500">
                        AFB load
                        {typeof phlegmConfidence === "number" && Number.isFinite(phlegmConfidence)
                          ? ` · ${(phlegmConfidence * 100).toFixed(0)}% conf.`
                          : ""}
                      </Text>
                    </View>
                  ) : phlegmFailed ? (
                    <View
                      className="flex-1 rounded-xl border border-amber-200 bg-amber-50 p-3"
                      style={{ minWidth: 150 }}
                    >
                      <View className="mb-1.5 flex-row items-center gap-1.5">
                        <Ionicons name="alert-circle-outline" size={14} color="#B45309" />
                        <Text className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                          Phlegm image
                        </Text>
                      </View>
                      <Text className="text-sm font-bold text-amber-900">Unavailable</Text>
                      <Text className="mt-0.5 text-[11px] text-amber-800">
                        Could not analyze the image. Open Details for the error.
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text className="mt-3 text-[11px] italic leading-4 text-slate-400">
                  Combined risk uses the higher of the two signals. Not a diagnosis.
                </Text>
              </View>
            );
          })()}

          <View className="mb-7 rounded-2xl border p-5" style={{ backgroundColor: cfg.bg, borderColor: cfg.ringColor }}>
            <View className="mb-2.5 flex-row items-center gap-2">
              <Ionicons name="information-circle" size={20} color={cfg.color} />
              <Text className="text-sm font-bold" style={{ color: cfg.color }}>
                Recommendation
              </Text>
            </View>
            <Text className="text-sm leading-6 text-gray-700">{cfg.recommendation}</Text>
          </View>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/screening/details",
                params: {
                  risk,
                  probTb: typeof probTb === "number" && Number.isFinite(probTb) ? String(probTb) : "",
                  audioUris: typeof params.audioUris === "string" ? params.audioUris : "[]",
                  imageUri: typeof params.imageUri === "string" ? params.imageUri : "",
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
                },
              } as any)
            }
            className="mb-3 items-center justify-center rounded-2xl bg-navy py-4 active:bg-navy/90"
            accessibilityRole="button"
          >
            <Text className="text-base font-bold text-white">View Details</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace({ pathname: "/home/HomeScreen" as any })}
            className="items-center justify-center rounded-2xl border border-navy/10 bg-navy/5 py-4 active:bg-navy/10"
            accessibilityRole="button"
          >
            <Text className="text-base font-bold text-navy">Return Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
    </>
  );
}
