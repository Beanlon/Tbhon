import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import { IOT_COUGH_COUNT, IOT_COUGH_STEPS } from "../../constants/iotScreening";
import { palette } from "../../constants/palette";
import {
  ApiError,
  coughRecordingFingerprint,
  downloadSessionCoughToCache,
  ensureScreeningSessionId,
  fetchSessionCoughRecordings,
  getMe,
  pollForNewCoughRecording,
  queueIotDeviceAudioStartCommand,
  queueIotDeviceStopAudioCommand,
  type SessionCoughRecordingPreview,
} from "../../services/backendApi";

const ACCENT_BLUE = palette.indigo;
const SUCCESS_GREEN = "#38d9a9";
const CTA_BLUE = palette.indigo;
const CTA_BLUE_PRESSED = palette.navy;
const COOL_VIOLET_TEXT = "#B7C6FF";
const LIGHT_LOADING_TINT = "#CFD9FF";
const GRADIENT_COLORS = [palette.deepNavy, palette.navy, palette.signupBg] as const;

const IOT_POLL_MS = 2500;
const IOT_UPLOAD_TIMEOUT_MS = 90_000;
const MIN_RECORD_SECONDS = 3;

type CoughSlot = {
  recordingId: string;
  localUri: string;
  fingerprint: string;
};

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

function WaveBars({ amplitude }: { amplitude: number }) {
  const heights = [0.4, 0.7, 1, 0.6, 0.85];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, height: 20 }}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: 8 + 10 * h * amplitude,
            borderRadius: 2,
            backgroundColor: LIGHT_LOADING_TINT,
            opacity: 0.72 + 0.28 * h,
          }}
        />
      ))}
    </View>
  );
}

function StepRow({
  label,
  isActive,
  isDone,
  waveAmplitude,
}: {
  label: string;
  isActive: boolean;
  isDone: boolean;
  waveAmplitude: number;
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
    }
    spinAnim.setValue(0);
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
      {isActive && <WaveBars amplitude={waveAmplitude} />}
    </View>
  );
}

