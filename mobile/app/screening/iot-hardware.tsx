import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IOT_HARDWARE_CHECKS } from "../../constants/iotScreening";
import { fetchIotHealth } from "../../services/iotApi";
import { useTheme } from "../../contexts/ThemeContext";

type CheckStatus = "idle" | "running" | "ok" | "error";

type CheckState = {
  status: CheckStatus;
  message?: string;
};

const MANUAL_IDS = new Set(["power", "bluetooth"]);

export type IotHardwareContentProps = {
  onClose?: () => void;
  onContinue?: () => void;
};

/**
 * Reusable content for device setup - can be used in a Modal or as a route.
 */
export function IotHardwareContent({ onClose, onContinue }: IotHardwareContentProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const headerPadTop = Math.max(insets.top, 16) + 10;

  const closeDeviceSetup = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }
    router.back();
  }, [onClose, router]);

  const handleContinue = useCallback(() => {
    if (onContinue) {
      onContinue();
      return;
    }
    router.push("/screening/iot-instructions" as any);
  }, [onContinue, router]);

  // Handle Android back button when used as a route (not in modal)
  useFocusEffect(
    useCallback(() => {
      if (onClose) return; // Skip if in modal - modal handles its own back
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        closeDeviceSetup();
        return true;
      });
      return () => sub.remove();
    }, [onClose, closeDeviceSetup]),
  );

  const [manual, setManual] = useState<Record<string, boolean>>({ power: false, bluetooth: false });
  const [remote, setRemote] = useState<Record<string, CheckState>>({
    pair: { status: "idle" },
    wifi_creds: { status: "idle" },
    health: { status: "idle" },
  });
  const [previewBypass, setPreviewBypass] = useState(false);

  const [wifiModalVisible, setWifiModalVisible] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const setRemoteState = useCallback((id: string, next: CheckState) => {
    setRemote((prev) => ({ ...prev, [id]: next }));
  }, []);

  const runBluetoothPair = useCallback(async () => {
    setRemoteState("pair", { status: "running" });
    await new Promise((r) => setTimeout(r, 2000));
    setRemoteState("pair", {
      status: "ok",
      message: "Connected to TBhon-Device-01",
    });
  }, [setRemoteState]);

  const openWifiModal = useCallback(() => {
    setWifiModalVisible(true);
  }, []);

  const submitWifiCredentials = useCallback(async () => {
    if (!ssid.trim()) return;
    setWifiModalVisible(false);
    setRemoteState("wifi_creds", { status: "running" });
    await new Promise((r) => setTimeout(r, 1800));
    setRemoteState("wifi_creds", {
      status: "ok",
      message: `Device configured for "${ssid}"`,
    });
  }, [ssid, setRemoteState]);

  const runHealthTest = useCallback(async () => {
    setRemoteState("health", { status: "running" });
    try {
      await fetchIotHealth();
      setRemoteState("health", {
        status: "ok",
        message: `Service is online · ${new Date().toLocaleTimeString()}`,
      });
    } catch (e) {
      setRemoteState("health", {
        status: "error",
        message: e instanceof Error ? e.message : "Could not reach the screening service.",
      });
    }
  }, [setRemoteState]);

  const allReady = useMemo(() => {
    const manualOk = IOT_HARDWARE_CHECKS.filter((c) => MANUAL_IDS.has(c.id)).every((c) => manual[c.id]);
    const remoteOk = IOT_HARDWARE_CHECKS.filter((c) => !MANUAL_IDS.has(c.id)).every(
      (c) => remote[c.id]?.status === "ok",
    );
    return manualOk && remoteOk;
  }, [manual, remote]);

  const canContinue = allReady || previewBypass;

  const statusIcon = (status: CheckStatus, confirmed?: boolean) => {
    if (status === "running") return <ActivityIndicator size="small" color="#1D4ED8" />;
    if (status === "ok" || confirmed) {
      return <Ionicons name="checkmark-circle" size={22} color="#10B981" />;
    }
    if (status === "error") {
      return <Ionicons name="alert-circle" size={22} color="#DC2626" />;
    }
    return <Ionicons name="ellipse-outline" size={22} color="#94A3B8" />;
  };

  const getActionHandler = (checkId: string) => {
    switch (checkId) {
      case "pair":
        return runBluetoothPair;
      case "wifi_creds":
        return openWifiModal;
      case "health":
        return runHealthTest;
      default:
        return () => {};
    }
  };

  return (
    <>
      {/* Only set StatusBar when used as a standalone route (no onClose = no overlay parent) */}
      {!onClose && (
        <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      )}
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <View
          className="border-b px-5 pb-3.5"
          style={{ paddingTop: headerPadTop, borderColor: colors.borderLight }}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={closeDeviceSetup}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.surfaceAlt }}
              accessibilityRole="button"
              accessibilityLabel="Close device setup"
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>

            <View className="min-w-0 flex-1">
              <Text className="text-center text-lg font-black" style={{ color: colors.text }} numberOfLines={1}>
                Device setup
              </Text>
            </View>

            <View className="h-10 w-10" />
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5 rounded-2xl border px-4 py-4" style={{ borderColor: colors.border, backgroundColor: colors.primaryLight }}>
            <View className="mb-2 flex-row items-center gap-2">
              <Ionicons name="bluetooth" size={20} color={colors.text} />
              <Text className="text-sm font-extrabold" style={{ color: colors.text }}>Before you begin</Text>
            </View>
            <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
              Your phone connects to the screening device via Bluetooth, then sends your Wi‑Fi
              details so it can upload recordings to the cloud.
            </Text>
          </View>

          {IOT_HARDWARE_CHECKS.map((check) => {
            const isManual = MANUAL_IDS.has(check.id);
            const manualDone = isManual && manual[check.id];
            const remoteState = remote[check.id] ?? { status: "idle" as CheckStatus };

            return (
              <View
                key={check.id}
                className="mb-3 rounded-2xl border px-4 py-4"
                style={{ borderColor: colors.cardBorder, backgroundColor: colors.surface }}
              >
                <View className="flex-row items-start gap-3">
                  <View className="mt-0.5">
                    {statusIcon(isManual ? (manualDone ? "ok" : "idle") : remoteState.status, manualDone)}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-bold" style={{ color: colors.text }}>{check.title}</Text>
                    <Text className="mt-1 text-sm leading-5" style={{ color: colors.textSecondary }}>{check.detail}</Text>
                    {remoteState.message ? (
                      <Text
                        className={`mt-2 text-xs leading-5 ${
                          remoteState.status === "error" ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {remoteState.message}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {isManual ? (
                  <Pressable
                    onPress={() => setManual((m) => ({ ...m, [check.id]: !m[check.id] }))}
                    className={`mt-3 items-center rounded-xl py-3 ${
                      manualDone ? "bg-emerald-600" : ""
                    } active:opacity-90`}
                    style={!manualDone ? { backgroundColor: colors.primary } : undefined}
                  >
                    <Text className="text-sm font-bold text-white">
                      {manualDone ? "Confirmed" : "Confirm"}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={getActionHandler(check.id)}
                    disabled={remoteState.status === "running"}
                    className={`mt-3 items-center rounded-xl py-3 ${
                      remoteState.status === "running" ? "bg-slate-200" : ""
                    } active:opacity-90`}
                    style={remoteState.status !== "running" ? { backgroundColor: colors.primary } : undefined}
                  >
                    <Text
                      className={`text-sm font-bold ${
                        remoteState.status === "running" ? "text-slate-500" : "text-white"
                      }`}
                    >
                      {remoteState.status === "running"
                        ? "Checking…"
                        : check.actionLabel ?? "Check"}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View className="border-t px-5 pb-8 pt-4" style={{ borderColor: colors.borderLight }}>
          <Pressable
            onPress={handleContinue}
            disabled={!canContinue}
            className={`items-center justify-center rounded-2xl py-4 ${
              canContinue ? "" : "bg-neutral-200"
            }`}
            style={canContinue ? { backgroundColor: isDark ? "#2E3A6F" : "#243D82" } : undefined}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
          >
            <Text className={`text-base font-bold ${canContinue ? "text-white" : "text-neutral-400"}`}>
              Continue
            </Text>
          </Pressable>
          {!canContinue ? (
            <Text className="mt-3 text-center text-xs leading-5" style={{ color: colors.textMuted }}>
              Complete each step above to continue to screening instructions.
            </Text>
          ) : null}
          {__DEV__ && !allReady ? (
            <Pressable
              onPress={() => setPreviewBypass(true)}
              className="mt-3 items-center py-2 active:opacity-70"
            >
              <Text className="text-xs font-semibold" style={{ color: colors.textMuted }}>Continue anyway</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Wi-Fi Credentials Modal */}
        <Modal
          visible={wifiModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setWifiModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setWifiModalVisible(false)}
            />
            <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 28) + 12 }]}>
              <View className="mb-1 flex-row items-center justify-between">
                <Text className="text-lg font-black text-[#0B1530]">Wi‑Fi Setup</Text>
                <Pressable
                  onPress={() => setWifiModalVisible(false)}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-slate-100"
                >
                  <Ionicons name="close" size={22} color="#64748B" />
                </Pressable>
              </View>
              <Text className="mb-6 text-sm leading-5 text-slate-600">
                Enter your Wi‑Fi credentials. The screening device will use this network to upload
                recordings.
              </Text>

              <Text className="mb-2 text-sm font-semibold text-[#0B1530]">Network name (SSID)</Text>
              <TextInput
                style={styles.input}
                value={ssid}
                onChangeText={setSsid}
                placeholder="e.g. Home_WiFi"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text className="mb-2 mt-5 text-sm font-semibold text-[#0B1530]">Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter Wi‑Fi password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </Pressable>
              </View>

              <Pressable
                onPress={submitWifiCredentials}
                disabled={!ssid.trim()}
                className={`mt-8 items-center rounded-2xl py-4 ${
                  ssid.trim() ? "bg-navy active:bg-navy/90" : "bg-neutral-200"
                }`}
              >
                <Text
                  className={`text-base font-bold ${ssid.trim() ? "text-white" : "text-neutral-400"}`}
                >
                  Send to device
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    maxHeight: "85%",
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#0B1530",
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    padding: 4,
  },
});

/**
 * Route export - uses IotHardwareContent with router-based navigation.
 */
export default function IotHardwareCheckScreen() {
  return <IotHardwareContent />;
}
