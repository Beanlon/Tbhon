import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  ApiError,
  listMyScreenings,
  type ScreeningHistoryRow,
} from "../../../services/backendApi";
import { getAuthToken } from "../../../utils/authStorage";
import {
  isScreeningCacheFresh,
  peekLatestScreening,
  peekScreenings,
  setCachedScreenings,
  clearScreeningCache,
} from "../../../utils/screeningHistoryCache";
import { GaugeChart, type GaugeRiskLevel } from "./GaugeChart";
import { useTheme } from "../../../contexts/ThemeContext";

const SCREENING_LIST_LIMIT = 100;

const cardShadow: ViewStyle = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 3,
};

function coerceRisk(raw: string | null | undefined): GaugeRiskLevel {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "moderate" || s === "high") return s;
  return "low";
}

function formatCompletedAt(row: ScreeningHistoryRow): { date: string; time: string } {
  const iso = row.completedAt ?? row.startedAt;
  const d = new Date(iso);
  const dateMs = Number.isFinite(d.getTime()) ? d.getTime() : Date.now();
  const display = new Date(dateMs);
  return {
    date: display.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: display.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

type Props = {
  /** When false, skip network refresh (home tab inactive). */
  isActive: boolean;
  onHistoryPress?: () => void;
};

const RISK_LABEL: Record<GaugeRiskLevel, string> = {
  low: "Low TB Risk",
  moderate: "Moderate TB Risk",
  high: "High TB Risk",
};

const RISK_TAG_BG: Record<GaugeRiskLevel, string> = {
  low: "#DCFCE7",
  moderate: "#FEF9C3",
  high: "#FEE2E2",
};

const RISK_TAG_COLOR: Record<GaugeRiskLevel, string> = {
  low: "#15803D",
  moderate: "#A16207",
  high: "#B91C1C",
};

const ACTION_LABEL: Record<GaugeRiskLevel, string> = {
  low: "Monitor symptoms",
  moderate: "Further evaluation needed",
  high: "Seek medical attention",
};

export function QuickResultPreviewCard({ isActive, onHistoryPress }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(() => !peekLatestScreening());
  const [signedIn, setSignedIn] = useState(true);
  const [latest, setLatest] = useState<ScreeningHistoryRow | null>(() => peekLatestScreening());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setError(null);
    const token = await getAuthToken();
    if (!token) {
      clearScreeningCache();
      setSignedIn(false);
      setLatest(null);
      setLoading(false);
      return;
    }
    setSignedIn(true);

    if (!force && isScreeningCacheFresh()) {
      const cached = peekScreenings();
      setLatest(cached?.[0] ?? null);
      setLoading(false);
      return;
    }

    const stale = peekScreenings();
    if (!force && stale) {
      setLatest(stale[0] ?? null);
      setLoading(false);
      try {
        const { screenings } = await listMyScreenings(SCREENING_LIST_LIMIT);
        setCachedScreenings(screenings);
        setLatest(screenings[0] ?? null);
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not load your latest result.";
        setError(message);
      }
      return;
    }

    setLoading(true);
    try {
      const { screenings } = await listMyScreenings(SCREENING_LIST_LIMIT);
      setCachedScreenings(screenings);
      setLatest(screenings[0] ?? null);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not load your latest result.";
      setError(message);
      setLatest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;
    void load();
  }, [isActive, load]);

  const risk = latest ? coerceRisk(latest.finalRiskLevel ?? latest.result?.riskLevel) : "low";
  const when = latest ? formatCompletedAt(latest) : null;
  const isTinyPhone = width < 340;
  const gaugeSize = Math.min(isTinyPhone ? 84 : 100, Math.max(76, Math.round(width * 0.24)));
  const gaugeHeight = gaugeSize / 2 + 22 * (gaugeSize / 150);
  const textStyle: ViewStyle = {
    flex: 1,
    minWidth: 0,
    paddingRight: isTinyPhone ? 0 : 12,
  };
  const gaugeBoxStyle: ViewStyle = {
    width: gaugeSize,
    height: gaugeHeight,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    alignSelf: isTinyPhone ? "flex-end" : "center",
  };

  const openDetails = () => {
    if (!latest?.sessionId) return;
    router.push({
      pathname: "/screening/details",
      params: { sessionId: latest.sessionId },
    });
  };

  return (
    <View className="mt-5 mb-6 px-5">
      <View className="mb-3.5 flex-row items-center justify-between">
        <Text style={{ color: colors.text }} className="text-[17px] font-extrabold leading-6">
          Quick Result Preview
        </Text>
        {onHistoryPress ? (
          <Pressable
            onPress={onHistoryPress}
            hitSlop={8}
            className="flex-row items-center gap-0.5"
            accessibilityRole="button"
            accessibilityLabel="Open screening history"
          >
            <Text style={{ color: colors.accent }} className="text-sm font-semibold">History</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={{ backgroundColor: colors.errorBg, color: colors.error }} className="mb-2 rounded-xl px-3 py-2 text-sm">{error}</Text>
      ) : null}

      <Pressable
        onPress={latest ? openDetails : undefined}
        disabled={!latest}
        className="rounded-3xl border active:opacity-90"
        style={[
          cardShadow,
          {
            backgroundColor: colors.card,
            borderColor: colors.cardBorder,
            flexDirection: isTinyPhone ? "column" : "row",
            alignItems: isTinyPhone ? "stretch" : "center",
            justifyContent: "space-between",
            gap: isTinyPhone ? 12 : 8,
            padding: isTinyPhone ? 14 : 16,
          },
        ]}
        accessibilityRole={latest ? "button" : "none"}
        accessibilityLabel={latest ? "Latest screening summary, open details" : undefined}
      >
        {loading ? (
          <>
            <View className="min-w-0" style={textStyle}>
              <View className="mb-2 h-5 w-[88%] max-w-[220px] rounded-md" style={{ backgroundColor: colors.surfaceAlt }} />
              <View className="mb-2 h-4 w-[70%] rounded-md" style={{ backgroundColor: colors.surfaceAlt }} />
              <View className="h-4 w-[100px] rounded-md" style={{ backgroundColor: colors.surfaceAlt }} />
            </View>
            <View style={gaugeBoxStyle}>
              <ActivityIndicator color={colors.text} />
            </View>
          </>
        ) : !signedIn ? (
          <>
            <View className="min-w-0" style={textStyle}>
              <Text style={{ color: colors.textSecondary }} className="mb-1.5 text-base font-bold">Sign in to preview results</Text>
              <Text style={{ color: colors.textMuted }} className="text-sm leading-5">
                Your most recent completed screening appears here after you sign in.
              </Text>
            </View>
            <View style={[gaugeBoxStyle, { opacity: 0.4 }]}>
              <GaugeChart size={gaugeSize} riskLevel="low" />
            </View>
          </>
        ) : !latest ? (
          <>
            <View className="min-w-0" style={textStyle}>
              <Text style={{ color: colors.textSecondary }} className="mb-1.5 text-base font-bold">No screening results yet</Text>
              <Text className="text-sm italic">“This is not a medical diagnosis”</Text>
              <Text style={{ color: colors.textMuted }} className="mt-1 text-sm font-semibold">
                Begin a screening to generate your first result preview.
              </Text>
            </View>
            <View style={gaugeBoxStyle}>
              <GaugeChart size={gaugeSize} riskLevel="low" disabled />
            </View>
          </>
        ) : (
          <>
            <View className="min-w-0" style={textStyle}>
              <View
                className="mb-2.5 flex-row items-center self-start rounded-full px-2.5 py-1"
                style={{ backgroundColor: RISK_TAG_BG[risk] }}
              >
                <View
                  className="mr-1.5 size-1.5 rounded-full"
                  style={{ backgroundColor: RISK_TAG_COLOR[risk] }}
                />
                <Text
                  className="text-xs font-bold"
                  style={{ color: RISK_TAG_COLOR[risk] }}
                >
                  {RISK_LABEL[risk]}
                </Text>
              </View>
              <Text style={{ color: colors.text }} className="mb-1.5 text-base font-bold" numberOfLines={2}>
                {ACTION_LABEL[risk]}
              </Text>
              <Text style={{ color: colors.textMuted }} className="text-sm italic">*This is not a medical diagnosis*</Text>
              <Text style={{ color: colors.textMuted }} className="mt-1 text-sm">
                {when ? `${when.date} · ${when.time}` : ""}
              </Text>
            </View>
            <View style={gaugeBoxStyle}>
              <GaugeChart size={gaugeSize} riskLevel={risk} />
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
}
