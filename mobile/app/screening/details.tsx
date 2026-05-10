import { type ReactNode, useMemo } from "react";
import { ScrollView, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

type RiskLevel = "low" | "moderate" | "high";

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
    recommendations: ["Monitor symptoms", "Re-screen after 3–5 days", "Consult a healthcare provider if symptoms persist"],
    color: "#16A34A",
    pillBg: "rgba(22,163,74,0.10)",
  },
  moderate: {
    title: "Moderate Risk",
    simple: "The system detected some patterns that may require further evaluation.",
    factors: ["Some irregular cough patterns detected"],
    recommendations: ["Consider re-screening after 1–3 days", "Consult a healthcare provider for further evaluation", "Seek care sooner if symptoms worsen"],
    color: "#D97706",
    pillBg: "rgba(217,119,6,0.12)",
  },
  high: {
    title: "High Risk",
    simple: "The system detected patterns associated with higher TB risk. Further medical evaluation is recommended.",
    factors: ["Irregular cough patterns detected"],
    recommendations: ["Consult a healthcare provider as soon as possible", "Follow local TB testing guidance", "Seek urgent care if you have severe symptoms"],
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

export default function ScreeningDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ risk?: string; probTb?: string; audioUris?: string; imageUri?: string; invalidAudio?: string; invalidLabel?: string; invalidReasons?: string }>();

  const risk: RiskLevel =
    params.risk === "moderate" || params.risk === "high"
      ? params.risk
      : "low";

  const probTb = typeof params.probTb === "string" ? Number(params.probTb) : NaN;
  const hasProb = Number.isFinite(probTb);
  const confidence = hasProb ? Math.max(probTb, 1 - probTb) : NaN;

  const audioUris = parseAudioUris(params.audioUris);
  const audioAnalyzed = audioUris.length > 0;

  const imageUri = typeof params.imageUri === "string" ? params.imageUri : "";
  const imageProvided = imageUri.length > 0;

  const imageAnalyzed = false;

  const invalidAudio = params.invalidAudio === "1";
  const invalidLabel = typeof params.invalidLabel === "string" ? params.invalidLabel : "";
  const invalidReasons = useMemo(() => {
    if (typeof params.invalidReasons !== "string" || !params.invalidReasons.length) return [];
    try {
      const v = JSON.parse(params.invalidReasons);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [params.invalidReasons]);

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
          <Text className="mt-1 text-center text-sm font-semibold text-slate-500 sm:text-base">
            Inputs & insights
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
                  <Text className="text-sm text-slate-500">TB probability: {(probTb * 100).toFixed(1)}%</Text>
                </View>
              ) : (
                <Text className="text-sm font-bold text-slate-500">Confidence: —</Text>
              )}
            </View>

            <Text className="text-base leading-6 text-slate-700">{copy.simple}</Text>
          </Card>

          <Card title="Input Summary">
            <CheckRow ok={audioAnalyzed} label="Cough audio analyzed" sub={audioAnalyzed ? `Clips: ${audioUris.length}` : "No recorded audio was provided."} />
            <CheckRow
              ok={imageProvided}
              label={imageProvided ? "Phlegm image received" : "Phlegm image not provided"}
              sub={
                imageProvided
                  ? imageAnalyzed
                    ? "Image analysis included in this result."
                    : "Image is collected for transparency, but analysis is not yet included in the score."
                  : undefined
              }
            />
          </Card>

          <Card title="Factor Insights">
            {copy.factors.map((t) => (
              <Bullet key={t} text={t} />
            ))}
            {!imageAnalyzed && imageProvided && (
              <Bullet text="No visible high-risk indicators in phlegm: not evaluated yet (image model not connected)." />
            )}
          </Card>

          <Card title="Recommendations">
            {copy.recommendations.map((t) => (
              <Bullet key={t} text={t} />
            ))}
          </Card>

          <Card title="Disclaimer">
            <Text className="text-base italic leading-6 text-slate-600">
              This result is not a medical diagnosis.
            </Text>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
    </>
  );
}
