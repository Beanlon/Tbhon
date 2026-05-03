import { Pressable, ScrollView, Text, View } from "react-native";
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
  const params = useLocalSearchParams<{ risk?: string }>();

  const risk: RiskLevel =
    params.risk === "moderate" || params.risk === "high"
      ? params.risk
      : "low";

  const cfg = RISK_CONFIG[risk];

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
          onPress={() => {}}
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
