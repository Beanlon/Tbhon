import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ApiError,
  listMyScreenings,
  type ScreeningHistoryRow,
} from "../../services/backendApi";
import { getAuthToken } from "../../utils/authStorage";
import {
  clearScreeningCache,
  isScreeningCacheFresh,
  peekScreenings,
  setCachedScreenings,
} from "../../utils/screeningHistoryCache";

const SCREENING_LIST_LIMIT = 100;

type RiskLevel = "low" | "moderate" | "high";

interface ScreeningRecord {
  sessionId: string;
  dateMs: number;
  date: string;
  time: string;
  risk: RiskLevel;
  tagline: string;
}

const RISK_META: Record<RiskLevel, { label: string; color: string; bg: string; icon: string }> = {
  low: { label: "Low Risk", color: "#16A34A", bg: "#F0FDF4", icon: "checkmark-circle" },
  moderate: { label: "Moderate Risk", color: "#D97706", bg: "#FFFBEB", icon: "warning" },
  high: { label: "High Risk", color: "#DC2626", bg: "#FEF2F2", icon: "alert-circle" },
};

const TAGLINE: Record<RiskLevel, string> = {
  low: "Low TB Risk – Monitor symptoms.",
  moderate: "Moderate TB Risk – Further evaluation needed.",
  high: "High TB Risk – Seek medical attention.",
};

function coerceRisk(raw: string | null | undefined): RiskLevel {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "moderate" || s === "high") return s;
  return "low";
}

function rowToRecord(row: ScreeningHistoryRow): ScreeningRecord {
  const risk = coerceRisk(row.finalRiskLevel ?? row.result?.riskLevel);
  const iso = row.completedAt ?? row.startedAt;
  const d = new Date(iso);
  const dateMs = Number.isFinite(d.getTime()) ? d.getTime() : Date.now();
  const display = new Date(dateMs);
  return {
    sessionId: row.sessionId,
    dateMs,
    date: display.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: display.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    risk,
    tagline: TAGLINE[risk],
  };
}

const RISK_FILTERS: { key: "all" | RiskLevel; label: string }[] = [
  { key: "all", label: "All" },
  { key: "low", label: "Low" },
  { key: "moderate", label: "Moderate" },
  { key: "high", label: "High" },
];

type SortKey = "newest" | "oldest";
type DateRange = "all" | "7d" | "30d" | "90d" | "custom";

const DATE_RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
];

const historyCardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

