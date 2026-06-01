import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  COUGH_QUALITY_LABEL_MSG,
  type CoughQualityLabel,
  type CoughQualityStatus,
} from "../utils/coughQualityCheck";

export function CoughQualityBadge({
  status,
  label,
}: {
  status: CoughQualityStatus;
  label: CoughQualityLabel;
}) {
  if (status === "skipped") return null;

  if (status === "unavailable") {
    return (
      <View className="mt-3.5 flex-row items-start gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-2.5">
        <View className="mt-px">
          <Ionicons name="cloud-offline-outline" size={18} color="#fbbf24" />
        </View>
        <View className="flex-1">
          <Text className="mb-0.5 text-sm font-bold text-amber-400">Quality check unavailable</Text>
          <Text className="text-sm text-amber-400/85">
            Could not reach the ML API. Check EXPO_PUBLIC_TB_API_URL in mobile/.env, restart Expo with -c, then tap Retry quality check.
          </Text>
        </View>
      </View>
    );
  }

  if (status === "checking") {
    return (
      <View className="mt-3.5 flex-row items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5">
        <Ionicons name="sync-outline" size={18} color="rgba(255,255,255,0.7)" />
        <Text className="text-sm font-semibold text-white/70">Checking recording quality…</Text>
      </View>
    );
  }

  if (status === "ok") {
    return (
      <View className="mt-3.5 flex-row items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/15 px-4 py-2.5">
        <Ionicons name="checkmark-circle" size={18} color="#34D399" />
        <Text className="text-sm font-bold text-emerald-400">Good take — cough detected</Text>
      </View>
    );
  }

  const msg = COUGH_QUALITY_LABEL_MSG[label] ?? "Recording may not be a clear cough";
  return (
    <View className="mt-3.5 flex-row items-start gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-2.5">
      <View className="mt-px">
        <Ionicons name="warning-outline" size={18} color="#fbbf24" />
      </View>
      <View className="flex-1">
        <Text className="mb-0.5 text-sm font-bold text-amber-400">Poor quality — redo recommended</Text>
        <Text className="text-sm text-amber-400/85">{msg}</Text>
      </View>
    </View>
  );
}
