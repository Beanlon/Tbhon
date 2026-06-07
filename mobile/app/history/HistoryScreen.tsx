import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
import { formatClientFullName, formatClientHistoryMeta } from "../../utils/clientDisplay";
import {
  NO_PATIENT_ON_FILE,
  PATIENT_HISTORY_EMPTY,
  PATIENT_HISTORY_LOADING,
  PATIENT_HISTORY_SIGN_IN_BODY,
  PATIENT_HISTORY_SIGN_IN_TITLE,
  PATIENT_HISTORY_TITLE,
  STAFF_HISTORY_EMPTY,
  STAFF_HISTORY_LOADING,
  STAFF_HISTORY_SIGN_IN_BODY,
  STAFF_HISTORY_SIGN_IN_TITLE,
  STAFF_HISTORY_TITLE,
} from "../../constants/accountModel";
import { useTheme } from "../../contexts/ThemeContext";
import { isPatientRole, parseUserRole } from "../../constants/userRole";
import { peekProfile } from "../../utils/profileCache";

const SCREENING_LIST_LIMIT = 100;

type RiskLevel = "low" | "moderate" | "high";

interface ScreeningRecord {
  sessionId: string;
  dateMs: number;
  date: string;
  time: string;
  risk: RiskLevel;
  tagline: string;
  clientName: string;
  clientMeta: ReturnType<typeof formatClientHistoryMeta>;
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
    clientName: formatClientFullName(row.client),
    clientMeta: formatClientHistoryMeta(row.client),
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
  shadowOpacity: 0.03,
  shadowRadius: 5,
  elevation: 1,
};

