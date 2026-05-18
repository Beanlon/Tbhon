import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
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

const SCREENING_LIST_LIMIT = 100;

const cardShadow: ViewStyle = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 3,
};

const TAGLINE: Record<GaugeRiskLevel, string> = {
  low: "Low TB Risk – Monitor symptoms.",
  moderate: "Moderate TB Risk – Further evaluation needed.",
  high: "High TB Risk – Seek medical attention.",
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
};

export function QuickResultPreviewCard({ isActive }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
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
  const tagline = latest ? TAGLINE[risk] : "";
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
    <View className="mb-6 px-5">
      <Text className="mb-3.5 text-base font-bold leading-6 text-black">Quick Result Preview</Text>

      {error ? (
        <Text className="mb-2 rounded-xl bg-[#FDEDEC] px-3 py-2 text-sm text-[#C0392B]">{error}</Text>
      ) : null}

      <Pressable
        onPress={latest ? openDetails : undefined}
        disabled={!latest}
        className="rounded-3xl border border-[#E8E8E8] bg-white active:bg-neutral-50"
        style={[
          cardShadow,
          {
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
              <View className="mb-2 h-5 w-[88%] max-w-[220px] rounded-md bg-[#EEF0F2]" />
              <View className="mb-2 h-4 w-[70%] rounded-md bg-[#F4F4F5]" />
              <View className="h-4 w-[100px] rounded-md bg-[#F4F4F5]" />
            </View>
            <View style={gaugeBoxStyle}>
              <ActivityIndicator color="#0B1530" />
            </View>
          </>
        ) : !signedIn ? (
          <>
            <View className="min-w-0" style={textStyle}>
              <Text className="mb-1.5 text-base font-bold text-[#6B7280]">Sign in to preview results</Text>
              <Text className="text-sm leading-5 text-[#9CA3AF]">
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
              <Text className="mb-1.5 text-base font-bold text-[#6B7280]">No screenings yet</Text>
              <Text className="text-sm italic text-[#888]">“This is not a medical diagnosis”</Text>
              <Text className="mt-1 text-sm text-[#bbb]">Complete a screening to see it here.</Text>
            </View>
            <View style={[gaugeBoxStyle, { opacity: 0.4 }]}>
              <GaugeChart size={gaugeSize} riskLevel="low" />
            </View>
          </>
        ) : (
          <>
            <View className="min-w-0" style={textStyle}>
              <Text className="mb-1.5 text-base font-bold text-black" numberOfLines={2}>
                {tagline}
              </Text>
              <Text className="text-sm italic text-[#888]">“This is not a medical diagnosis”</Text>
              <Text className="mt-1 text-sm text-[#bbb]">
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
