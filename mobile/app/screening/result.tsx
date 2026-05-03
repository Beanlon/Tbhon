import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type RiskLevel = "low" | "moderate" | "high";

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
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    risk?: string;
    probTb?: string;
    audioUris?: string;
    imageUri?: string;
    invalidAudio?: string;
    invalidLabel?: string;
    invalidReasons?: string;
    uploadError?: string;
    apiAttempt?: string;
    wifiRequired?: string;
  }>();

  const risk: RiskLevel =
    params.risk === "moderate" || params.risk === "high"
      ? params.risk
      : "low";

  const cfg = RISK_CONFIG[risk];
  const probTb = typeof params.probTb === "string" ? Number(params.probTb) : null;
  const invalidAudio = params.invalidAudio === "1";
  const invalidLabel = typeof params.invalidLabel === "string" ? params.invalidLabel : "";
  const uploadError = params.uploadError === "1";
  const apiAttempt = typeof params.apiAttempt === "string" ? params.apiAttempt : "";
  const wifiRequired = params.wifiRequired === "1";

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
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
          borderBottomColor: "#F1F1F1",
        }}
      >
        <View style={{ width: 44 }} />
        <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 16 }}>
          Screening Result
        </Text>
        <Pressable
          onPress={() => router.replace({ pathname: "/home/HomeScreen" as any })}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(11,21,48,0.06)" : "transparent",
          })}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color="#0B1530" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 32, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {uploadError && (
          <View
            style={{
              backgroundColor: "#FEF2F2",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: "#FECACA",
              marginBottom: 16,
            }}
          >
            {wifiRequired ? (
              <View
                style={{
                  backgroundColor: "#FFFBEB",
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: "#FCD34D",
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: "#92400E", fontWeight: "900", fontSize: 13, marginBottom: 6 }}>
                  Phone is on mobile data (4G/5G)
                </Text>
                <Text style={{ color: "#78350F", fontSize: 12, lineHeight: 18 }}>
                  Addresses like <Text style={{ fontWeight: "800" }}>192.168.x.x</Text> only work on the same{" "}
                  <Text style={{ fontWeight: "800" }}>Wi‑Fi</Text> as your PC. Turn on Wi‑Fi, join the same network as the computer running{" "}
                  <Text style={{ fontWeight: "800" }}>Expo</Text> and <Text style={{ fontWeight: "800" }}>infer_api.py</Text>, then run screening again.
                </Text>
              </View>
            ) : null}
            <Text style={{ color: "#991B1B", fontWeight: "900", fontSize: 13, marginBottom: 6 }}>
              Could not reach the analysis server
            </Text>
            {!wifiRequired ? (
            <Text style={{ color: "#7F1D1D", fontSize: 12, lineHeight: 18 }}>
              The app tries <Text style={{ fontWeight: "800" }}>http://YOUR_IP:8081/_tb_infer</Text> first (Metro proxies to port 8000).{" "}
              <Text style={{ fontWeight: "800" }}>Restart Expo</Text> after updating the project so Metro loads the proxy. If it still fails, Windows may be blocking port{" "}
              <Text style={{ fontWeight: "800" }}>8000</Text> (direct URL) — use one of these:
            </Text>
            ) : (
            <Text style={{ color: "#7F1D1D", fontSize: 12, lineHeight: 18 }}>
              After you are on Wi‑Fi, if it still fails, check Windows Firewall for port <Text style={{ fontWeight: "800" }}>8000</Text> or use:
            </Text>
            )}
            <Text style={{ color: "#7F1D1D", fontSize: 12, lineHeight: 18, marginTop: 10 }}>
              1) Open <Text style={{ fontWeight: "800" }}>PowerShell as Administrator</Text> and run (then retry):
            </Text>
            <Text
              style={{
                color: "#450A0A",
                fontSize: 11,
                marginTop: 6,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              }}
              selectable
            >
              netsh advfirewall firewall add rule name=&quot;TBhon API 8000&quot; dir=in action=allow protocol=TCP localport=8000 profile=private
            </Text>
            <Text style={{ color: "#7F1D1D", fontSize: 12, lineHeight: 18, marginTop: 10 }}>
              2) <Text style={{ fontWeight: "800" }}>Android + USB:</Text> run{" "}
              <Text style={{ fontWeight: "800" }}>adb reverse tcp:8000 tcp:8000</Text> — the app will retry via{" "}
              <Text style={{ fontWeight: "800" }}>127.0.0.1:8000</Text> automatically.
            </Text>
            <Text style={{ color: "#7F1D1D", fontSize: 12, lineHeight: 18, marginTop: 8 }}>
              Keep <Text style={{ fontWeight: "800" }}>python infer_api.py</Text> running in the <Text style={{ fontWeight: "800" }}>ml</Text> folder.
            </Text>
            {apiAttempt.length > 0 ? (
              <Text
                style={{
                  color: "#991B1B",
                  fontSize: 11,
                  marginTop: 10,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                }}
                selectable
              >
                Tried: {apiAttempt}
              </Text>
            ) : null}
          </View>
        )}
        {invalidAudio && (
          <View
            style={{
              backgroundColor: "#FFFBEB",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: "#FCD34D",
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#92400E", fontWeight: "900", fontSize: 13, marginBottom: 6 }}>
              Recording quality issue detected
            </Text>
            <Text style={{ color: "#92400E", fontSize: 12, lineHeight: 17 }}>
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
        {typeof probTb === "number" && Number.isFinite(probTb) && (
          <View style={{ marginBottom: 18, alignItems: "center" }}>
            <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "700" }}>
              TB probability (avg): {(probTb * 100).toFixed(1)}%
            </Text>
          </View>
        )}
        {/* Risk indicator */}
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          {/* Outer ring */}
          <View
            style={{
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: cfg.bg,
              borderWidth: 6,
              borderColor: cfg.ringColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Inner circle */}
            <View
              style={{
                width: 130,
                height: 130,
                borderRadius: 65,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: cfg.color,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 4,
              }}
            >
              <Text style={{ fontSize: 52 }}>{cfg.emoji}</Text>
            </View>
          </View>

          {/* Label */}
          <Text
            style={{
              marginTop: 20,
              fontSize: 28,
              fontWeight: "900",
              color: cfg.color,
              textAlign: "center",
            }}
          >
            {cfg.label}
          </Text>

          {/* Tagline */}
          <Text
            style={{
              marginTop: 8,
              fontSize: 15,
              fontWeight: "700",
              color: "#0B1530",
              textAlign: "center",
            }}
          >
            {cfg.tagline}
          </Text>

          {/* Disclaimer */}
          <Text
            style={{
              marginTop: 6,
              fontSize: 12,
              color: "#999999",
              textAlign: "center",
              fontStyle: "italic",
            }}
          >
            This is not a medical diagnosis
          </Text>
        </View>

        {/* Recommendation card */}
        <View
          style={{
            backgroundColor: cfg.bg,
            borderRadius: 16,
            padding: 18,
            borderWidth: 1,
            borderColor: cfg.ringColor,
            marginBottom: 28,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <Ionicons name="information-circle" size={20} color={cfg.color} />
            <Text style={{ fontSize: 14, fontWeight: "800", color: cfg.color }}>
              Recommendation
            </Text>
          </View>
          <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22 }}>
            {cfg.recommendation}
          </Text>
        </View>

        {/* Buttons */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/screening/details",
              params: {
                risk,
                probTb: typeof probTb === "number" && Number.isFinite(probTb) ? String(probTb) : "",
                audioUris: typeof params.audioUris === "string" ? params.audioUris : "[]",
                imageUri: typeof params.imageUri === "string" ? params.imageUri : "",
                invalidAudio: invalidAudio ? "1" : "0",
                invalidLabel,
                invalidReasons: typeof params.invalidReasons === "string" ? params.invalidReasons : "[]",
              },
            } as any)
          }
          style={({ pressed }) => ({
            backgroundColor: pressed ? "rgba(11,21,48,0.88)" : "#0B1530",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          })}
          accessibilityRole="button"
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
            View Details
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace({ pathname: "/home/HomeScreen" as any })}
          style={({ pressed }) => ({
            backgroundColor: pressed ? "rgba(11,21,48,0.06)" : "rgba(11,21,48,0.04)",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(11,21,48,0.10)",
          })}
          accessibilityRole="button"
        >
          <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 15 }}>
            Return Home
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