function daysAgoMs(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export default function HistoryScreen({ onTabChange: _onTabChange }: { onTabChange?: (idx: number) => void }) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [showFilter, setShowFilter] = useState(false);
  const [filterModalMounted, setFilterModalMounted] = useState(false);

  const [tmpSort, setTmpSort] = useState<SortKey>("newest");
  const [tmpDateRange, setTmpDateRange] = useState<DateRange>("all");
  const filterSheetAnim = useRef(new Animated.Value(0)).current;

  const [rows, setRows] = useState<ScreeningHistoryRow[]>(() => peekScreenings() ?? []);
  const [loading, setLoading] = useState(() => !peekScreenings());
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const isPatientPortal = isPatientRole(parseUserRole(peekProfile()?.role));
  const historyTitle = isPatientPortal ? PATIENT_HISTORY_TITLE : STAFF_HISTORY_TITLE;
  const historyLoadingText = isPatientPortal ? PATIENT_HISTORY_LOADING : STAFF_HISTORY_LOADING;
  const historySignInTitle = isPatientPortal
    ? PATIENT_HISTORY_SIGN_IN_TITLE
    : STAFF_HISTORY_SIGN_IN_TITLE;
  const historySignInBody = isPatientPortal
    ? PATIENT_HISTORY_SIGN_IN_BODY
    : STAFF_HISTORY_SIGN_IN_BODY;
  const historyEmptyText = isPatientPortal ? PATIENT_HISTORY_EMPTY : STAFF_HISTORY_EMPTY;

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

  useEffect(() => {
    void load("initial");
  }, [load]);

  const openFilter = () => {
    setTmpSort(sortKey);
    setTmpDateRange(dateRange);
    setFilterModalMounted(true);
    setShowFilter(true);
  };

  const closeFilter = useCallback(() => {
    setShowFilter(false);
  }, []);

  const applyFilter = () => {
    setSortKey(tmpSort);
    setDateRange(tmpDateRange);
    closeFilter();
  };

  const clearSortAndDate = () => {
    setSortKey("newest");
    setDateRange("all");
    setTmpSort("newest");
    setTmpDateRange("all");
  };

  useEffect(() => {
    if (showFilter) {
      filterSheetAnim.setValue(0);
      Animated.timing(filterSheetAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!filterModalMounted) return;
    Animated.timing(filterSheetAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFilterModalMounted(false);
    });
  }, [showFilter, filterModalMounted, filterSheetAnim]);

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
  const filterSheetMaxHeight = Math.round(screenHeight * 0.92);
  const filterSheetPadBottom = Math.max(insets.bottom, 10) + 10;

  const openDetails = (sessionId: string) => {
    router.push({
      pathname: "/screening/details",
      params: { sessionId },
    });
  };

  return (
    <View className="flex-1" style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
      <View
        className="px-5 pb-3.5"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingTop: headerPadTop }}
      >
        <View className="flex-row items-center">
          <View className="h-10 w-10" />

          <View className="min-w-0 flex-1">
            <Text className="text-center text-lg font-black" style={{ color: colors.text }} numberOfLines={1}>
              {historyTitle}
            </Text>
          </View>

          <View className="h-10 w-10" />
        </View>

        <View className="mt-3.5 flex-row items-center">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-1"
            contentContainerStyle={{ gap: 8, paddingRight: 10 }}
          >
            {RISK_FILTERS.map((f) => {
              const active = riskFilter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setRiskFilter(f.key)}
                  className="rounded-full border px-4 py-1.5"
                  style={{
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    className="text-base font-bold"
                    style={{ color: active ? "#FFF" : colors.textSecondary }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            onPress={openFilter}
            className="relative h-10 w-10 items-center justify-center rounded-full border"
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.surfaceAlt : hasActiveFilters ? colors.primaryLight : colors.surface,
              borderColor: hasActiveFilters ? colors.primary : colors.border,
            })}
            accessibilityRole="button"
            accessibilityLabel="Open filter and sort"
          >
            <Ionicons name="options-outline" size={20} color={hasActiveFilters ? colors.primary : colors.textMuted} />
            {hasActiveFilters && (
              <View className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ backgroundColor: colors.primary }} />
            )}
          </Pressable>
        </View>

        {hasActiveFilters && (
          <View className="mt-2.5 flex-row items-center gap-1.5">
            <Ionicons name="funnel" size={12} color={colors.textMuted} />
            <Text className="text-sm" style={{ color: colors.textMuted }}>
              {DATE_RANGE_OPTIONS.find((d) => d.key === dateRange)?.label}
              {" · "}
              {SORT_OPTIONS.find((s) => s.key === sortKey)?.label}
            </Text>
            <Pressable
              onPress={clearSortAndDate}
              className="ml-1"
            >
              <Text className="text-sm font-bold" style={{ color: colors.primary }}>Clear</Text>
            </Pressable>
          </View>
        )}

        {loadError ? (
          <Text className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: colors.errorBg, color: colors.error }}>
            {loadError}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center pt-10">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="mt-3 text-base" style={{ color: colors.textMuted }}>
            {historyLoadingText}
          </Text>
        </View>
      ) : !signedIn ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 48 }} showsVerticalScrollIndicator={false}>
          <View className="items-center">
            <Ionicons name="lock-closed-outline" size={48} color="#D1D5DB" />
            <Text className="mt-3 text-center text-base font-bold" style={{ color: colors.textSecondary }}>
              {historySignInTitle}
            </Text>
            <Text className="mt-2 text-center text-base leading-6" style={{ color: colors.textMuted }}>
              {historySignInBody}
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#0B1530" />
          }
        >
          {records.length === 0 && (
            <View className="items-center pt-16">
              <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" />
              <Text className="mt-3 text-base font-bold" style={{ color: colors.textMuted }}>No records found</Text>
              <Text className="mt-1 text-center text-base" style={{ color: colors.textMuted }}>
                {hasActiveFilters ? "Try changing your filters" : historyEmptyText}
              </Text>
            </View>
          )}

          {records.map((record) => {
            const meta = RISK_META[record.risk];
            return (
              <Pressable
                key={record.sessionId}
                onPress={() => openDetails(record.sessionId)}
                className="rounded-2xl border p-4 active:opacity-90"
                style={[historyCardShadow, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
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
                    <Text className="mb-1 text-base font-bold" style={{ color: colors.text }}>{record.clientName}</Text>
                    {record.clientMeta ? (
                      <>
                        <Text className="mb-1 text-sm" style={{ color: colors.textMuted }}>
                          {record.clientMeta.demographics}
                        </Text>
                        <View className="mb-1 flex-row items-start gap-1.5">
                          <Ionicons name="location-outline" size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
                          <Text className="flex-1 text-sm leading-5" style={{ color: colors.textSecondary }}>
                            {record.clientMeta.address}
                          </Text>
                        </View>
                        <View className="mb-1 flex-row items-center gap-1.5">
                          <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                          <Text className="flex-1 text-sm" style={{ color: colors.textSecondary }}>
                            {record.clientMeta.contactNumber}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <Text className="mb-1 text-sm" style={{ color: colors.textMuted }}>
                        {NO_PATIENT_ON_FILE}
                      </Text>
                    )}
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>{record.tagline}</Text>
                    <Text className="text-base" style={{ color: colors.textMuted }}>
                      {record.date} · {record.time}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Pressable>
            );
          })}
          <View className="h-2" />
        </ScrollView>
      )}

      <Modal visible={filterModalMounted} transparent animationType="none" onRequestClose={closeFilter}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Animated.View
            pointerEvents={showFilter ? "auto" : "none"}
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: colors.modalOverlay,
                opacity: filterSheetAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={closeFilter} />
          </Animated.View>

          <Animated.View
            style={{
              width: "100%",
              maxHeight: filterSheetMaxHeight,
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              zIndex: 10,
              elevation: 10,
              transform: [
                {
                  translateY: filterSheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [screenHeight, 0],
                  }),
                },
              ],
            }}
          >
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0 }}
              contentContainerStyle={{
                flexGrow: 0,
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: filterSheetPadBottom,
              }}
            >
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-black" style={{ color: colors.text }}>Filter & Sort</Text>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => {
                  setTmpSort("newest");
                  setTmpDateRange("all");
                }}
                hitSlop={8}
                className="rounded-full border px-4 py-2"
                style={({ pressed }) => ({
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(156,163,255,0.20)"
                      : "rgba(123,111,216,0.14)"
                    : isDark
                      ? "rgba(15,23,42,0.50)"
                      : colors.surfaceAlt,
                  borderColor: isDark ? "rgba(196,181,253,0.72)" : "rgba(123,111,216,0.45)",
                })}
              >
                <Text
                  className="text-base font-extrabold"
                  style={{ color: isDark ? "#DDD6FE" : "#8B7CF6" }}
                >
                  Reset
                </Text>
              </Pressable>
              <Pressable
                onPress={closeFilter}
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.surfaceAlt }}
                accessibilityRole="button"
                accessibilityLabel="Close filter and sort"
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <Text className="mb-2.5 text-base font-extrabold uppercase tracking-wide" style={{ color: colors.textMuted }}>
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
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    className="text-base font-bold"
                    style={{ color: active ? "#FFF" : colors.textSecondary }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-2.5 text-base font-extrabold uppercase tracking-wide" style={{ color: colors.textMuted }}>
            Sort by
          </Text>
          <View className="mb-5 flex-row gap-2">
            {SORT_OPTIONS.map((opt) => {
              const active = tmpSort === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setTmpSort(opt.key)}
                  className="flex-1 items-center rounded-xl border py-3"
                  style={{
                    backgroundColor: active ? colors.primary : colors.surfaceAlt,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    className="text-base font-bold"
                    style={{ color: active ? "#FFF" : colors.textSecondary }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={applyFilter}
              className="flex-1 rounded-2xl"
            >
              {({ pressed }) => (
                <View
                  className="flex-row items-center justify-center rounded-2xl py-3.5"
                  style={{
                    backgroundColor: pressed ? "#243A85" : "#1A3478",
                    borderWidth: 1,
                    borderColor: "rgba(176,196,255,0.42)",
                    shadowColor: "#0B1530",
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.2,
                    shadowRadius: 10,
                    elevation: 4,
                  }}
                >
                  <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                  <Text className="ml-2 text-base font-black text-white">Apply</Text>
                </View>
              )}
            </Pressable>
          </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
