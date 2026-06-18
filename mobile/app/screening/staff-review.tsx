import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../contexts/ThemeContext";
import {
  SCREENING_DISCLAIMER_SCOPE,
  SCREENING_STAFF_REFERRAL_LINE,
} from "../../constants/screeningDisclaimer";

type RiskLevel = "low" | "moderate" | "high";

const RISK_LABEL: Record<RiskLevel, { label: string; color: string; bg: string }> = {
  low: { label: "Low risk", color: "#16A34A", bg: "#F0FDF4" },
  moderate: { label: "Moderate risk", color: "#D97706", bg: "#FFFBEB" },
  high: { label: "High risk", color: "#DC2626", bg: "#FEF2F2" },
};

function coerceRisk(raw: string | undefined): RiskLevel {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "moderate" || s === "high") return s;
  return "low";
}

/** Staff gate before the patient-facing result screen (gap #11). */
export default function StaffReviewScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<Record<string, string | undefined>>();
  const [staffNotes, setStaffNotes] = useState("");

  const risk = coerceRisk(params.risk);
  const cfg = RISK_LABEL[risk];
  const probTb =
    typeof params.probTb === "string" && params.probTb.trim().length > 0
      ? Number(params.probTb)
      : null;

  const forwardParams = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.length > 0) out[key] = value;
    }
    if (staffNotes.trim().length > 0) out.staffNotes = staffNotes.trim();
    out.staffResultConfirmed = "1";
    return out;
  }, [params, staffNotes]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar style={colors.statusBar} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4 flex-row items-center gap-2">
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
          <Text className="text-lg font-black" style={{ color: colors.text }}>
            Staff review
          </Text>
        </View>

        <Text className="mb-4 text-sm leading-6" style={{ color: colors.textSecondary }}>
          Confirm the triage output before showing the result screen. {SCREENING_DISCLAIMER_SCOPE}
        </Text>

        <View
          className="mb-4 rounded-2xl border px-4 py-4"
          style={{ borderColor: cfg.color, backgroundColor: cfg.bg }}
        >
          <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: cfg.color }}>
            Triage level
          </Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: cfg.color }}>
            {cfg.label}
          </Text>
          {probTb !== null && Number.isFinite(probTb) ? (
            <Text className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
              Fused TB probability: {(probTb * 100).toFixed(1)}%
            </Text>
          ) : null}
          {params.invalidAudio === "1" ? (
            <Text className="mt-2 text-sm font-semibold text-amber-700">
              Audio quality flag — review before release.
            </Text>
          ) : null}
          {typeof params.sputumSkipReason === "string" && params.sputumSkipReason.length > 0 ? (
            <Text className="mt-2 text-sm leading-5" style={{ color: colors.textSecondary }}>
              No smear: {params.sputumSkipReason}
            </Text>
          ) : null}
          {params.resultStage === "preliminary" ? (
            <Text className="mt-2 text-sm font-semibold leading-5" style={{ color: cfg.color }}>
              Preliminary — sputum smear pending
              {typeof params.sputumDeferReason === "string" && params.sputumDeferReason.length > 0
                ? `: ${params.sputumDeferReason}`
                : ""}
            </Text>
          ) : null}
        </View>

        {(risk === "moderate" || risk === "high") && (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surfaceAlt }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              {SCREENING_STAFF_REFERRAL_LINE}
            </Text>
          </View>
        )}

        <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
          Staff notes (optional)
        </Text>
        <TextInput
          value={staffNotes}
          onChangeText={setStaffNotes}
          placeholder="Booth observations, referral coordination, etc."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          className="mb-5 min-h-[96px] rounded-2xl border px-3 py-3 text-base"
          style={{
            borderColor: colors.inputBorder,
            backgroundColor: colors.inputBg,
            color: colors.text,
            textAlignVertical: "top",
          }}
        />

        <Pressable
          onPress={() =>
            router.replace({
              pathname: "/screening/result",
              params: forwardParams,
            } as any)
          }
          className="items-center rounded-2xl py-4 active:opacity-90"
          style={{ backgroundColor: isDark ? colors.heroButtonBg : "#243D82" }}
        >
          <Text className="text-base font-bold text-white">Confirm & show result</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
