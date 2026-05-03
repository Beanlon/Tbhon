import { ScrollView, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const insets = useSafeAreaInsets();
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

  // Transparency: image is collected but not yet included in the ML score.
  const imageAnalyzed = false;

  const invalidAudio = params.invalidAudio === "1";
  const invalidLabel = typeof params.invalidLabel === "string" ? params.invalidLabel : "";
  let invalidReasons: string[] = [];
  if (typeof params.invalidReasons === "string" && params.invalidReasons.length) {
    try {
      const v = JSON.parse(params.invalidReasons);
      if (Array.isArray(v)) invalidReasons = v.filter((x) => typeof x === "string");
    } catch {
      invalidReasons = [];
    }
  }

  const copy = RISK_COPY[risk];

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: "#EEF2F7",
        marginBottom: 12,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "900", color: "#0B1530", marginBottom: 10 }}>
        {title}
      </Text>
      {children}
    </View>
  );

  const Bullet = ({ text }: { text: string }) => (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: copy.color, marginTop: 6 }} />
      <Text style={{ flex: 1, color: "#334155", fontSize: 13, lineHeight: 19 }}>{text}</Text>
    </View>
  );

  const CheckRow = ({ ok, label, sub }: { ok: boolean; label: string; sub?: string }) => (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
      <Ionicons name={ok ? "checkmark-circle" : "information-circle"} size={18} color={ok ? "#10B981" : "#64748B"} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#0B1530", fontWeight: "800", fontSize: 13 }}>{label}</Text>
        {sub ? <Text style={{ color: "#64748B", fontSize: 12, marginTop: 2, lineHeight: 16 }}>{sub}</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 16) + 8,
          paddingHorizontal: 18,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(15,23,42,0.06)",
          backgroundColor: "#F8FAFC",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(11,21,48,0.06)" : "rgba(11,21,48,0.04)",
          })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#0B1530" />
        </Pressable>

        <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 16 }}>
          Result Details
        </Text>

        <View style={{ width: 44, height: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: Math.max(insets.bottom, 16) + 22 }}
      >
        {invalidAudio && (
          <View
            style={{
              backgroundColor: "#FFFBEB",
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: "#FCD34D",
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "900", color: "#92400E", marginBottom: 8 }}>
              Audio authenticity check
            </Text>
            <Text style={{ color: "#92400E", fontSize: 13, lineHeight: 19 }}>
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
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: "#92400E", fontSize: 12, fontWeight: "800", marginBottom: 6 }}>
                  Detected issues
                </Text>
                {invalidReasons.map((r) => (
                  <Text key={r} style={{ color: "#92400E", fontSize: 12, lineHeight: 17 }}>
                    - {r}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 1) Risk Breakdown */}
        <Card title="Risk Breakdown">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: copy.pillBg,
                borderWidth: 1,
                borderColor: "rgba(15,23,42,0.08)",
              }}
            >
              <Text style={{ color: copy.color, fontWeight: "900", fontSize: 13 }}>{copy.title}</Text>
            </View>
            {hasProb ? (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 13 }}>
                  Confidence: {(confidence * 100).toFixed(0)}%
                </Text>
                <Text style={{ color: "#64748B", fontSize: 12 }}>
                  TB probability: {(probTb * 100).toFixed(1)}%
                </Text>
              </View>
            ) : (
              <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "700" }}>Confidence: —</Text>
            )}
          </View>

          <Text style={{ color: "#334155", fontSize: 13, lineHeight: 19 }}>{copy.simple}</Text>
        </Card>

        {/* 2) Input Summary */}
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

        {/* 3) Factor Insights */}
        <Card title="Factor Insights">
          {copy.factors.map((t) => (
            <Bullet key={t} text={t} />
          ))}
          {!imageAnalyzed && imageProvided && (
            <Bullet text="No visible high-risk indicators in phlegm: not evaluated yet (image model not connected)." />
          )}
        </Card>

        {/* 4) Recommendations */}
        <Card title="Recommendations">
          {copy.recommendations.map((t) => (
            <Bullet key={t} text={t} />
          ))}
        </Card>

        {/* 5) Disclaimer */}
        <Card title="Disclaimer">
          <Text style={{ color: "#475569", fontSize: 13, lineHeight: 19, fontStyle: "italic" }}>
            This result is not a medical diagnosis.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

