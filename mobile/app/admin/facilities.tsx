import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ApiError,
  getAdminFacilities,
  getMe,
  patchAdminFacility,
  postAdminFacility,
  type ApiAdminFacility,
} from "../../services/backendApi";
import { useTheme } from "../../contexts/ThemeContext";
import { isProgramAdmin, parseUserRole } from "../../constants/userRole";
import { resetToLanding } from "../../utils/authNavigation";
import { getAuthToken } from "../../utils/authStorage";

type CreateForm = {
  name: string;
  inviteCode: string;
  city: string;
  barangay: string;
};

const EMPTY_CREATE: CreateForm = {
  name: "",
  inviteCode: "",
  city: "",
  barangay: "",
};

export default function AdminFacilitiesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [facilities, setFacilities] = useState<ApiAdminFacility[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadFacilities = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const { facilities: rows } = await getAdminFacilities();
      setFacilities(rows);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not load facilities.";
      Alert.alert("Load failed", message);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const token = await getAuthToken();
      if (!token) {
        resetToLanding(navigation);
        return;
      }
      try {
        const { user } = await getMe();
        if (!isProgramAdmin(parseUserRole(user.role))) {
          setAuthorized(false);
          setLoading(false);
          return;
        }
        setAuthorized(true);
        await loadFacilities("initial");
      } catch {
        Alert.alert("Session expired", "Please log in again.", [
          { text: "OK", onPress: () => resetToLanding(navigation) },
        ]);
        setLoading(false);
      }
    })();
  }, [loadFacilities, navigation]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else navigation.goBack();
  };

  const shareInviteCode = async (facility: ApiAdminFacility) => {
    const location = [facility.barangay, facility.city].filter(Boolean).join(", ");
    const message = [
      `TBhon booth invite — ${facility.name}`,
      location ? location : null,
      `Code: ${facility.inviteCode}`,
      "",
      "Staff: enter this code when creating your TBhon account.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await Share.share({ message, title: `${facility.name} invite code` });
    } catch {
      Alert.alert("Invite code", facility.inviteCode);
    }
  };

  const handleCreate = async () => {
    const name = createForm.name.trim();
    if (name.length < 2) {
      Alert.alert("Name required", "Enter the facility name (e.g. Malay RHU).");
      return;
    }

    setCreating(true);
    try {
      const { facility } = await postAdminFacility({
        name,
        inviteCode: createForm.inviteCode.trim() || undefined,
        city: createForm.city.trim() || undefined,
        barangay: createForm.barangay.trim() || undefined,
      });
      setFacilities((prev) => [facility, ...prev]);
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
      Alert.alert(
        "Facility created",
        `Invite code:\n\n${facility.inviteCode}\n\nShare this only with staff at ${facility.name}.`,
        [
          { text: "Share", onPress: () => void shareInviteCode(facility) },
          { text: "OK" },
        ],
      );
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not create facility.";
      Alert.alert("Create failed", message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (facility: ApiAdminFacility, next: boolean) => {
    setTogglingId(facility.facilityId);
    try {
      const { facility: updated } = await patchAdminFacility(facility.facilityId, {
        isActive: next,
      });
      setFacilities((prev) =>
        prev.map((row) => (row.facilityId === updated.facilityId ? updated : row)),
      );
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not update facility.";
      Alert.alert("Update failed", message);
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!authorized) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
        <StatusBar style={colors.statusBar} />
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
          <Text className="mt-4 text-center text-lg font-bold" style={{ color: colors.text }}>
            Program admin only
          </Text>
          <Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.textSecondary }}>
            This screen is for TBhon program administrators. Ask your project lead to promote your account.
          </Text>
          <Pressable
            className="mt-6 rounded-xl px-6 py-3"
            style={{ backgroundColor: colors.primary }}
            onPress={handleBack}
          >
            <Text className="font-bold text-white">Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar style={colors.statusBar} />

      <View className="flex-row items-center border-b px-4 py-3" style={{ borderColor: colors.border }}>
        <Pressable onPress={handleBack} hitSlop={12} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-lg font-black" style={{ color: colors.text }}>
            Program admin
          </Text>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            Facilities & invite codes
          </Text>
        </View>
        <Pressable
          onPress={() => setCreateOpen(true)}
          className="flex-row items-center gap-1 rounded-xl px-3 py-2"
          style={{ backgroundColor: isDark ? "#374151" : "#EDE9FC" }}
        >
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text className="text-sm font-bold" style={{ color: colors.primary }}>
            Add
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadFacilities("refresh")} />
        }
      >
        <Text className="mb-4 text-sm leading-6" style={{ color: colors.textSecondary }}>
          Create a facility for each RHU or clinic. Share the invite code only with their booth staff.
        </Text>

        {facilities.length === 0 ? (
          <View
            className="items-center rounded-2xl border px-6 py-10"
            style={{ borderColor: colors.border, backgroundColor: colors.card }}
          >
            <Ionicons name="business-outline" size={40} color={colors.textMuted} />
            <Text className="mt-3 text-center font-semibold" style={{ color: colors.text }}>
              No facilities yet
            </Text>
            <Text className="mt-1 text-center text-sm" style={{ color: colors.textSecondary }}>
              Tap Add to create your first RHU and invite code.
            </Text>
          </View>
        ) : (
          facilities.map((facility) => (
            <View
              key={facility.facilityId}
              className="mb-3 rounded-2xl border px-4 py-4"
              style={{ borderColor: colors.border, backgroundColor: colors.card }}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-bold" style={{ color: colors.text }}>
                    {facility.name}
                  </Text>
                  {(facility.barangay || facility.city) && (
                    <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                      {[facility.barangay, facility.city].filter(Boolean).join(", ")}
                    </Text>
                  )}
                </View>
                <View
                  className="rounded-full px-2.5 py-1"
                  style={{
                    backgroundColor: facility.isActive
                      ? isDark
                        ? "#14532D"
                        : "#DCFCE7"
                      : isDark
                        ? "#451A1A"
                        : "#FEE2E2",
                  }}
                >
                  <Text
                    className="text-[10px] font-bold uppercase"
                    style={{ color: facility.isActive ? "#16A34A" : "#DC2626" }}
                  >
                    {facility.isActive ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>

              <View
                className="mt-3 flex-row items-center justify-between rounded-xl px-3 py-2.5"
                style={{ backgroundColor: isDark ? "#1F2937" : "#F8FAFC" }}
              >
                <View>
                  <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                    Invite code
                  </Text>
                  <Text className="mt-0.5 font-mono text-sm font-bold" style={{ color: colors.text }}>
                    {facility.inviteCode}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void shareInviteCode(facility)}
                  className="rounded-lg px-3 py-2"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-xs font-bold text-white">Share</Text>
                </Pressable>
              </View>

              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-xs" style={{ color: colors.textSecondary }}>
                  {facility.staffCount} staff · signup with this code
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs" style={{ color: colors.textSecondary }}>
                    Active
                  </Text>
                  <Switch
                    value={facility.isActive}
                    disabled={togglingId === facility.facilityId}
                    onValueChange={(next) => void handleToggleActive(facility, next)}
                    trackColor={{ false: "#CBD5E0", true: "#86EFAC" }}
                    thumbColor={facility.isActive ? "#16A34A" : "#f4f4f5"}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
          <View
            className="rounded-t-3xl px-5 pt-5"
            style={{ backgroundColor: colors.card, paddingBottom: 32 }}
          >
            <Text className="text-lg font-black" style={{ color: colors.text }}>
              New facility
            </Text>
            <Text className="mt-1 text-sm" style={{ color: colors.textSecondary }}>
              Leave invite code blank to auto-generate one.
            </Text>

            {(
              [
                ["name", "Facility name *", "Malay RHU"],
                ["inviteCode", "Invite code (optional)", "RHU-MALAY-2026"],
                ["city", "City / municipality", "Malay"],
                ["barangay", "Barangay", "Cogon"],
              ] as const
            ).map(([key, label, placeholder]) => (
              <View key={key} className="mt-4">
                <Text className="mb-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
                  {label}
                </Text>
                <TextInput
                  value={createForm[key]}
                  onChangeText={(v) => setCreateForm((p) => ({ ...p, [key]: v }))}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize={key === "inviteCode" ? "characters" : "words"}
                  autoCorrect={false}
                  className="rounded-xl border px-3.5 py-3 text-base"
                  style={{
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: isDark ? "#111827" : "#FFFFFF",
                  }}
                />
              </View>
            ))}

            <View className="mt-6 flex-row gap-3">
              <Pressable
                className="flex-1 items-center rounded-xl border py-3.5"
                style={{ borderColor: colors.border }}
                onPress={() => {
                  setCreateOpen(false);
                  setCreateForm(EMPTY_CREATE);
                }}
              >
                <Text className="font-semibold" style={{ color: colors.text }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                className="flex-1 items-center rounded-xl py-3.5"
                style={{ backgroundColor: colors.primary, opacity: creating ? 0.7 : 1 }}
                disabled={creating}
                onPress={() => void handleCreate()}
              >
                {creating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="font-bold text-white">Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
