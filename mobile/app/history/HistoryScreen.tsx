import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";

type RiskLevel = "low" | "moderate" | "high";

interface ScreeningRecord {
  id: string;
  dateMs: number;   // epoch ms for sorting/filtering
  date: string;
  time: string;
  risk: RiskLevel;
  tagline: string;
}

const RISK_META: Record<RiskLevel, { label: string; color: string; bg: string; icon: string }> = {
  low:      { label: "Low Risk",      color: "#16A34A", bg: "#F0FDF4", icon: "checkmark-circle" },
  moderate: { label: "Moderate Risk", color: "#D97706", bg: "#FFFBEB", icon: "warning"           },
  high:     { label: "High Risk",     color: "#DC2626", bg: "#FEF2F2", icon: "alert-circle"      },
};

const MOCK_HISTORY: ScreeningRecord[] = [
  { id: "1", dateMs: new Date("2026-05-03").getTime(), date: "May 3, 2026",  time: "1:00 AM",  risk: "low",      tagline: "Low TB Risk – Monitor symptoms."              },
  { id: "2", dateMs: new Date("2026-04-28").getTime(), date: "Apr 28, 2026", time: "3:22 PM",  risk: "moderate", tagline: "Moderate TB Risk – Further evaluation needed." },
  { id: "3", dateMs: new Date("2026-04-15").getTime(), date: "Apr 15, 2026", time: "10:45 AM", risk: "low",      tagline: "Low TB Risk – Monitor symptoms."              },
  { id: "4", dateMs: new Date("2026-03-30").getTime(), date: "Mar 30, 2026", time: "8:10 AM",  risk: "high",     tagline: "High TB Risk – Seek medical attention."        },
  { id: "5", dateMs: new Date("2026-03-10").getTime(), date: "Mar 10, 2026", time: "2:55 PM",  risk: "low",      tagline: "Low TB Risk – Monitor symptoms."              },
];

const RISK_FILTERS: { key: "all" | RiskLevel; label: string }[] = [
  { key: "all",      label: "All"      },
  { key: "low",      label: "Low"      },
  { key: "moderate", label: "Moderate" },
  { key: "high",     label: "High"     },
];

type SortKey = "newest" | "oldest";
type DateRange = "all" | "7d" | "30d" | "90d" | "custom";

const DATE_RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: "all",    label: "All time"       },
  { key: "7d",     label: "Last 7 days"    },
  { key: "30d",    label: "Last 30 days"   },
  { key: "90d",    label: "Last 90 days"   },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
];

