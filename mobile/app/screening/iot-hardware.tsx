import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IOT_HARDWARE_CHECKS } from "../../constants/iotScreening";
import { waitForIotSetupAcknowledgement } from "../../services/iotApi";
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

  useFocusEffect(
    useCallback(() => {
      if (onClose) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        closeDeviceSetup();
        return true;
      });
      return () => sub.remove();
    }, [onClose, closeDeviceSetup]),
  );

  const [manual, setManual] = useState<Record<string, boolean>>({ power: false, bluetooth: false });
  const [health, setHealth] = useState<CheckState>({ status: "idle" });
  const [previewBypass, setPreviewBypass] = useState(false);

  const setHealthState = useCallback((next: CheckState) => {
    setHealth(next);
  }, []);

  const runHealthTest = useCallback(async () => {
    setHealthState({
      status: "running",
      message: "Sending setup command to the IoT device...",
    });
    try {
      const check = await waitForIotSetupAcknowledgement({
        onProgress: (current) => {
          if (current.status === "queued") {
            setHealthState({
              status: "running",
              message: "Command queued. Waiting for the device to receive it...",
            });
            return;
          }
          if (current.status === "delivered") {
            setHealthState({
              status: "running",
              message: "Command received by the device. Waiting for acknowledgement...",
            });
          }
        },
      });
      setHealthState({
        status: "ok",
        message:
          check.acknowledgementMessage ??
          `Device is turned on and connected · ${new Date().toLocaleTimeString()}`,
      });
    } catch (e) {
      setHealthState({
        status: "error",
        message:
          e instanceof Error
            ? e.message
            : "Device is not turned on or did not answer the setup command.",
      });
    }
  }, [setHealthState]);

  const allReady = useMemo(() => {
    const manualOk = IOT_HARDWARE_CHECKS.filter((c) => MANUAL_IDS.has(c.id)).every((c) => manual[c.id]);
    const healthOk = health.status === "ok";
    return manualOk && healthOk;
  }, [manual, health.status]);

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

  return (
    <>
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
              <Ionicons name="hardware-chip-outline" size={20} color={colors.text} />
              <Text className="text-sm font-extrabold" style={{ color: colors.text }}>Before you begin</Text>
            </View>
            <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
              Confirm your screening device is ready and that this phone can reach the TBhon service. Configure the
              device on your bench Wi‑Fi separately if needed.
            </Text>
          </View>

          {IOT_HARDWARE_CHECKS.map((check) => {
            const isManual = MANUAL_IDS.has(check.id);
            const manualDone = isManual && manual[check.id];
            const remoteState = check.id === "health" ? health : { status: "idle" as CheckStatus };

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
                    {!isManual && remoteState.message ? (
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
                    onPress={runHealthTest}
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
                        : ("actionLabel" in check && typeof check.actionLabel === "string"
                            ? check.actionLabel
                            : "Check")}
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
      </View>
    </>
  );
}

/**
 * Route export - uses IotHardwareContent with router-based navigation.
 */
export default function IotHardwareCheckScreen() {
  return <IotHardwareContent />;
}