function daysAgoMs(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export default function HistoryScreen({ onTabChange: _onTabChange }: { onTabChange?: (idx: number) => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [showFilter, setShowFilter] = useState(false);

  const [tmpSort, setTmpSort] = useState<SortKey>("newest");
  const [tmpDateRange, setTmpDateRange] = useState<DateRange>("all");

  const [rows, setRows] = useState<ScreeningHistoryRow[]>(() => peekScreenings() ?? []);
  const [loading, setLoading] = useState(() => !peekScreenings());
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(true);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    setLoadError(null);
    const token = await getAuthToken();
    if (!token) {
      clearScreeningCache();
      setSignedIn(false);
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setSignedIn(true);

    const forceNetwork = mode === "refresh";

    if (!forceNetwork && isScreeningCacheFresh()) {
      const fresh = peekScreenings();
      if (fresh) {
        setRows(fresh);
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    if (!forceNetwork && mode === "initial") {
      const stale = peekScreenings();
      if (stale) {
        setRows(stale);
        setLoading(false);
        try {
          const { screenings } = await listMyScreenings(SCREENING_LIST_LIMIT);
          setRows(screenings);
          setCachedScreenings(screenings);
        } catch (e) {
          const message =
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : "Could not load history.";
          setLoadError(message);
        }
        return;
      }
    }

    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    try {
      const { screenings } = await listMyScreenings(SCREENING_LIST_LIMIT);
      setRows(screenings);
      setCachedScreenings(screenings);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not load history.";
      setLoadError(message);
      if (!peekScreenings()) {
        setRows([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const openFilter = () => {
    setTmpSort(sortKey);
    setTmpDateRange(dateRange);
    setShowFilter(true);
  };

  const applyFilter = () => {
    setSortKey(tmpSort);
    setDateRange(tmpDateRange);
    setShowFilter(false);
  };

  const minMs =
    dateRange === "7d" ? daysAgoMs(7) : dateRange === "30d" ? daysAgoMs(30) : dateRange === "90d" ? daysAgoMs(90) : 0;

  const records = useMemo(() => {
    return rows
      .map(rowToRecord)
      .filter((r) => riskFilter === "all" || r.risk === riskFilter)
      .filter((r) => r.dateMs >= minMs)
      .sort((a, b) => (sortKey === "newest" ? b.dateMs - a.dateMs : a.dateMs - b.dateMs));
  }, [rows, riskFilter, minMs, sortKey]);

  const hasActiveFilters = sortKey !== "newest" || dateRange !== "all";

  const headerPadTop = Math.max(insets.top, 16) + 10;
  const modalPadBottom = Math.max(insets.bottom, 16) + 16;

  const openDetails = (sessionId: string) => {
    router.push({
      pathname: "/screening/details",
      params: { sessionId },
    });
  };

  return (
    <View className="flex-1 bg-white">
      <View
        className="border-b border-[#F1F1F1] px-5 pb-3.5"
        style={{ paddingTop: headerPadTop }}
      >
        <View className="flex-row items-center">
          <View className="h-10 w-10" />

          <View className="min-w-0 flex-1">
            <Text className="text-center text-lg font-black text-[#0B1530]" numberOfLines={1}>
              Screening History
            </Text>
          </View>

          <Pressable
            onPress={openFilter}
            className="relative h-10 w-10 items-center justify-center rounded-full"
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#F1F1F1" : hasActiveFilters ? "#EFF6FF" : "transparent",
            })}
          >
            <Ionicons
              name="options-outline"
              size={22}
              color={hasActiveFilters ? "#0B1530" : "#666"}
            />
            {hasActiveFilters && (
              <View className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#0B1530]" />
            )}
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3.5"
          contentContainerStyle={{ gap: 8 }}
        >
          {RISK_FILTERS.map((f) => {
            const active = riskFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setRiskFilter(f.key)}
                className="rounded-full border px-4 py-1.5"
                style={{
                  backgroundColor: active ? "#0B1530" : "#F3F4F6",
                  borderColor: active ? "#0B1530" : "#E5E7EB",
                }}
              >
                <Text
                  className="text-base font-bold"
                  style={{ color: active ? "#FFF" : "#374151" }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {hasActiveFilters && (
          <View className="mt-2.5 flex-row items-center gap-1.5">
            <Ionicons name="funnel" size={12} color="#6B7280" />
            <Text className="text-sm text-[#6B7280]">
              {DATE_RANGE_OPTIONS.find((d) => d.key === dateRange)?.label}
              {" · "}
              {SORT_OPTIONS.find((s) => s.key === sortKey)?.label}
            </Text>
            <Pressable
              onPress={() => {
                setSortKey("newest");
                setDateRange("all");
              }}
              className="ml-1"
            >
              <Text className="text-sm font-bold text-[#0B1530]">Clear</Text>
            </Pressable>
          </View>
        )}

        {loadError ? (
          <Text className="mt-3 rounded-xl bg-[#FDEDEC] px-3 py-2 text-sm text-[#C0392B]">
            {loadError}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center pt-10">
          <ActivityIndicator size="large" color="#0B1530" />
          <Text className="mt-3 text-base text-[#9CA3AF]">Loading your screenings…</Text>
        </View>
      ) : !signedIn ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 48 }} showsVerticalScrollIndicator={false}>
          <View className="items-center">
            <Ionicons name="lock-closed-outline" size={48} color="#D1D5DB" />
            <Text className="mt-3 text-center text-base font-bold text-[#6B7280]">
              Sign in to see screening history
            </Text>
            <Text className="mt-2 text-center text-base leading-6 text-[#9CA3AF]">
              Completed screenings are saved to your account when you finish a session while signed in.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 14 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#0B1530" />
          }
        >
          {records.length === 0 && (
            <View className="items-center pt-16">
              <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" />
              <Text className="mt-3 text-base font-bold text-[#9CA3AF]">No records found</Text>
              <Text className="mt-1 text-center text-base text-[#D1D5DB]">
                {hasActiveFilters ? "Try changing your filters" : "Complete a screening to build your history"}
              </Text>
            </View>
          )}

          {records.map((record) => {
            const meta = RISK_META[record.risk];
            return (
              <Pressable
                key={record.sessionId}
                onPress={() => openDetails(record.sessionId)}
                className="rounded-2xl border border-[#F1F1F1] bg-white p-4 active:bg-gray-100"
                style={historyCardShadow}
                accessibilityRole="button"
                accessibilityLabel={`Screening summary, ${meta.label}`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="mr-3 flex-1">
                    <View
                      className="mb-2 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1"
                      style={{ backgroundColor: meta.bg }}
                    >
                      <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      <Text className="text-base font-extrabold" style={{ color: meta.color }}>
                        {meta.label}
                      </Text>
                    </View>
                    <Text className="mb-1 text-base font-bold text-[#0B1530]">{record.tagline}</Text>
                    <Text className="text-base text-[#9CA3AF]">
                      {record.date} · {record.time}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                </View>
              </Pressable>
            );
          })}
          <View className="h-2" />
        </ScrollView>
      )}

      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <Pressable
          className="flex-1"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onPress={() => setShowFilter(false)}
        />
        <View
          className="rounded-t-3xl bg-white px-5 pt-3"
          style={{ paddingBottom: modalPadBottom }}
        >
          <View className="mb-4 h-1 w-10 self-center rounded-sm bg-[#E5E7EB]" />

          <Text className="mb-5 text-lg font-black text-[#0B1530]">Filter & Sort</Text>

          <Text className="mb-2.5 text-base font-extrabold uppercase tracking-wide text-[#6B7280]">
            Date range
          </Text>
          <View className="mb-5 flex-row flex-wrap gap-2">
            {DATE_RANGE_OPTIONS.map((opt) => {
              const active = tmpDateRange === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setTmpDateRange(opt.key)}
                  className="rounded-full border px-4 py-2.5"
                  style={{
                    backgroundColor: active ? "#0B1530" : "#F3F4F6",
                    borderColor: active ? "#0B1530" : "#E5E7EB",
                  }}
                >
                  <Text
                    className="text-base font-bold"
                    style={{ color: active ? "#FFF" : "#374151" }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-2.5 text-base font-extrabold uppercase tracking-wide text-[#6B7280]">
            Sort by
          </Text>
          <View className="mb-7 flex-row gap-2">
            {SORT_OPTIONS.map((opt) => {
              const active = tmpSort === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setTmpSort(opt.key)}
                  className="flex-1 items-center rounded-xl border py-3"
                  style={{
                    backgroundColor: active ? "#0B1530" : "#F3F4F6",
                    borderColor: active ? "#0B1530" : "#E5E7EB",
                  }}
                >
                  <Text
                    className="text-base font-bold"
                    style={{ color: active ? "#FFF" : "#374151" }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => {
                setTmpSort("newest");
                setTmpDateRange("all");
              }}
              className="flex-1 items-center rounded-2xl border border-[#E5E7EB] py-3.5"
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#F3F4F6" : "#F9FAFB",
              })}
            >
              <Text className="text-base font-extrabold text-[#374151]">Reset</Text>
            </Pressable>
            <Pressable
              onPress={applyFilter}
              className="flex-[2] items-center rounded-2xl py-3.5"
              style={({ pressed }) => ({
                backgroundColor: pressed ? "rgba(11,21,48,0.88)" : "#0B1530",
              })}
            >
              <Text className="text-base font-black text-white">Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