function daysAgoMs(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export default function HistoryScreen({ onTabChange }: { onTabChange?: (idx: number) => void }) {
  const insets = useSafeAreaInsets();

  /* ── filter state ── */
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [sortKey, setSortKey]       = useState<SortKey>("newest");
  const [dateRange, setDateRange]   = useState<DateRange>("all");
  const [showFilter, setShowFilter] = useState(false);

  /* ── temp state inside modal (commit on Apply) ── */
  const [tmpSort, setTmpSort]           = useState<SortKey>("newest");
  const [tmpDateRange, setTmpDateRange] = useState<DateRange>("all");

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

  /* ── derived records ── */
  const minMs =
    dateRange === "7d"  ? daysAgoMs(7)  :
    dateRange === "30d" ? daysAgoMs(30) :
    dateRange === "90d" ? daysAgoMs(90) : 0;

  const records = MOCK_HISTORY
    .filter((r) => riskFilter === "all" || r.risk === riskFilter)
    .filter((r) => r.dateMs >= minMs)
    .sort((a, b) => sortKey === "newest" ? b.dateMs - a.dateMs : a.dateMs - b.dateMs);

  const hasActiveFilters = sortKey !== "newest" || dateRange !== "all";

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      {/* ── Header ── */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 16) + 10,
          paddingHorizontal: 20,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: "#F1F1F1",
        }}
      >
        {/* Title row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            onPress={() => onTabChange?.(0)}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20,
              alignItems: "center", justifyContent: "center",
              backgroundColor: pressed ? "#F1F1F1" : "transparent",
            })}
          >
            <Ionicons name="chevron-back" size={22} color="#0B1530" />
          </Pressable>

          <Text style={{ fontSize: 18, fontWeight: "900", color: "#0B1530" }}>
            Screening History
          </Text>

          {/* Filter icon button */}
          <Pressable
            onPress={openFilter}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20,
              alignItems: "center", justifyContent: "center",
              backgroundColor: pressed ? "#F1F1F1" : hasActiveFilters ? "#EFF6FF" : "transparent",
            })}
          >
            <Ionicons
              name="options-outline"
              size={22}
              color={hasActiveFilters ? "#0B1530" : "#666"}
            />
            {hasActiveFilters && (
              <View
                style={{
                  position: "absolute",
                  top: 8, right: 8,
                  width: 8, height: 8,
                  borderRadius: 4,
                  backgroundColor: "#0B1530",
                }}
              />
            )}
          </Pressable>
        </View>

        {/* Risk filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 14 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {RISK_FILTERS.map((f) => {
            const active = riskFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setRiskFilter(f.key)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 7,
                  borderRadius: 20,
                  backgroundColor: active ? "#0B1530" : "#F3F4F6",
                  borderWidth: 1,
                  borderColor: active ? "#0B1530" : "#E5E7EB",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#FFF" : "#374151" }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Active filter summary */}
        {hasActiveFilters && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 }}>
            <Ionicons name="funnel" size={12} color="#6B7280" />
            <Text style={{ fontSize: 12, color: "#6B7280" }}>
              {DATE_RANGE_OPTIONS.find((d) => d.key === dateRange)?.label}
              {" · "}
              {SORT_OPTIONS.find((s) => s.key === sortKey)?.label}
            </Text>
            <Pressable
              onPress={() => { setSortKey("newest"); setDateRange("all"); }}
              style={{ marginLeft: 4 }}
            >
              <Text style={{ fontSize: 12, color: "#0B1530", fontWeight: "700" }}>Clear</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── List ── */}
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {records.length === 0 && (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <Ionicons name="folder-open-outline" size={48} color="#D1D5DB" />
            <Text style={{ marginTop: 12, fontSize: 15, fontWeight: "700", color: "#9CA3AF" }}>
              No records found
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, color: "#D1D5DB", textAlign: "center" }}>
              Try changing your filters
            </Text>
          </View>
        )}

        {records.map((record) => {
          const meta = RISK_META[record.risk];
          return (
            <Pressable
              key={record.id}
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#F9FAFB" : "#FFFFFF",
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: "#F1F1F1",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
                elevation: 2,
              })}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 6,
                      backgroundColor: meta.bg, alignSelf: "flex-start",
                      paddingHorizontal: 10, paddingVertical: 4,
                      borderRadius: 20, marginBottom: 8,
                    }}
                  >
                    <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                    <Text style={{ fontSize: 12, fontWeight: "800", color: meta.color }}>{meta.label}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#0B1530", marginBottom: 4 }}>
                    {record.tagline}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {record.date} · {record.time}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </View>
            </Pressable>
          );
        })}
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* ── Filter bottom sheet modal ── */}
      <Modal
        visible={showFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilter(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}
          onPress={() => setShowFilter(false)}
        />
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16) + 16,
          }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", alignSelf: "center", marginBottom: 18 }} />

          <Text style={{ fontSize: 17, fontWeight: "900", color: "#0B1530", marginBottom: 20 }}>
            Filter &amp; Sort
          </Text>

          {/* Date range */}
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#6B7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Date range
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
            {DATE_RANGE_OPTIONS.map((opt) => {
              const active = tmpDateRange === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setTmpDateRange(opt.key)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 9,
                    borderRadius: 20,
                    backgroundColor: active ? "#0B1530" : "#F3F4F6",
                    borderWidth: 1, borderColor: active ? "#0B1530" : "#E5E7EB",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#FFF" : "#374151" }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Sort */}
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#6B7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Sort by
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 28 }}>
            {SORT_OPTIONS.map((opt) => {
              const active = tmpSort === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setTmpSort(opt.key)}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: active ? "#0B1530" : "#F3F4F6",
                    borderWidth: 1, borderColor: active ? "#0B1530" : "#E5E7EB",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#FFF" : "#374151" }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={() => { setTmpSort("newest"); setTmpDateRange("all"); }}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center",
                backgroundColor: pressed ? "#F3F4F6" : "#F9FAFB",
                borderWidth: 1, borderColor: "#E5E7EB",
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#374151" }}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={applyFilter}
              style={({ pressed }) => ({
                flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: "center",
                backgroundColor: pressed ? "rgba(11,21,48,0.88)" : "#0B1530",
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: "900", color: "#FFF" }}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