export default function IotCoughScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    checklist?: string;
    audioUris?: string;
    sessionId?: string;
    iotMode?: string;
  }>();
  const checklist = typeof params.checklist === "string" ? params.checklist : "";

  const [screeningSessionId, setScreeningSessionId] = useState<string>(
    typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : "",
  );

  const [coughIndex, setCoughIndex] = useState(1);
  const [slots, setSlots] = useState<Array<CoughSlot | null>>(
    () => Array.from({ length: IOT_COUGH_COUNT }, () => null),
  );

  const [running, setRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [completedThrough, setCompletedThrough] = useState(-1);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [audioHint, setAudioHint] = useState<string | null>(null);
  const [canStopRecording, setCanStopRecording] = useState(false);
  const [waveAmplitude, setWaveAmplitude] = useState(0);

  const userIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(
    typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : "",
  );
  const coughIndexRef = useRef(1);
  const baselineFingerprintsRef = useRef<Set<string>>(new Set());
  const waveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micScale = useRef(new Animated.Value(1)).current;
  const playingRef = useRef<Audio.Sound | null>(null);
  const uploadPollAbortRef = useRef<AbortController | null>(null);

  const completedCoughs = slots.filter(Boolean).length;
  const allDone = completedCoughs >= IOT_COUGH_COUNT;
  const currentSlot = slots[coughIndex - 1];

  const stepIndex = (id: string) => IOT_COUGH_STEPS.findIndex((s) => s.id === id);

  useEffect(() => {
    coughIndexRef.current = coughIndex;
  }, [coughIndex]);

  useEffect(() => {
    let cancelled = false;
    if (sessionIdRef.current.trim().length > 0) return;
    (async () => {
      const sid = await ensureScreeningSessionId(null);
      if (!cancelled) {
        sessionIdRef.current = sid;
        setScreeningSessionId(sid);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isRecording || (running && !captured)) {
      let t = 0;
      waveRef.current = setInterval(() => {
        t += 0.12;
        setWaveAmplitude(0.4 + 0.6 * Math.abs(Math.sin(t)));
      }, 60);
    } else {
      if (waveRef.current) clearInterval(waveRef.current);
      setWaveAmplitude(0);
    }
    return () => {
      if (waveRef.current) clearInterval(waveRef.current);
    };
  }, [isRecording, running, captured]);

  useEffect(() => {
    if (isRecording) {
      const micLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(micScale, {
            toValue: 1.06,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(micScale, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      micLoop.start();
      return () => micLoop.stop();
    }
    micScale.setValue(1);
  }, [isRecording, micScale]);

  useEffect(() => {
    return () => {
      uploadPollAbortRef.current?.abort();
      void playingRef.current?.unloadAsync();
      playingRef.current = null;
    };
  }, []);

  const cancelUploadWait = useCallback(() => {
    uploadPollAbortRef.current?.abort();
  }, []);

  const collectBaselineFingerprints = useCallback(() => {
    const set = new Set<string>();
    for (const slot of slots) {
      if (slot) set.add(slot.fingerprint);
    }
    return set;
  }, [slots]);

  const applyCapturedPreview = useCallback(
    async (preview: SessionCoughRecordingPreview, sessionId: string) => {
      setStatusText("Downloading audio…");
      setActiveIndex(stepIndex("uploading"));
      const localUri = await downloadSessionCoughToCache(
        sessionId,
        preview.recordingId,
        preview.mimeType,
      );
      const fingerprint = coughRecordingFingerprint(preview);
      const slotIndex = coughIndexRef.current - 1;
      setSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = { recordingId: preview.recordingId, localUri, fingerprint };
        return next;
      });
      setCompletedThrough(IOT_COUGH_STEPS.length - 1);
      setActiveIndex(-1);
      setCaptured(true);
      setIsRecording(false);
      setStatusText("Audio received from device. Listen, then proceed or retake.");
    },
    [],
  );

  const handleIoTError = useCallback((e: unknown, phase: "start" | "stop" | "upload" = "upload") => {
    const msg = e instanceof Error ? e.message : "Failed to capture audio";
    const sid = sessionIdRef.current.trim();
    const sidHint = sid.length > 0 ? ` Session: ${sid.slice(0, 8)}…` : "";

    if (e instanceof ApiError && e.status === 401) {
      setErrorText(
        "Sign in on the app, or check EXPO_PUBLIC_IOT_API_KEY in mobile/.env if you are already signed in.",
      );
    } else if (e instanceof ApiError && e.status === 403) {
      setErrorText("Sign in to link the device capture to your screening.");
    } else if (e instanceof ApiError && e.status === 409) {
      setErrorText(
        e.message.includes("seconds")
          ? `Wait at least ${MIN_RECORD_SECONDS} seconds after recording starts, then tap Stop.`
          : e.message.includes("No active audio")
            ? `Stop was rejected — the device may not have started recording yet.${sidHint} Tap Record, wait for the device, then Stop again.`
            : msg,
      );
    } else if (msg.includes("Upload wait cancelled")) {
      setErrorText(
        `Upload cancelled.${sidHint} Tap Record again after the device has finished uploading.`,
      );
    } else if (msg.includes("Timed out waiting for device audio")) {
      setErrorText(
        `No audio reached the server within 90s.${sidHint} The ESP32 must POST to /iot/cough-recordings with the same userId and sessionId. Check Serial Monitor, then tap Record again.`,
      );
    } else if (phase === "stop") {
      setErrorText(`${msg}${sidHint}`);
    } else {
      setErrorText(`${msg}${sidHint}`);
    }

    setStatusText(phase === "upload" ? "Upload did not complete — see message below." : null);
    setActiveIndex(phase === "upload" ? stepIndex("uploading") : -1);
    setCompletedThrough(phase === "upload" ? stepIndex("uploading") - 1 : -1);
    setIsRecording(false);
    setCaptured(false);
    setCanStopRecording(false);
  }, []);

  const startAudioCapture = useCallback(async () => {
    setErrorText(null);
    setStatusText(null);
    setAudioHint(null);
    setCaptured(false);
    setRunning(true);
    setActiveIndex(stepIndex("preparing"));
    setCompletedThrough(-1);
    setCanStopRecording(false);

    try {
      baselineFingerprintsRef.current = collectBaselineFingerprints();

      setStatusText("Preparing session…");
      const { user } = await getMe();
      userIdRef.current = user.userId;
      const ensuredSessionId = await ensureScreeningSessionId(
        sessionIdRef.current || screeningSessionId || null,
      );
      sessionIdRef.current = ensuredSessionId;
      setScreeningSessionId(ensuredSessionId);

      const existing = await fetchSessionCoughRecordings(ensuredSessionId);
      for (const row of existing) {
        baselineFingerprintsRef.current.add(coughRecordingFingerprint(row));
      }

      setCompletedThrough(stepIndex("preparing"));

      setActiveIndex(stepIndex("started"));
      setStatusText("Starting device recording…");
      await queueIotDeviceAudioStartCommand({
        userId: user.userId,
        sessionId: ensuredSessionId,
      });
      setCompletedThrough(stepIndex("started"));

      setActiveIndex(stepIndex("recording"));
      setStatusText("Recording on device — tap Stop when finished (min 3 s)");
      setIsRecording(true);
      setRunning(false);

      await sleep(MIN_RECORD_SECONDS * 1000);
      setCanStopRecording(true);
    } catch (e) {
      handleIoTError(e, "start");
      setRunning(false);
    }
  }, [collectBaselineFingerprints, handleIoTError, screeningSessionId]);

  const stopAudioCapture = useCallback(async () => {
    const userId = userIdRef.current;
    const sessionId = sessionIdRef.current.trim();
    if (!userId || !sessionId) {
      setErrorText("Session not ready. Tap Record cough again to prepare the session.");
      return;
    }

    setRunning(true);
    setErrorText(null);
    setCanStopRecording(false);

    try {
      setActiveIndex(stepIndex("ended"));
      setStatusText("Stopping recording and uploading…");
      await queueIotDeviceStopAudioCommand({ userId, sessionId });
      setCompletedThrough(stepIndex("ended"));

      setActiveIndex(stepIndex("uploading"));
      uploadPollAbortRef.current?.abort();
      uploadPollAbortRef.current = new AbortController();
      const preview = await pollForNewCoughRecording(sessionId, baselineFingerprintsRef.current, {
        timeoutMs: IOT_UPLOAD_TIMEOUT_MS,
        intervalMs: IOT_POLL_MS,
        signal: uploadPollAbortRef.current.signal,
        onProgress: (elapsedMs) => {
          const sec = Math.floor(elapsedMs / 1000);
          setStatusText(
            `Waiting for device upload… ${sec}s (ESP32 must send audio to the server)`,
          );
        },
      });
      uploadPollAbortRef.current = null;
      await applyCapturedPreview(preview, sessionId);
    } catch (e) {
      const phase =
        e instanceof ApiError && (e.status === 409 || e.status === 400) ? "stop" : "upload";
      handleIoTError(e, phase);
    } finally {
      setRunning(false);
      setIsRecording(false);
    }
  }, [applyCapturedPreview, handleIoTError]);

  const retakeCurrent = useCallback(async () => {
    setSlots((prev) => {
      const next = [...prev];
      next[coughIndex - 1] = null;
      return next;
    });
    setCaptured(false);
    await startAudioCapture();
  }, [coughIndex, startAudioCapture]);

  const playCurrent = useCallback(async () => {
    const uri = currentSlot?.localUri;
    if (!uri) {
      setAudioHint("No recording to play yet.");
      return;
    }
    setAudioHint(null);
    try {
      await playingRef.current?.unloadAsync();
      const sound = new Audio.Sound();
      playingRef.current = sound;
      await sound.loadAsync({ uri }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) {
          void sound.unloadAsync();
          if (playingRef.current === sound) playingRef.current = null;
        }
      });
    } catch {
      setAudioHint("Could not play this recording right now.");
    }
  }, [currentSlot]);

  const continueNext = useCallback(() => {
    setAudioHint(null);
    setErrorText(null);
    setStatusText(null);
    setCaptured(false);
    setCompletedThrough(-1);
    setActiveIndex(-1);

    if (completedCoughs < IOT_COUGH_COUNT) {
      setCoughIndex(completedCoughs + 1);
      return;
    }

    const audioUris = slots.map((s) => s?.localUri ?? "").filter((u) => u.length > 0);
    router.push({
      pathname: "/screening/iot-sputum",
      params: {
        checklist,
        audioDone: "1",
        iotMode: "1",
        audioUris: JSON.stringify(audioUris),
        ...(screeningSessionId.trim().length > 0 ? { sessionId: screeningSessionId.trim() } : {}),
      },
    } as any);
  }, [checklist, completedCoughs, router, screeningSessionId, slots]);

  const { mainLabel, subLabel } = useMemo(() => {
    if (allDone && captured) {
      return {
        mainLabel: "All coughs captured!",
        subLabel: "Listen to each take, then continue to sputum capture.",
      };
    }
    if (captured) {
      return {
        mainLabel: "Cough captured!",
        subLabel: "Play back the recording. Retake if it is not clear enough.",
      };
    }
    if (isRecording) {
      return {
        mainLabel: "Recording on device…",
        subLabel: canStopRecording
          ? "Tap Stop when you have finished coughing"
          : `Wait ${MIN_RECORD_SECONDS}s before stopping`,
      };
    }
    if (running) {
      return {
        mainLabel: "Processing…",
        subLabel: "Hang tight, almost done",
      };
    }
    return {
      mainLabel: "Ready to record",
      subLabel: `Tap Record to start cough ${coughIndex} on the screening device`,
    };
  }, [allDone, canStopRecording, captured, coughIndex, isRecording, running]);

  const micBgColor = captured || allDone
    ? SUCCESS_GREEN
    : isRecording
      ? ACCENT_BLUE
      : "#314188";

  const sessionLabel = screeningSessionId?.trim().length ? screeningSessionId.trim() : "Pending assignment";

  const isWaitingForUpload = running && activeIndex === stepIndex("uploading");
  const showRecordButton = !running && !isRecording && !captured;
  const showStopButton = isRecording && !running;
  const showCancelUpload = isWaitingForUpload;
  const showReviewActions = captured && !running && !isRecording;

  return (
    <>
      <StatusBar style="light" backgroundColor={palette.deepNavy} translucent={false} />
      <LinearGradient colors={GRADIENT_COLORS} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "right", "bottom", "left"]}>
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
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
                disabled={running || isRecording}
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
                  Cough {coughIndex} of {IOT_COUGH_COUNT}
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "500", color: "rgba(255,255,255,0.5)", marginTop: 2 }}
                >
                  Device audio capture
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

            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                marginTop: 16,
                marginBottom: 36,
              }}
            >
              {Array.from({ length: IOT_COUGH_COUNT }).map((_, i) => {
                const n = i + 1;
                const filled = Boolean(slots[i]);
                const isActive = n === coughIndex && !allDone;
                return (
                  <View
                    key={i}
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width: isActive ? 24 : 6,
                      backgroundColor: filled
                        ? SUCCESS_GREEN
                        : isActive
                          ? ACCENT_BLUE
                          : "rgba(255,255,255,0.2)",
                    }}
                  />
                );
              })}
            </View>

            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                height: 160,
                marginBottom: 36,
              }}
            >
              <View
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 80,
                  borderWidth: 1.5,
                  borderColor: "rgba(61, 78, 166, 0.22)",
                  position: "absolute",
                }}
              />
              <View
                style={{
                  width: 128,
                  height: 128,
                  borderRadius: 64,
                  borderWidth: 1.5,
                  borderColor: "rgba(61, 78, 166, 0.30)",
                  position: "absolute",
                }}
              />
              {isRecording && (
                <>
                  <PulseRing delay={0} active={isRecording} />
                  <PulseRing delay={600} active={isRecording} />
                  <PulseRing delay={1200} active={isRecording} />
                </>
              )}
              <Animated.View
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: 45,
                  backgroundColor: micBgColor,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: micBgColor,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.4,
                  shadowRadius: 24,
                  elevation: 8,
                  transform: [{ scale: micScale }],
                }}
              >
                {captured ? (
                  <Ionicons name="checkmark" size={32} color="#fff" />
                ) : (
                  <Ionicons
                    name="mic"
                    size={30}
                    color="#fff"
                    style={{ opacity: isRecording ? 1 : 0.85 }}
                  />
                )}
              </Animated.View>
            </View>

            <View style={{ alignItems: "center", marginBottom: 32, paddingHorizontal: 28 }}>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: "700",
                  color: captured ? SUCCESS_GREEN : isRecording || running ? COOL_VIOLET_TEXT : "#fff",
                  letterSpacing: -0.5,
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                {mainLabel}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.7)",
                  textAlign: "center",
                  lineHeight: 20,
                  maxWidth: 260,
                }}
              >
                {subLabel}
              </Text>
            </View>

            <View
              style={{
                marginHorizontal: 28,
                backgroundColor: "rgba(255,255,255,0.10)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                borderRadius: 20,
                padding: 20,
                gap: 14,
                marginBottom: 28,
              }}
            >
              {IOT_COUGH_STEPS.map((step, i) => (
                <StepRow
                  key={step.id}
                  label={step.label}
                  isActive={activeIndex === i}
                  isDone={i <= completedThrough}
                  waveAmplitude={waveAmplitude}
                />
              ))}
            </View>

            <View style={{ paddingHorizontal: 28, gap: 10 }}>
              {showRecordButton && (
                <Pressable onPress={startAudioCapture}>
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
                        Record cough {coughIndex}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}

              {showStopButton && (
                <Pressable onPress={stopAudioCapture} disabled={!canStopRecording}>
                  {({ pressed }) => (
                    <View
                      style={{
                        backgroundColor: canStopRecording
                          ? pressed
                            ? "#DC2626"
                            : "#EF4444"
                          : "rgba(255,255,255,0.08)",
                        borderRadius: 18,
                        paddingVertical: 17,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: canStopRecording
                          ? "rgba(255,255,255,0.2)"
                          : "rgba(255,255,255,0.1)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: canStopRecording ? "#fff" : "rgba(255,255,255,0.35)",
                        }}
                      >
                        Stop recording
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}

              {running && !showCancelUpload && (
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderRadius: 18,
                    paddingVertical: 17,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "rgba(255,255,255,0.3)" }}>
                    {statusText ?? "Working…"}
                  </Text>
                </View>
              )}
              {showCancelUpload && (
                <View style={{ gap: 10 }}>
                  <View
                    style={{
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderRadius: 18,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: "rgba(255,255,255,0.55)",
                        textAlign: "center",
                        lineHeight: 20,
                      }}
                    >
                      {statusText ?? "Waiting for device upload…"}
                    </Text>
                  </View>
                  <Pressable onPress={cancelUploadWait}>
                    {({ pressed }) => (
                      <View
                        style={{
                          backgroundColor: pressed ? "rgba(26,52,120,0.75)" : "rgba(26,52,120,0.55)",
                          borderRadius: 18,
                          paddingVertical: 14,
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.16)",
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Cancel wait</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              )}

              {showReviewActions && (
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable onPress={playCurrent} style={{ flex: 1 }}>
                      {({ pressed }) => (
                        <View
                          style={{
                            backgroundColor: pressed ? "rgba(26,52,120,0.75)" : "rgba(26,52,120,0.55)",
                            borderRadius: 16,
                            paddingVertical: 14,
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.16)",
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Play</Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable onPress={retakeCurrent} style={{ flex: 1 }}>
                      {({ pressed }) => (
                        <View
                          style={{
                            backgroundColor: pressed ? "rgba(26,52,120,0.75)" : "rgba(26,52,120,0.55)",
                            borderRadius: 16,
                            paddingVertical: 14,
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.16)",
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Retake</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                  <Pressable onPress={continueNext}>
                    {({ pressed }) => (
                      <View
                        style={{
                          backgroundColor: pressed ? "#2bc295" : SUCCESS_GREEN,
                          borderRadius: 18,
                          paddingVertical: 16,
                          alignItems: "center",
                          shadowColor: SUCCESS_GREEN,
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.3,
                          shadowRadius: 24,
                          elevation: 6,
                        }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff", letterSpacing: -0.2 }}>
                          {completedCoughs >= IOT_COUGH_COUNT
                            ? "Proceed to sputum capture"
                            : `Proceed to cough ${coughIndex + 1}`}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              )}

              {errorText ? (
                <Text
                  style={{
                    marginTop: 4,
                    textAlign: "center",
                    color: "rgba(255,255,255,0.78)",
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {errorText}
                </Text>
              ) : null}
              {audioHint ? (
                <Text
                  style={{
                    textAlign: "center",
                    color: "rgba(255,255,255,0.72)",
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  {audioHint}
                </Text>
              ) : null}
              {!errorText && statusText && !showReviewActions && !running ? (
                <Text
                  style={{
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
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}
