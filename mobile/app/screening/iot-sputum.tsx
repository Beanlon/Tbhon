import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { IOT_SPUTUM_STEPS } from "../../constants/iotScreening";
import { palette } from "../../constants/palette";
import {
  ApiError,
  downloadSessionSputumToCache,
  ensureScreeningSessionId,
  fetchSessionSputumPreview,
  getMe,
  queueIotDeviceImageCommand,
} from "../../services/backendApi";

const ACCENT_BLUE = palette.indigo;
const SUCCESS_GREEN = "#38d9a9";
const CTA_BLUE = palette.indigo;
const CTA_BLUE_PRESSED = palette.navy;
const COOL_VIOLET_TEXT = "#B7C6FF";
const LIGHT_LOADING_TINT = "#CFD9FF";
const GRADIENT_COLORS = [palette.deepNavy, palette.navy, palette.signupBg] as const;

const IOT_POLL_MS = 2500;
const IOT_TIMEOUT_MS = 120_000;

type SputumPreview = Awaited<ReturnType<typeof fetchSessionSputumPreview>>;

function sputumFingerprint(preview: NonNullable<SputumPreview>): string {
  return `${preview.imageId}|${preview.byteSize}|${preview.capturedAt ?? ""}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function PulseRing({ delay = 0, active }: { delay?: number; active: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      opacity.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.78,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [active, delay, scale, opacity]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: 90,
        height: 90,
        borderRadius: 45,
        borderWidth: 2,
        borderColor: ACCENT_BLUE,
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

function StepRow({
  label,
  isActive,
  isDone,
}: {
  label: string;
  isActive: boolean;
  isDone: boolean;
}) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (isActive) {
      const spinLoop = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spinLoop.start();
      return () => spinLoop.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [isActive, spinAnim]);

  useEffect(() => {
    if (isDone) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0.8);
    }
  }, [isDone, scaleAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const indicatorStyle = {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1.5,
    borderColor: isDone
      ? SUCCESS_GREEN
      : isActive
        ? ACCENT_BLUE
        : "rgba(255,255,255,0.12)",
    backgroundColor: isDone
      ? "rgba(56, 217, 169, 0.12)"
      : isActive
        ? "rgba(123, 111, 216, 0.16)"
        : "transparent",
  };

  const textColor = isDone
    ? "rgba(56, 217, 169, 0.8)"
    : isActive
      ? COOL_VIOLET_TEXT
      : "rgba(255,255,255,0.3)";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        opacity: isDone || isActive ? 1 : 0.4,
      }}
    >
      <View style={indicatorStyle}>
        {isDone ? (
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Ionicons name="checkmark" size={14} color={SUCCESS_GREEN} />
          </Animated.View>
        ) : isActive ? (
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: "rgba(207,217,255,0.35)",
                borderTopColor: LIGHT_LOADING_TINT,
              }}
            />
          </Animated.View>
        ) : (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "rgba(255,255,255,0.15)",
            }}
          />
        )}
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: "500",
          color: textColor,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function IotSputumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    checklist?: string;
    audioDone?: string;
    audioUris?: string;
    iotRecordingIds?: string;
    iotMode?: string;
    imageUri?: string;
    sessionId?: string;
    deviceSputum?: string;
    sputumByteSize?: string;
    sputumCapturedAt?: string;
  }>();
  const checklist = typeof params.checklist === "string" ? params.checklist : "";
  const audioDone = params.audioDone === "1" ? "1" : "0";
  const audioUris = typeof params.audioUris === "string" ? params.audioUris : "[]";
  const iotRecordingIds = typeof params.iotRecordingIds === "string" ? params.iotRecordingIds : "[]";
  const iotMode = params.iotMode === "1";

  const initialSessionId =
    typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : "";
  const [screeningSessionId, setScreeningSessionId] = useState<string>(initialSessionId);

  const initialPreviewUri =
    typeof params.imageUri === "string" && params.imageUri.length > 0 && !params.imageUri.startsWith("iot://")
      ? params.imageUri
      : "";
  const [previewImageUri, setPreviewImageUri] = useState<string>(initialPreviewUri);
  const [sputumByteSize, setSputumByteSize] = useState<string>(
    typeof params.sputumByteSize === "string" ? params.sputumByteSize : "",
  );
  const [sputumCapturedAt, setSputumCapturedAt] = useState<string>(
    typeof params.sputumCapturedAt === "string" ? params.sputumCapturedAt : "",
  );

  const [running, setRunning] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [completedThrough, setCompletedThrough] = useState(-1);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const done = completedThrough >= IOT_SPUTUM_STEPS.length - 1 && !running && !errorText;

  const acceptedFingerprintRef = useRef<string | null>(null);
  const retakeBaselineRef = useRef<string | null>(null);
  const iconScale = useRef(new Animated.Value(1)).current;

  const isCapturing = running && activeIndex >= 1 && activeIndex <= 2;

  useEffect(() => {
    if (isCapturing) {
      const captureLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(iconScale, {
            toValue: 1.06,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(iconScale, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      captureLoop.start();
      return () => captureLoop.stop();
    } else {
      iconScale.setValue(1);
    }
  }, [isCapturing, iconScale]);

  const REQUEST_STEPS = IOT_SPUTUM_STEPS;

  const goToReview = useCallback(() => {
    const hasImage = Boolean(previewImageUri && previewImageUri.length > 0);
    const deviceSputumNavParams = {
      deviceSputum: "1" as const,
      ...(hasImage ? { sputumByteSize, sputumCapturedAt } : {}),
    };

    router.replace({
      pathname: "/screening/review",
      params: {
        audioDone,
        audioUris,
        iotRecordingIds,
        checklist,
        imageUri: hasImage ? previewImageUri : "",
        ...(iotMode ? { iotMode: "1" } : {}),
        ...(screeningSessionId ? { sessionId: screeningSessionId } : {}),
        ...deviceSputumNavParams,
      },
    } as any);
  }, [router, audioDone, audioUris, iotRecordingIds, checklist, previewImageUri, iotMode, screeningSessionId, sputumByteSize, sputumCapturedAt]);

  const pollForSputumPreview = useCallback(
    async (sessionId: string, baselineFingerprint: string | null) => {
      const started = Date.now();
      while (Date.now() - started < IOT_TIMEOUT_MS) {
        const preview = await fetchSessionSputumPreview(sessionId);
        if (preview && preview.byteSize > 0) {
          const fp = sputumFingerprint(preview);
          if (!baselineFingerprint || fp !== baselineFingerprint) {
            return preview;
          }
        }
        await sleep(IOT_POLL_MS);
      }
      throw new Error("Timed out waiting for device photo");
    },
    [],
  );

  const captureFromDevice = useCallback(
    async (mode: "request" | "retake") => {
      setErrorText(null);
      setStatusText(null);
      setRunning(true);
      setActiveIndex(0);
      setCompletedThrough(-1);

      try {
        if (mode === "retake") {
          retakeBaselineRef.current = acceptedFingerprintRef.current;
          setPreviewImageUri("");
          setSputumByteSize("");
          setSputumCapturedAt("");
        } else {
          retakeBaselineRef.current = null;
        }

        setStatusText("Preparing session…");
        const { user } = await getMe();
        const ensuredSessionId = await ensureScreeningSessionId(screeningSessionId || null);
        setScreeningSessionId(ensuredSessionId);
        setCompletedThrough(0);

        setActiveIndex(1);
        setStatusText("Queuing capture on device…");
        await queueIotDeviceImageCommand({
          userId: user.userId,
          sessionId: ensuredSessionId,
        });
        setCompletedThrough(1);

        setActiveIndex(2);
        setStatusText("Waiting for device upload…");
        setCompletedThrough(2);

        setActiveIndex(3);
        const preview = await pollForSputumPreview(ensuredSessionId, retakeBaselineRef.current);
        const fp = sputumFingerprint(preview);
        acceptedFingerprintRef.current = fp;
        retakeBaselineRef.current = null;

        setStatusText("Downloading photo…");
        const localUri = await downloadSessionSputumToCache(ensuredSessionId);
        setPreviewImageUri(localUri);
        setSputumByteSize(String(preview.byteSize ?? ""));
        setSputumCapturedAt(preview.capturedAt ?? "");

        setCompletedThrough(IOT_SPUTUM_STEPS.length - 1);
        setActiveIndex(-1);
        setStatusText("Photo received from device. Proceed or retake.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to capture image";
        if (e instanceof ApiError && e.status === 401) {
          setErrorText(
            "Sign in on the app, or check EXPO_PUBLIC_IOT_API_KEY in mobile/.env if you are already signed in.",
          );
        } else if (e instanceof ApiError && e.status === 403) {
          setErrorText("Sign in to link the device capture to your screening.");
        } else {
          setErrorText(msg);
        }
        setStatusText(null);
        setActiveIndex(-1);
        setCompletedThrough(-1);
        retakeBaselineRef.current = null;
      } finally {
        setRunning(false);
      }
    },
    [pollForSputumPreview, screeningSessionId],
  );

  const startCapture = useCallback(async () => {
    await captureFromDevice("request");
  }, [captureFromDevice]);

  const startRetake = useCallback(async () => {
    await captureFromDevice("retake");
  }, [captureFromDevice]);

  const iconBgColor = done ? SUCCESS_GREEN : isCapturing ? ACCENT_BLUE : "#2F448E";

  const sessionLabel = screeningSessionId?.trim().length ? screeningSessionId.trim() : "Pending assignment";

  const previewContent = useMemo(() => {
    if (previewImageUri?.trim().length) {
      return (
        <Image source={{ uri: previewImageUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      );
    }
    return null;
  }, [previewImageUri]);
  return (
    <>
      <StatusBar style="light" backgroundColor={palette.deepNavy} translucent={false} />
      <LinearGradient colors={GRADIENT_COLORS} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "right", "bottom", "left"]}>
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 28,
              paddingVertical: 8,
            }}
          >
            <Pressable
              onPress={() => router.back()}
              disabled={running}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "rgba(255,255,255,0.12)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff", letterSpacing: -0.2 }}>
                Device sputum sample
              </Text>
              <Text
                style={{ fontSize: 12, fontWeight: "500", color: "rgba(255,255,255,0.5)", marginTop: 2 }}
              >
                Request a still photo from the bench device
              </Text>
              <View
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.16)",
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "rgba(255,255,255,0.86)",
                    letterSpacing: 0.2,
                  }}
                >
                  Session ID: {sessionLabel}
                </Text>
              </View>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Preview area */}
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 10,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                height: 300,
                borderRadius: 22,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.16)",
                backgroundColor: "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {previewContent ? (
                previewContent
              ) : (
                <View style={{ alignItems: "center", paddingHorizontal: 24 }}>
                  <View
                    style={{
                      width: 170,
                      height: 170,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isCapturing && (
                      <>
                        <PulseRing delay={0} active={isCapturing} />
                        <PulseRing delay={600} active={isCapturing} />
                        <PulseRing delay={1200} active={isCapturing} />
                      </>
                    )}
                    <Animated.View
                      style={{
                        width: 90,
                        height: 90,
                        borderRadius: 45,
                        backgroundColor: iconBgColor,
                        alignItems: "center",
                        justifyContent: "center",
                        shadowColor: iconBgColor,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.36,
                        shadowRadius: 18,
                        elevation: 6,
                        transform: [{ scale: iconScale }],
                      }}
                    >
                      {done ? (
                        <Ionicons name="checkmark" size={32} color="#fff" />
                      ) : (
                        <Ionicons name="camera" size={30} color="#fff" style={{ opacity: isCapturing ? 1 : 0.9 }} />
                      )}
                    </Animated.View>
                  </View>
                  {!isCapturing && (
                    <Text
                      style={{
                        marginTop: 12,
                        color: "rgba(255,255,255,0.72)",
                        fontSize: 13,
                        textAlign: "center",
                        lineHeight: 19,
                      }}
                    >
                      {done
                        ? "Photo ready. You can proceed or retake."
                        : "No image yet. Captured sample preview will appear here."}
                    </Text>
                  )}
                </View>
              )}
            </View>
            {errorText ? (
              <Text
                style={{
                  marginTop: 10,
                  textAlign: "center",
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {errorText}
              </Text>
            ) : null}
            {done && (
              <Text
                style={{
                  marginTop: 10,
                  textAlign: "center",
                  color: "#A7F3D0",
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                Photo received from device. Proceed or retake.
              </Text>
            )}
            {!done && statusText ? (
              <Text
                style={{
                  marginTop: 10,
                  textAlign: "center",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {statusText}
              </Text>
            ) : null}
          </View>

          {/* Steps card */}
          <View
            style={{
              marginHorizontal: 20,
              backgroundColor: "rgba(255,255,255,0.10)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              borderRadius: 20,
              padding: 16,
              gap: 12,
              marginBottom: 18,
            }}
          >
            {REQUEST_STEPS.map((step) => {
              const sourceIndex = IOT_SPUTUM_STEPS.findIndex((s) => s.id === step.id);
              return (
              <StepRow
                key={step.id}
                label={step.label}
                isActive={activeIndex === sourceIndex}
                isDone={sourceIndex <= completedThrough}
              />
              );
            })}
          </View>

          {/* CTAs */}
          <View style={{ paddingHorizontal: 28, marginTop: "auto", paddingBottom: 40, gap: 12 }}>
            {!running && !done && (
              <Pressable onPress={startCapture} style={{ opacity: 1 }}>
                {({ pressed }) => (
                  <View
                    style={{
                      backgroundColor: pressed ? CTA_BLUE_PRESSED : CTA_BLUE,
                      borderRadius: 18,
                      paddingVertical: 17,
                      alignItems: "center",
                      shadowColor: CTA_BLUE,
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.3,
                      shadowRadius: 24,
                      elevation: 6,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff", letterSpacing: -0.2 }}>
                      Start capture
                    </Text>
                  </View>
                )}
              </Pressable>
            )}
            {running && (
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 18,
                  paddingVertical: 17,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "rgba(255,255,255,0.3)" }}>
                  Capturing in progress…
                </Text>
              </View>
            )}
            {done && (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable onPress={startRetake} style={{ flex: 1 }}>
                  {({ pressed }) => (
                    <View
                      style={{
                        backgroundColor: pressed ? "rgba(26,52,120,0.72)" : "rgba(26,52,120,0.5)",
                        borderRadius: 18,
                        paddingVertical: 17,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.16)",
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>Retake</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable onPress={goToReview} style={{ flex: 1 }}>
                  {({ pressed }) => (
                    <View
                      style={{
                        backgroundColor: pressed ? "#E5EBFF" : "#FFFFFF",
                        borderRadius: 18,
                        paddingVertical: 17,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: "800", color: "#0C1E4A" }}>Proceed</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            )}
            {!running && (
              <Pressable
                onPress={goToReview}
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                  borderRadius: 18,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "500", color: "rgba(255,255,255,0.6)" }}>
                  {done ? "Skip to review" : "Skip — no sample"}
                </Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}
