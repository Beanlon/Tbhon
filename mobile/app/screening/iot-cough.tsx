import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { resetToAuthenticatedHome } from "../../utils/authNavigation";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import type { AVPlaybackStatus } from "expo-av/build/AV.types";
import { CoughQualityBadge } from "../../components/CoughQualityBadge";
import { IOT_COUGH_COUNT, IOT_COUGH_STEPS } from "../../constants/iotScreening";
import { palette } from "../../constants/palette";
import {
  checkCoughRecordingQuality,
  type CoughQualityLabel,
  type CoughQualityStatus,
} from "../../utils/coughQualityCheck";
import {
  ApiError,
  coughRecordingFingerprint,
  downloadSessionCoughToCache,
  ensureScreeningSessionId,
  fetchSessionCoughRecordings,
  getMe,
  fetchIotDeviceStatus,
  pollForNewCoughRecording,
  queueIotDeviceAudioStartCommand,
  queueIotDeviceStopAudioCommand,
  waitForIotDeviceIdle,
  waitForIotDeviceReady,
  type IotHardwareState,
  type SessionCoughRecordingPreview,
} from "../../services/backendApi";

const ACCENT_BLUE = palette.indigo;
const SUCCESS_GREEN = "#38d9a9";
const CTA_BLUE = palette.indigo;
const CTA_BLUE_PRESSED = palette.navy;
const COOL_VIOLET_TEXT = "#B7C6FF";
const LIGHT_LOADING_TINT = "#CFD9FF";
const GRADIENT_COLORS = [palette.deepNavy, palette.navy, palette.signupBg] as const;

const IOT_POLL_MS = 1500;
const IOT_UPLOAD_TIMEOUT_MS = 180_000;
/** Cough 2+ uploads over ESP32 HTTPS often need extra time after the first capture. */
const IOT_UPLOAD_TIMEOUT_LATER_MS = 300_000;
/** Fallback only when /iot/device-status is unreachable. */
const IOT_PRESENCE_FALLBACK_MS = 2_000;
const IOT_DEVICE_STATUS_UI_MS = 2_000;
const MIN_RECORD_SECONDS = 3;
const MAX_RECORD_SECONDS = 10;
const RETAKE_COOLDOWN_SECONDS = 5;
const COUNTDOWN_START = 3;

type CoughSlot = {
  recordingId: string;
  localUri: string;
  fingerprint: string;
  qualityStatus: CoughQualityStatus;
  qualityLabel: CoughQualityLabel;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isUploadWaitTimeout(e: unknown): boolean {
  return e instanceof Error && e.message.includes("Timed out waiting for device audio");
}

function uploadTimeoutForCough(coughIndex: number): number {
  return coughIndex >= 2 ? IOT_UPLOAD_TIMEOUT_LATER_MS : IOT_UPLOAD_TIMEOUT_MS;
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

function CountdownOverlay({
  count,
  coughIndex,
}: {
  count: number | "Go";
  coughIndex: number;
}) {
  const isNum = typeof count === "number";
  const scaleAnim = useRef(new Animated.Value(1.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scaleAnim.setValue(1.5);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.75,
        duration: 880,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.delay(560),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [count, scaleAnim, opacityAnim]);

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(10,18,50,0.78)",
      }}
    >
      <Animated.Text
        style={{
          fontSize: count === "Go" ? 64 : 88,
          fontWeight: "800",
          color: count === "Go" ? SUCCESS_GREEN : "#FFFFFF",
          lineHeight: count === "Go" ? 70 : 96,
          letterSpacing: -2,
          textShadowColor: count === "Go" ? SUCCESS_GREEN : ACCENT_BLUE,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 40,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        }}
      >
        {count}
      </Animated.Text>
      <Text
        style={{
          color: count === "Go" ? SUCCESS_GREEN : "rgba(255,255,255,0.55)",
          fontSize: count === "Go" ? 16 : 15,
          fontWeight: count === "Go" ? "600" : "400",
          marginTop: 16,
          letterSpacing: 0.3,
        }}
      >
        {count === "Go" ? "Cough now" : `Get ready for cough ${coughIndex}`}
      </Text>
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
  const navigation = useNavigation();
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
  const [isUploading, setIsUploading] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [completedThrough, setCompletedThrough] = useState(-1);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [audioHint, setAudioHint] = useState<string | null>(null);
  const [canStopRecording, setCanStopRecording] = useState(false);
  const [waveAmplitude, setWaveAmplitude] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(MAX_RECORD_SECONDS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playPositionMs, setPlayPositionMs] = useState(0);
  const [playDurationMs, setPlayDurationMs] = useState(0);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState<number | "Go">(COUNTDOWN_START);
  const [retakeCooldown, setRetakeCooldown] = useState(0);
  const [recordedDurationMs, setRecordedDurationMs] = useState(0);
  const [uploadSlowPrompt, setUploadSlowPrompt] = useState(false);
  const [iotDeviceState, setIotDeviceState] = useState<IotHardwareState>("offline");
  const [iotDeviceReady, setIotDeviceReady] = useState(false);

  const userIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(
    typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : "",
  );
  const coughIndexRef = useRef(1);
  const slotsRef = useRef<(CoughSlot | null)[]>([null, null, null]);
  const baselineFingerprintsRef = useRef<Set<string>>(new Set());
  /** Server fingerprints seen this session — survives retake slot clears and fetch timeouts. */
  const knownServerFingerprintsRef = useRef<Set<string>>(new Set());
  const prepInFlightRef = useRef<Promise<void> | null>(null);
  const waveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micScale = useRef(new Animated.Value(1)).current;
  const playingRef = useRef<InstanceType<typeof Audio.Sound> | null>(null);
  const uploadPollAbortRef = useRef<AbortController | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAudioCaptureRef = useRef<() => void>(() => {});
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retakeCooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadElapsedBaseRef = useRef(0);
  const prepPromiseRef = useRef<Promise<void> | null>(null);
  const startingDeviceRef = useRef(false);
  const iotStartQueuedRef = useRef(false);
  const retakeNeedsSettleRef = useRef(false);
  const recordingGenRef = useRef(0);
  const deviceRecordSyncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const benchCaptureConfirmedRef = useRef(false);
  const benchCaptureStartedAtRef = useRef<number | null>(null);
  const captureFinalizeInFlightRef = useRef(false);
  const recordSyncPollCountRef = useRef(0);
  const finalizeCoughAfterBenchRef = useRef<(() => Promise<void>) | null>(null);

  const completedCoughs = slots.filter(Boolean).length;
  const allDone = completedCoughs >= IOT_COUGH_COUNT;
  const currentSlot = slots[coughIndex - 1];

  const stepIndex = (id: string) => IOT_COUGH_STEPS.findIndex((s) => s.id === id);

  const refreshDeviceLink = useCallback(async () => {
    try {
      const status = await fetchIotDeviceStatus();
      setIotDeviceState(status.state);
      setIotDeviceReady(status.ready);
      return status;
    } catch {
      setIotDeviceState("offline");
      setIotDeviceReady(false);
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshDeviceLink();
    const id = setInterval(() => {
      void refreshDeviceLink();
    }, IOT_DEVICE_STATUS_UI_MS);
    return () => clearInterval(id);
  }, [refreshDeviceLink]);

  useEffect(() => {
    coughIndexRef.current = coughIndex;
  }, [coughIndex]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

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
    if (isRecording || isUploading || (running && !captured)) {
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
  }, [isRecording, isUploading, running, captured]);

  useEffect(() => {
    if (isRecording || isUploading) {
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
  }, [isRecording, isUploading, micScale]);

  useEffect(() => {
    return () => {
      uploadPollAbortRef.current?.abort();
      if (autoStopTimerRef.current) {
        clearInterval(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (retakeCooldownIntervalRef.current) {
        clearInterval(retakeCooldownIntervalRef.current);
        retakeCooldownIntervalRef.current = null;
      }
      const s = playingRef.current;
      if (s) {
        s.setOnPlaybackStatusUpdate(null);
        playingRef.current = null;
        void s.stopAsync().catch(() => {}).then(() => s.unloadAsync()).catch(() => {});
      }
    };
  }, []);

  const cancelUploadWait = useCallback(() => {
    uploadPollAbortRef.current?.abort();
    uploadElapsedBaseRef.current = 0;
    setUploadSlowPrompt(false);
  }, []);

  const startRetakeCooldown = useCallback(() => {
    setRetakeCooldown(RETAKE_COOLDOWN_SECONDS);
    if (retakeCooldownIntervalRef.current) {
      clearInterval(retakeCooldownIntervalRef.current);
    }
    retakeCooldownIntervalRef.current = setInterval(() => {
      setRetakeCooldown((prev) => {
        if (prev <= 1) {
          if (retakeCooldownIntervalRef.current) {
            clearInterval(retakeCooldownIntervalRef.current);
            retakeCooldownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleBackPress = useCallback(() => {
    Alert.alert(
      "Exit Screening?",
      "Going back will exit the entire screening process. Any recorded data will be lost. Are you sure you want to exit?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit Screening",
          style: "destructive",
          onPress: () => {
            uploadPollAbortRef.current?.abort();
            if (autoStopTimerRef.current) {
              clearInterval(autoStopTimerRef.current);
              autoStopTimerRef.current = null;
            }
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            resetToAuthenticatedHome(navigation);
          },
        },
      ],
    );
  }, [navigation]);

  const collectBaselineFingerprints = useCallback(() => {
    const set = new Set<string>();
    for (const slot of slotsRef.current) {
      if (slot) set.add(slot.fingerprint);
    }
    for (const fp of knownServerFingerprintsRef.current) {
      set.add(fp);
    }
    return set;
  }, []);

  const rerunQualityCheck = useCallback(
    async (slotIndex: number, localUri: string, recordingId: string) => {
      setSlots((prev) => {
        const next = [...prev];
        const cur = next[slotIndex];
        if (cur?.recordingId === recordingId) {
          next[slotIndex] = { ...cur, qualityStatus: "checking", qualityLabel: "" };
        }
        return next;
      });
      const { status, label } = await checkCoughRecordingQuality(localUri);
      setSlots((prev) => {
        const next = [...prev];
        const cur = next[slotIndex];
        if (cur?.recordingId === recordingId) {
          next[slotIndex] = { ...cur, qualityStatus: status, qualityLabel: label };
        }
        return next;
      });
    },
    [],
  );

  const applyCapturedPreview = useCallback(
    async (preview: SessionCoughRecordingPreview, sessionId: string) => {
      setStatusText("Downloading audio…");
      setActiveIndex(-1);
      const localUri = await downloadSessionCoughToCache(
        sessionId,
        preview.recordingId,
        preview.mimeType,
      );
      const fingerprint = coughRecordingFingerprint(preview);
      knownServerFingerprintsRef.current.add(fingerprint);
      const slotIndex = coughIndexRef.current - 1;
      const recordingId = preview.recordingId;
      setSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = {
          recordingId,
          localUri,
          fingerprint,
          qualityStatus: "checking",
          qualityLabel: "",
        };
        return next;
      });
      setCompletedThrough(IOT_COUGH_STEPS.length - 1);
      setActiveIndex(-1);
      setCaptured(true);
      setIsRecording(false);
      setUploadSlowPrompt(false);
      uploadElapsedBaseRef.current = 0;
      setStatusText("Audio received from device. Listen, then proceed or retake.");
      startRetakeCooldown();

      void rerunQualityCheck(slotIndex, localUri, recordingId);
    },
    [rerunQualityCheck, startRetakeCooldown],
  );

  const handleIoTError = useCallback((e: unknown, phase: "start" | "stop" | "upload" = "upload") => {
    const msg = e instanceof Error ? e.message : "Failed to capture audio";
    const sid = sessionIdRef.current.trim();
    const sidShort = sid.length > 0 ? sid.slice(0, 8) : "";
    const isAbort =
      (e instanceof Error && (e.name === "AbortError" || msg.toLowerCase().includes("aborted"))) ||
      msg.includes("Request timed out") ||
      msg.includes("Device command timed out") ||
      msg.includes("Quality check upload timed out") ||
      msg.includes("Network request");

    if (e instanceof ApiError && e.status === 401) {
      setErrorText(
        "Please sign in to continue. If you're already signed in, the app may need to be restarted.",
      );
    } else if (e instanceof ApiError && e.status === 403) {
      setErrorText("Please sign in to link this recording to your screening session.");
    } else if (e instanceof ApiError && e.status === 409) {
      setErrorText(
        e.message.includes("seconds")
          ? `Please wait at least ${MIN_RECORD_SECONDS} seconds before stopping the recording.`
          : e.message.includes("No active audio")
            ? "The device hasn't started recording yet. Tap Record and wait a moment before stopping."
            : msg,
      );
    } else if (msg.includes("Upload wait cancelled")) {
      setErrorText(
        "Upload was cancelled. If the device is still uploading, wait for it to finish, then tap Record again.",
      );
    } else if (msg.includes("Timed out waiting for device:")) {
      setErrorText(
        `The screening device is not responding.\n\n• Power on the bench device\n• Confirm it is on the same Wi‑Fi as this phone\n• Wait until the status dot shows Online\n\nThen tap Record again.${sidShort ? `\n\n[Session: ${sidShort}…]` : ""}`,
      );
    } else if (msg.includes("Timed out waiting for device to start recording")) {
      setErrorText(
        `The screening device didn't start recording in time.\n\nPlease check:\n• Device is powered on\n• Device is connected to Wi-Fi\n\nThen tap Record to try again.${sidShort ? `\n\n[Session: ${sidShort}…]` : ""}`,
      );
    } else if (msg.includes("Timed out waiting for device audio")) {
      setErrorText(
        `The screening device didn't send the audio in time.\n\nPlease check:\n• Device is powered on\n• Device is connected to Wi-Fi\n• Device shows recording activity\n\nThen tap Record to try again.${sidShort ? `\n\n[Session: ${sidShort}…]` : ""}`,
      );
    } else if (isAbort) {
      setErrorText(
        `Network request timed out. Check your connection and tap Record to try again.${sidShort ? ` [${sidShort}…]` : ""}`,
      );
    } else if (phase === "stop") {
      setErrorText(`Something went wrong while stopping the recording. Please try again.${sidShort ? ` [${sidShort}…]` : ""}`);
    } else {
      setErrorText(`Something went wrong. Please try again.${sidShort ? ` [${sidShort}…]` : ""}`);
    }

    setStatusText(phase === "upload" ? null : null);
    setActiveIndex(-1);
    setCompletedThrough(-1);
    setIsRecording(false);
    setCaptured(false);
    setCanStopRecording(false);
  }, []);

  const stopDeviceRecordSync = useCallback(() => {
    if (deviceRecordSyncRef.current) {
      clearInterval(deviceRecordSyncRef.current);
      deviceRecordSyncRef.current = null;
    }
    if (autoStopTimerRef.current) {
      clearInterval(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    recordSyncPollCountRef.current = 0;
    benchCaptureStartedAtRef.current = null;
  }, []);

  const findNewCoughOnServer = useCallback(async (): Promise<SessionCoughRecordingPreview | null> => {
    const sessionId = sessionIdRef.current.trim();
    if (!sessionId) return null;
    const rows = await fetchSessionCoughRecordings(sessionId, { timeoutMs: 20_000, retries: 0 });
    const slot = coughIndexRef.current;
    const bySlot = rows.find((r) => r.coughAttempt === slot);
    if (bySlot && !baselineFingerprintsRef.current.has(coughRecordingFingerprint(bySlot))) {
      return bySlot;
    }
    for (const row of rows) {
      const fp = coughRecordingFingerprint(row);
      if (!baselineFingerprintsRef.current.has(fp)) return row;
    }
    return null;
  }, []);

  /** Sync countdown + auto-stop to bench capture time from GET /iot/device-status. */
  const startDeviceRecordingSync = useCallback(() => {
    stopDeviceRecordSync();
    benchCaptureConfirmedRef.current = false;
    setSecondsRemaining(MAX_RECORD_SECONDS);
    setCanStopRecording(false);

    deviceRecordSyncRef.current = setInterval(() => {
      void (async () => {
        if (captureFinalizeInFlightRef.current) return;
        try {
          const status = await fetchIotDeviceStatus();
          setIotDeviceState(status.state);
          setIotDeviceReady(status.ready);

          if (!iotStartQueuedRef.current) {
            setStatusText("Sending start command to bench…");
            return;
          }

          const serverElapsed = status.activeAudioCapture?.elapsedSeconds;
          if (
            status.state === "recording" ||
            status.state === "uploading" ||
            (serverElapsed ?? 0) >= 0.5
          ) {
            benchCaptureConfirmedRef.current = true;
            if (benchCaptureStartedAtRef.current === null) {
              benchCaptureStartedAtRef.current = Date.now();
            }
          }

          if (!benchCaptureConfirmedRef.current) {
            setStatusText("Bench is starting — cough when you hear/see recording active");
            setSecondsRemaining(MAX_RECORD_SECONDS);
            return;
          }

          const localElapsedSec =
            benchCaptureStartedAtRef.current != null
              ? (Date.now() - benchCaptureStartedAtRef.current) / 1000
              : 0;
          const elapsed = Math.floor(serverElapsed ?? localElapsedSec);

          setStatusText(null);
          const remaining = Math.max(0, MAX_RECORD_SECONDS - elapsed);
          setSecondsRemaining(remaining);

          if (elapsed >= MIN_RECORD_SECONDS) {
            setCanStopRecording(true);
          }

          recordSyncPollCountRef.current += 1;
          if (recordSyncPollCountRef.current % 3 === 0) {
            const onServer = await findNewCoughOnServer();
            if (onServer) {
              stopDeviceRecordSync();
              setIsRecording(false);
              setIsUploading(true);
              setStatusText("Audio received — finishing up…");
              void finalizeCoughAfterBenchRef.current?.();
              return;
            }
          }

          if (status.state === "uploading") {
            stopDeviceRecordSync();
            setIsRecording(false);
            setIsUploading(true);
            setStatusText("Device is uploading audio…");
            void finalizeCoughAfterBenchRef.current?.();
            return;
          }

          const benchDone =
            !status.activeAudioCapture &&
            (status.state === "idle" || status.state === "offline") &&
            elapsed >= MIN_RECORD_SECONDS;

          if (benchDone || elapsed >= MAX_RECORD_SECONDS - 0.25) {
            stopDeviceRecordSync();
            setIsRecording(false);
            void finalizeCoughAfterBenchRef.current?.();
          }
        } catch {
          // Keep last UI values if status poll fails briefly.
        }
      })();
    }, 300);
  }, [findNewCoughOnServer, stopDeviceRecordSync]);

  const ensureSessionReady = useCallback(async (): Promise<{ userId: string; sessionId: string }> => {
    const cachedUserId = userIdRef.current;
    const cachedSessionId = sessionIdRef.current.trim();
    if (cachedUserId && cachedSessionId) {
      return { userId: cachedUserId, sessionId: cachedSessionId };
    }

    const { user } = await getMe();
    userIdRef.current = user.userId;
    const ensuredSessionId = await ensureScreeningSessionId(
      sessionIdRef.current || screeningSessionId || null,
    );
    sessionIdRef.current = ensuredSessionId;
    setScreeningSessionId(ensuredSessionId);
    console.log(`[IoT Cough] Session ready: ${ensuredSessionId}, User: ${user.userId}`);
    return { userId: user.userId, sessionId: ensuredSessionId };
  }, [screeningSessionId]);

  const refreshUploadBaseline = useCallback(async () => {
    baselineFingerprintsRef.current = collectBaselineFingerprints();
    const currentAttempt = coughIndexRef.current;
    console.log(`[IoT Cough] Refreshing upload baseline for cough ${currentAttempt}`);
    console.log(`[IoT Cough] Local slots baseline: ${baselineFingerprintsRef.current.size} fingerprints`);

    const sessionId = sessionIdRef.current.trim();
    if (!sessionId) {
      await ensureSessionReady();
    }

    const ensuredSessionId = sessionIdRef.current.trim();
    if (!ensuredSessionId) return;

    try {
      const existing = await fetchSessionCoughRecordings(ensuredSessionId, {
        timeoutMs: 60_000,
        retries: 2,
      });
      console.log(
        `[IoT Cough] Server has ${existing.length} recordings:`,
        existing
          .map(
            (r) =>
              `slot${r.coughAttempt}:${r.recordingId?.slice(0, 8)}:${r.byteSize}:${r.recordedAt?.slice(11, 19) ?? "no-time"}`,
          )
          .join(", "),
      );
      for (const row of existing) {
        const fp = coughRecordingFingerprint(row);
        baselineFingerprintsRef.current.add(fp);
        knownServerFingerprintsRef.current.add(fp);
        if (row.coughAttempt === currentAttempt) {
          console.log(`[IoT Cough] Added OLD slot ${row.coughAttempt} to baseline: ${fp}`);
        }
      }
    } catch (e) {
      console.warn(
        `[IoT Cough] Server baseline fetch failed — using ${knownServerFingerprintsRef.current.size} cached fingerprint(s):`,
        e instanceof Error ? e.message : String(e),
      );
      for (const fp of knownServerFingerprintsRef.current) {
        baselineFingerprintsRef.current.add(fp);
      }
    }
    console.log(`[IoT Cough] Final baseline: ${baselineFingerprintsRef.current.size} fingerprints`);
  }, [collectBaselineFingerprints, ensureSessionReady]);

  const prepareRecordingSession = useCallback(async () => {
    if (prepInFlightRef.current) {
      return prepInFlightRef.current;
    }
    const run = (async () => {
      await ensureSessionReady();
      if (coughIndexRef.current > 1 || retakeNeedsSettleRef.current) {
        try {
          await waitForIotDeviceReady({
            timeoutMs: 60_000,
            onProgress: (_, s) => {
              setIotDeviceState(s.state);
              setIotDeviceReady(s.ready);
            },
          });
        } catch {
          await sleep(IOT_PRESENCE_FALLBACK_MS);
        }
      } else {
        try {
          await waitForIotDeviceReady({ timeoutMs: 15_000 });
        } catch {
          // First cough — device may still be booting; countdown gives more time.
        }
      }
      await refreshUploadBaseline();
    })();
    prepInFlightRef.current = run;
    try {
      await run;
    } finally {
      if (prepInFlightRef.current === run) {
        prepInFlightRef.current = null;
      }
    }
  }, [ensureSessionReady, refreshUploadBaseline]);

  const kickOffBackgroundPrep = useCallback(() => {
    const p = prepareRecordingSession();
    // Suppress the unhandled-rejection warning. runUploadPoll awaits this promise
    // inside a try/catch, but if it rejects before that await is reached JS fires
    // an unhandled rejection. The catch there handles the actual error path.
    p.catch(() => {});
    prepPromiseRef.current = p;
  }, [prepareRecordingSession]);

  const queueIotAudioStartWithRetry = useCallback(async (userId: string, sessionId: string) => {
    let startError: unknown = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await queueIotDeviceAudioStartCommand({
          userId,
          sessionId,
          coughAttempt: coughIndexRef.current,
        });
        iotStartQueuedRef.current = true;
        return;
      } catch (e) {
        startError = e;
        const retryable =
          e instanceof ApiError &&
          (e.status === 409 || e.status === 503 || e.status === 429) &&
          attempt < 3;
        if (!retryable) throw e;
        console.log(`[IoT Cough] Device busy, retrying start (${attempt + 1}/3)...`);
        await sleep(800);
      }
    }
    if (startError) throw startError;
  }, []);

  const enterRecordingUiAtGo = useCallback(() => {
    recordingGenRef.current += 1;

    setShowCountdown(false);
    setErrorText(null);
    setAudioHint(null);
    setCaptured(false);
    setUploadSlowPrompt(false);
    uploadElapsedBaseRef.current = 0;
    setRunning(false);
    setCompletedThrough(stepIndex("started"));
    setActiveIndex(stepIndex("recording"));
    setStatusText(
      `Recording on device — auto-stops in ${MAX_RECORD_SECONDS}s (min ${MIN_RECORD_SECONDS}s)`,
    );
    setIsRecording(true);
    setCanStopRecording(false);
    startDeviceRecordingSync();
  }, [startDeviceRecordingSync]);

  const beginRecordingAfterCountdown = useCallback(() => {
    if (startingDeviceRef.current) return;
    startingDeviceRef.current = true;

    setShowCountdown(false);
    setErrorText(null);

    const userId = userIdRef.current;
    const sessionId = sessionIdRef.current.trim();
    if (!userId || !sessionId) {
      startingDeviceRef.current = false;
      handleIoTError(new Error("Session not ready. Tap Record cough again."), "start");
      return;
    }

    iotStartQueuedRef.current = false;
    console.log(`[IoT Cough] Go — show recording UI immediately (cough ${coughIndexRef.current})`);
    enterRecordingUiAtGo();

    void (async () => {
      try {
        await queueIotAudioStartWithRetry(userId, sessionId);
        console.log("[IoT Cough] Audio start command queued on server");
      } catch (e) {
        recordingGenRef.current += 1;
        stopDeviceRecordSync();
        iotStartQueuedRef.current = false;
        handleIoTError(e, "start");
        setIsRecording(false);
        setActiveIndex(-1);
        setCompletedThrough(-1);
      } finally {
        startingDeviceRef.current = false;
      }
    })();
  }, [enterRecordingUiAtGo, handleIoTError, queueIotAudioStartWithRetry, stopDeviceRecordSync]);

  const startCountdownOverlay = useCallback(() => {
    setShowCountdown(true);
    setCountdownValue(COUNTDOWN_START);
    setStatusText("Get ready…");

    let count = COUNTDOWN_START;
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    countdownIntervalRef.current = setInterval(() => {
      count--;
      if (count === 0) {
        setCountdownValue("Go");
      } else if (count < 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        void beginRecordingAfterCountdown();
      } else {
        setCountdownValue(count);
      }
    }, 900);
  }, [beginRecordingAfterCountdown]);

  const startAudioCapture = useCallback(async () => {
    if (running || isRecording || showCountdown) return;

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    iotStartQueuedRef.current = false;
    setErrorText(null);
    setRunning(true);
    setStatusText("Preparing session and device link…");
    try {
      await prepareRecordingSession();
      if (retakeNeedsSettleRef.current) {
        setStatusText("Waiting for device to finish uploading…");
        try {
          await waitForIotDeviceIdle({
            timeoutMs: 120_000,
            onProgress: (_, s) => {
              setIotDeviceState(s.state);
              setIotDeviceReady(s.ready);
            },
          });
        } catch {
          await sleep(IOT_PRESENCE_FALLBACK_MS * 3);
        }
        retakeNeedsSettleRef.current = false;
      }
    } catch (e) {
      handleIoTError(e, "start");
      setRunning(false);
      setStatusText(null);
      return;
    }
    setRunning(false);
    setStatusText(null);
    startCountdownOverlay();
  }, [handleIoTError, isRecording, prepareRecordingSession, running, showCountdown, startCountdownOverlay]);

  const runUploadPoll = useCallback(async (sessionId: string) => {
    uploadPollAbortRef.current?.abort();
    uploadPollAbortRef.current = new AbortController();

    try {
      await prepPromiseRef.current;
    } catch {
      // Background prep failed — refresh now before polling.
    }
    await refreshUploadBaseline();

    const uploadTimeoutMs = uploadTimeoutForCough(coughIndexRef.current);
    console.log(`[IoT Cough] Waiting for upload, polling for cough ${coughIndexRef.current} (${uploadTimeoutMs / 1000}s timeout)...`);
    console.log(`[IoT Cough] Baseline has ${baselineFingerprintsRef.current.size} fingerprints to exclude`);
    const preview = await pollForNewCoughRecording(sessionId, baselineFingerprintsRef.current, {
      timeoutMs: uploadTimeoutMs,
      intervalMs: IOT_POLL_MS,
      signal: uploadPollAbortRef.current.signal,
      coughAttempt: coughIndexRef.current,
      onProgress: (elapsedMs) => {
        const sec = Math.floor((uploadElapsedBaseRef.current + elapsedMs) / 1000);
        setStatusText(`Sending audio to the server… ${sec}s`);
      },
    });
    uploadPollAbortRef.current = null;
    return preview;
  }, [refreshUploadBaseline]);

  const finalizeCoughAfterBench = useCallback(async () => {
    if (captureFinalizeInFlightRef.current) return;
    captureFinalizeInFlightRef.current = true;
    const gen = recordingGenRef.current;

    stopDeviceRecordSync();
    setIsRecording(false);
    setCanStopRecording(false);
    setRunning(true);
    setErrorText(null);
    setActiveIndex(stepIndex("ended"));
    setCompletedThrough(stepIndex("recording"));

    const userId = userIdRef.current;
    const sessionId = sessionIdRef.current.trim();
    if (!userId || !sessionId) {
      captureFinalizeInFlightRef.current = false;
      setRunning(false);
      setErrorText("Session not ready. Tap Record cough again to prepare the session.");
      return;
    }

    let enteredSlowPrompt = false;
    try {
      const alreadyOnServer = await findNewCoughOnServer();
      if (alreadyOnServer && gen === recordingGenRef.current) {
        setActiveIndex(stepIndex("uploading"));
        setIsUploading(true);
        setUploadSlowPrompt(false);
        setStatusText("Upload received — processing…");
        await applyCapturedPreview(alreadyOnServer, sessionId);
        iotStartQueuedRef.current = false;
        return;
      }

      setActiveIndex(stepIndex("uploading"));
      setIsUploading(true);
      setUploadSlowPrompt(false);
      setStatusText("Waiting for server to confirm upload…");
      void queueIotDeviceStopAudioCommand({ userId, sessionId }).catch(() => {});

      const preview = await runUploadPoll(sessionId);
      if (gen !== recordingGenRef.current) return;
      setStatusText("Upload received — processing…");
      console.log(
        `[IoT Cough] Received upload! recordingId: ${preview.recordingId?.slice(0, 8)}, byteSize: ${preview.byteSize}`,
      );
      setCompletedThrough(stepIndex("uploading"));
      await applyCapturedPreview(preview, sessionId);
      iotStartQueuedRef.current = false;
    } catch (e) {
      if (isUploadWaitTimeout(e)) {
        enteredSlowPrompt = true;
        uploadElapsedBaseRef.current += uploadTimeoutForCough(coughIndexRef.current);
        setUploadSlowPrompt(true);
        setStatusText(
          coughIndexRef.current >= 2
            ? "Second cough uploads often take longer over Wi-Fi. Keep the device powered on and wait — or tap Keep waiting."
            : "Upload is taking longer than usual. Your device may still be sending over a slow connection.",
        );
      } else {
        const phase =
          e instanceof ApiError && (e.status === 409 || e.status === 400) ? "stop" : "upload";
        handleIoTError(e, phase);
      }
    } finally {
      if (gen === recordingGenRef.current && !enteredSlowPrompt) {
        setRunning(false);
        setIsRecording(false);
        setIsUploading(false);
      }
      if (gen === recordingGenRef.current) {
        captureFinalizeInFlightRef.current = false;
      }
    }
  }, [applyCapturedPreview, findNewCoughOnServer, handleIoTError, runUploadPoll, stopDeviceRecordSync]);

  useEffect(() => {
    finalizeCoughAfterBenchRef.current = finalizeCoughAfterBench;
  }, [finalizeCoughAfterBench]);

  const stopAudioCapture = useCallback(async () => {
    if (captureFinalizeInFlightRef.current) return;
    setRecordedDurationMs(Math.max(0, MAX_RECORD_SECONDS - secondsRemaining) * 1000);

    if (!iotStartQueuedRef.current) {
      setErrorText(
        "The screening device did not receive the start command. Wait a few seconds after the last upload, then try again.",
      );
      setIsRecording(false);
      setRunning(false);
      setActiveIndex(-1);
      setCompletedThrough(-1);
      return;
    }

    await finalizeCoughAfterBench();
  }, [finalizeCoughAfterBench, secondsRemaining]);

  const keepWaitingForUpload = useCallback(async () => {
    const sessionId = sessionIdRef.current.trim();
    if (!sessionId) {
      setErrorText("Session not ready. Tap Record cough again to prepare the session.");
      return;
    }

    setUploadSlowPrompt(false);
    setErrorText(null);
    setRunning(true);
    setIsUploading(true);
    setStatusText("Sending audio to the server…");

    let enteredSlowPrompt = false;
    try {
      const preview = await runUploadPoll(sessionId);
      console.log(`[IoT Cough] Received upload! recordingId: ${preview.recordingId?.slice(0,8)}, byteSize: ${preview.byteSize}, recordedAt: ${preview.recordedAt?.slice(11,19) ?? 'no-time'}`);
      setCompletedThrough(stepIndex("uploading"));
      await applyCapturedPreview(preview, sessionId);
    } catch (e) {
      if (isUploadWaitTimeout(e)) {
        enteredSlowPrompt = true;
        uploadElapsedBaseRef.current += uploadTimeoutForCough(coughIndexRef.current);
        setUploadSlowPrompt(true);
        setStatusText(
          coughIndexRef.current >= 2
            ? "Second cough uploads often take longer over Wi-Fi. Keep the device powered on and wait — or tap Keep waiting."
            : "Upload is taking longer than usual. Your device may still be sending over a slow connection.",
        );
      } else {
        handleIoTError(e, "upload");
      }
    } finally {
      if (!enteredSlowPrompt) {
        setRunning(false);
        setIsUploading(false);
      }
    }
  }, [applyCapturedPreview, handleIoTError, runUploadPoll]);

  const tryAgainAfterSlowUpload = useCallback(() => {
    uploadPollAbortRef.current?.abort();
    uploadPollAbortRef.current = null;
    uploadElapsedBaseRef.current = 0;
    setUploadSlowPrompt(false);
    setRunning(false);
    setIsUploading(false);
    setCompletedThrough(-1);
    setActiveIndex(-1);
    setErrorText(null);
    setStatusText(
      "If your device is still uploading, wait for it to finish before recording again. Tap Record cough when you're ready.",
    );
  }, []);

  useEffect(() => {
    stopAudioCaptureRef.current = () => {
      void stopAudioCapture();
    };
  }, [stopAudioCapture]);

  const stopCurrent = useCallback(async () => {
    const s = playingRef.current;
    if (!s) return;
    s.setOnPlaybackStatusUpdate(null);
    playingRef.current = null;
    setIsPlaying(false);
    setPlayPositionMs(0);
    setPlayDurationMs(0);
    try { await s.stopAsync(); } catch { /* ignore */ }
    try { await s.unloadAsync(); } catch { /* ignore */ }
  }, []);

  const retryQualityCheck = useCallback(async () => {
    const slot = slots[coughIndex - 1];
    if (!slot?.localUri) return;
    setErrorText(null);
    await rerunQualityCheck(coughIndex - 1, slot.localUri, slot.recordingId);
  }, [coughIndex, rerunQualityCheck, slots]);

  const retakeCurrent = useCallback(async () => {
    console.log(`[IoT Cough] Retake requested for cough ${coughIndex}`);
    if (autoStopTimerRef.current) {
      clearInterval(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (retakeCooldownIntervalRef.current) {
      clearInterval(retakeCooldownIntervalRef.current);
      retakeCooldownIntervalRef.current = null;
    }
    uploadPollAbortRef.current?.abort();
    await stopCurrent();
    setSlots((prev) => {
      const next = [...prev];
      next[coughIndex - 1] = null;
      console.log(`[IoT Cough] Cleared slot ${coughIndex}, remaining slots:`, next.map((s, i) => s ? `slot${i+1}:${s.recordingId?.slice(0,8)}` : `slot${i+1}:empty`).join(', '));
      return next;
    });
    setCaptured(false);
    setRunning(false);
    setIsRecording(false);
    setIsUploading(false);
    setUploadSlowPrompt(false);
    uploadElapsedBaseRef.current = 0;
    setShowCountdown(false);
    setCompletedThrough(-1);
    setActiveIndex(-1);
    setStatusText(null);
    setErrorText(null);
    setAudioHint(null);
    setCanStopRecording(false);
    setRetakeCooldown(0);
    setPlayPositionMs(0);
    setPlayDurationMs(0);
    setRecordedDurationMs(0);
    setSecondsRemaining(MAX_RECORD_SECONDS);
    startingDeviceRef.current = false;
    iotStartQueuedRef.current = false;
    prepPromiseRef.current = null;
    retakeNeedsSettleRef.current = true;
    console.log(`[IoT Cough] Retake state reset complete, ready for new recording`);
    // Pre-warm session baseline while the ESP32 finishes uploading the old take.
    void (async () => {
      try {
        await waitForIotDeviceIdle({ timeoutMs: 120_000 });
      } catch {
        await sleep(IOT_PRESENCE_FALLBACK_MS * 3);
      }
      try {
        await prepareRecordingSession();
        console.log("[IoT Cough] Retake prep complete — device link ready");
      } catch (e) {
        console.warn(
          "[IoT Cough] Retake prep failed (will retry on Record):",
          e instanceof Error ? e.message : String(e),
        );
      }
    })();
  }, [coughIndex, prepareRecordingSession, stopCurrent]);

  const playCurrent = useCallback(async () => {
    if (isPlaying) {
      await stopCurrent();
      return;
    }
    const uri = currentSlot?.localUri;
    if (!uri) {
      setAudioHint("No recording to play yet.");
      return;
    }
    setAudioHint(null);
    setPlayPositionMs(0);
    setPlayDurationMs(0);
    try {
      await stopCurrent();

      // Switch audio session out of recording mode so the speaker is used.
      // Without this on iOS the audio plays silently (or not at all) because
      // the session is still locked to the microphone after the IoT capture.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const sound = new Audio.Sound();
      playingRef.current = sound;
      await sound.loadAsync({ uri }, { shouldPlay: true });

      // Seed duration immediately — some codecs (WAV PCM from ESP32) only
      // populate durationMillis in the first getStatusAsync call, not callbacks.
      const initialStatus = await sound.getStatusAsync();
      if (initialStatus.isLoaded) {
        if (initialStatus.durationMillis) setPlayDurationMs(initialStatus.durationMillis);
        setIsPlaying(initialStatus.isPlaying ?? true);
      }

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        setIsPlaying(status.isPlaying ?? false);
        setPlayPositionMs(status.positionMillis ?? 0);
        if (status.durationMillis) setPlayDurationMs(status.durationMillis);
        if (status.didJustFinish) {
          sound.setOnPlaybackStatusUpdate(null);
          if (playingRef.current === sound) playingRef.current = null;
          setIsPlaying(false);
          setPlayPositionMs(0);
          void sound.unloadAsync();
        }
      });
    } catch (e) {
      setAudioHint(
        `Could not play this recording: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, [currentSlot, isPlaying, stopCurrent]);

  const continueNext = useCallback(() => {
    const qs = currentSlot?.qualityStatus ?? "skipped";
    if (qs === "checking" || qs === "bad" || qs === "unavailable") return;

    void stopCurrent();
    setAudioHint(null);
    setErrorText(null);
    setStatusText(null);
    setCaptured(false);
    setCompletedThrough(-1);
    setActiveIndex(-1);

    if (completedCoughs < IOT_COUGH_COUNT) {
      const nextIndex = completedCoughs + 1;
      coughIndexRef.current = nextIndex;
      setCoughIndex(nextIndex);
      startingDeviceRef.current = false;
      iotStartQueuedRef.current = false;
      if (nextIndex > 1) {
        setStatusText("Waiting for device to be ready for the next cough…");
        void (async () => {
          try {
            await waitForIotDeviceReady({ timeoutMs: 90_000 });
          } catch {
            await sleep(IOT_PRESENCE_FALLBACK_MS * 2);
          }
          setStatusText(null);
          kickOffBackgroundPrep();
        })();
      } else {
        kickOffBackgroundPrep();
      }
      return;
    }

    const audioUris = slots.map((s) => s?.localUri ?? "").filter((u) => u.length > 0);
    const iotRecordingIds = slots.map((s) => s?.recordingId ?? "").filter((id) => id.length > 0);
    router.push({
      pathname: "/screening/iot-sputum",
      params: {
        checklist,
        audioDone: "1",
        iotMode: "1",
        audioUris: JSON.stringify(audioUris),
        iotRecordingIds: JSON.stringify(iotRecordingIds),
        ...(screeningSessionId.trim().length > 0 ? { sessionId: screeningSessionId.trim() } : {}),
      },
    } as any);
  }, [checklist, completedCoughs, currentSlot, kickOffBackgroundPrep, router, screeningSessionId, slots, stopCurrent]);

  const { mainLabel, subLabel } = useMemo(() => {
    if (allDone && captured) {
      return {
        mainLabel: "All coughs captured!",
        subLabel: "Listen to each take, then continue to sputum capture.",
      };
    }
    if (captured) {
      return {
        mainLabel: "Cough captured",
        subLabel: "Play back to verify, or retake if unclear.",
      };
    }
    if (isUploading) {
      if (uploadSlowPrompt) {
        return {
          mainLabel: "Upload taking longer…",
          subLabel: "Your device may still be sending over a slow connection.",
        };
      }
      return {
        mainLabel: iotDeviceState === "uploading" ? "Device uploading…" : "Confirming upload…",
        subLabel: statusText ?? "Waiting for the server to receive the WAV file.",
      };
    }
    if (isRecording) {
      return {
        mainLabel: "Recording on device",
        subLabel:
          iotDeviceState === "recording"
            ? `${MAX_RECORD_SECONDS - secondsRemaining}s / ${MAX_RECORD_SECONDS}s on bench`
            : "Waiting for bench to start…",
      };
    }
    if (running) {
      return {
        mainLabel: "Preparing device…",
        subLabel: statusText ?? "Connecting to the screening device",
      };
    }
    const deviceHint = iotDeviceReady
      ? "Device online and ready"
      : iotDeviceState === "recording"
        ? "Device is recording"
        : iotDeviceState === "uploading"
          ? "Device is uploading"
          : iotDeviceState === "idle"
            ? "Device online — waiting to be ready"
            : "Device offline — check Wi‑Fi and power";
    return {
      mainLabel: "Ready to record",
      subLabel: `${deviceHint}. Tap Record for cough ${coughIndex}.`,
    };
  }, [
    allDone,
    canStopRecording,
    captured,
    coughIndex,
    iotDeviceReady,
    iotDeviceState,
    isRecording,
    isUploading,
    running,
    secondsRemaining,
    statusText,
    uploadSlowPrompt,
  ]);

  const micBgColor = captured || allDone
    ? SUCCESS_GREEN
    : isUploading
      ? palette.softViolet
      : isRecording
        ? ACCENT_BLUE
        : "#314188";

  const sessionLabel = screeningSessionId?.trim().length ? screeningSessionId.trim() : "Pending assignment";

  const isWaitingForUpload = running && completedThrough >= stepIndex("ended");
  const showRecordButton = !running && !isRecording && !captured && !uploadSlowPrompt;
  const showStopButton = isRecording && !running;
  const showCancelUpload = isWaitingForUpload && !uploadSlowPrompt;
  const showUploadSlowPrompt = uploadSlowPrompt && isUploading;
  const showReviewActions = captured && !running && !isRecording;

  return (
    <>
      <StatusBar style="light" backgroundColor={palette.deepNavy} translucent={false} />
      <LinearGradient colors={GRADIENT_COLORS} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top", "right", "bottom", "left"]}>
          {showCountdown && (
            <CountdownOverlay count={countdownValue} coughIndex={coughIndex} />
          )}
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
                paddingHorizontal: 20,
                paddingVertical: 8,
              }}
            >
              <Pressable
                onPress={handleBackPress}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.1)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="chevron-back" size={20} color="rgba(255,255,255,0.8)" />
              </Pressable>
              <View style={{ alignItems: "center", flex: 1, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff", letterSpacing: -0.2 }}>
                  Cough {coughIndex} of {IOT_COUGH_COUNT}
                </Text>
                <Text
                  style={{ fontSize: 11, fontWeight: "500", color: "rgba(255,255,255,0.45)", marginTop: 2 }}
                >
                  Device audio capture
                </Text>
                <Text
                  style={{
                    marginTop: 6,
                    fontSize: 9,
                    fontWeight: "500",
                    color: "rgba(255,255,255,0.35)",
                    letterSpacing: 0.3,
                  }}
                  numberOfLines={1}
                >
                  {sessionLabel}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: iotDeviceReady
                        ? SUCCESS_GREEN
                        : iotDeviceState === "offline"
                          ? "#e03131"
                          : "#fab005",
                    }}
                  />
                  <Text style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                    {iotDeviceReady
                      ? "Device ready"
                      : iotDeviceState === "offline"
                        ? "Device offline"
                        : iotDeviceState}
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
              {(isRecording || isUploading) && (
                <>
                  <PulseRing delay={0} active={isRecording || isUploading} />
                  <PulseRing delay={600} active={isRecording || isUploading} />
                  <PulseRing delay={1200} active={isRecording || isUploading} />
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
                ) : isUploading ? (
                  <Ionicons name="cloud-upload" size={30} color="#fff" />
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
                  color: captured ? SUCCESS_GREEN : isRecording || isUploading || running ? COOL_VIOLET_TEXT : "#fff",
                  letterSpacing: -0.5,
                  marginBottom: 8,
                  textAlign: "center",
                }}
              >
                {mainLabel}
              </Text>
              {subLabel.length > 0 && !isUploading && (
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
              )}
            </View>

            {/* Recording countdown bar - positioned like playback bar */}
            {isRecording && (
              <View
                style={{
                  marginHorizontal: 28,
                  marginBottom: 20,
                  backgroundColor: "rgba(239,68,68,0.1)",
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.22)",
                  borderRadius: 18,
                  padding: 16,
                  paddingHorizontal: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Animated.View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "#EF4444",
                      opacity: waveAmplitude > 0.5 ? 1 : 0.4,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: "rgba(255,255,255,0.55)",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Recording
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: "800",
                      color: "#EF4444",
                      lineHeight: 32,
                      letterSpacing: -1,
                    }}
                  >
                    {String(MAX_RECORD_SECONDS - secondsRemaining).padStart(2, "0")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "rgba(255,255,255,0.28)",
                    }}
                  >
                    /{MAX_RECORD_SECONDS}s
                  </Text>
                </View>
              </View>
            )}

            {/* Playback bar - shown when captured */}
            {captured && currentSlot?.localUri && (() => {
              const displayDuration = playDurationMs > 0 ? playDurationMs : recordedDurationMs;
              const progressPct = displayDuration > 0 ? (playPositionMs / displayDuration) * 100 : 0;
              return (
                <View
                  style={{
                    marginHorizontal: 28,
                    marginBottom: 20,
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    borderRadius: 18,
                    padding: 16,
                    paddingHorizontal: 18,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <Pressable
                      onPress={playCurrent}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: SUCCESS_GREEN,
                        alignItems: "center",
                        justifyContent: "center",
                        shadowColor: SUCCESS_GREEN,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.4,
                        shadowRadius: 12,
                        elevation: 4,
                      }}
                    >
                      <Ionicons
                        name={isPlaying ? "pause" : "play"}
                        size={18}
                        color="#fff"
                        style={{ marginLeft: isPlaying ? 0 : 2 }}
                      />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 7 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: "600", color: "rgba(255,255,255,0.75)" }}>
                          Cough {coughIndex} recording
                        </Text>
                        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.52)" }}>
                          {formatMs(playPositionMs)} / {formatMs(displayDuration)}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 4,
                          backgroundColor: "rgba(255,255,255,0.1)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            height: "100%",
                            width: `${Math.min(100, progressPct)}%`,
                            backgroundColor: SUCCESS_GREEN,
                            borderRadius: 2,
                          }}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              );
            })()}

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

              {running && !showCancelUpload && !showUploadSlowPrompt && (
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

              {showUploadSlowPrompt && (
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
                        color: "rgba(255,255,255,0.7)",
                        textAlign: "center",
                        lineHeight: 20,
                      }}
                    >
                      {statusText}
                    </Text>
                  </View>
                  <Pressable onPress={() => void keepWaitingForUpload()}>
                    {({ pressed }) => (
                      <View
                        style={{
                          backgroundColor: pressed ? CTA_BLUE_PRESSED : CTA_BLUE,
                          borderRadius: 18,
                          paddingVertical: 16,
                          alignItems: "center",
                          shadowColor: CTA_BLUE,
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.3,
                          shadowRadius: 24,
                          elevation: 6,
                        }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>Keep waiting</Text>
                      </View>
                    )}
                  </Pressable>
                  <Pressable onPress={tryAgainAfterSlowUpload}>
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
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Try again</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              )}

              {showReviewActions && (
                <View style={{ gap: 10 }}>
                  <CoughQualityBadge
                    status={currentSlot?.qualityStatus ?? "skipped"}
                    label={currentSlot?.qualityLabel ?? ""}
                  />
                  {/* Retake button - shows countdown during cooldown, icon + "Retake" after */}
                  <Pressable
                    onPress={retakeCurrent}
                    disabled={retakeCooldown > 0}
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          backgroundColor:
                            retakeCooldown > 0
                              ? "rgba(255,255,255,0.04)"
                              : pressed
                                ? "rgba(26,52,120,0.75)"
                                : "rgba(26,52,120,0.55)",
                          borderRadius: 16,
                          paddingVertical: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                          gap: 8,
                          borderWidth: 1,
                          borderColor:
                            retakeCooldown > 0
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(255,255,255,0.16)",
                          opacity: retakeCooldown > 0 ? 0.5 : 1,
                        }}
                      >
                        <Ionicons
                          name="refresh"
                          size={16}
                          color={retakeCooldown > 0 ? "rgba(255,255,255,0.25)" : "#fff"}
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: retakeCooldown > 0 ? "rgba(255,255,255,0.25)" : "#fff",
                          }}
                        >
                          {retakeCooldown > 0 ? `Retake (${retakeCooldown}s)` : "Retake"}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  {(() => {
                    const qs = currentSlot?.qualityStatus ?? "skipped";
                    const proceedDisabled = qs === "checking" || qs === "bad";
                    const proceedLabel =
                      qs === "checking"
                        ? "Checking…"
                        : qs === "unavailable"
                          ? "Retry quality check"
                          : qs === "ok"
                          ? completedCoughs >= IOT_COUGH_COUNT
                            ? "Proceed to sputum capture"
                            : `Proceed to cough ${coughIndex + 1}`
                          : "Retake to continue";
                    const onProceed =
                      qs === "unavailable" ? () => void retryQualityCheck() : continueNext;
                    const actionDisabled = qs === "checking" || qs === "bad";
                    return (
                      <Pressable onPress={onProceed} disabled={actionDisabled}>
                        {({ pressed }) => (
                          <View
                            style={{
                              backgroundColor: actionDisabled
                                ? "rgba(56,217,169,0.35)"
                                : pressed
                                  ? "#2bc295"
                                  : SUCCESS_GREEN,
                              borderRadius: 18,
                              paddingVertical: 16,
                              alignItems: "center",
                              shadowColor: SUCCESS_GREEN,
                              shadowOffset: { width: 0, height: 8 },
                              shadowOpacity: actionDisabled ? 0 : 0.3,
                              shadowRadius: 24,
                              elevation: actionDisabled ? 0 : 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight: "700",
                                color: actionDisabled ? "rgba(255,255,255,0.55)" : "#fff",
                                letterSpacing: -0.2,
                              }}
                            >
                              {proceedLabel}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })()}
                </View>
              )}

              {errorText ? (
                <View
                  style={{
                    marginTop: 12,
                    backgroundColor: "rgba(239,68,68,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.25)",
                    borderRadius: 16,
                    padding: 16,
                    flexDirection: "row",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: "rgba(239,68,68,0.2)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      color: "rgba(255,255,255,0.85)",
                      fontSize: 13,
                      fontWeight: "500",
                      lineHeight: 19,
                    }}
                  >
                    {errorText}
                  </Text>
                </View>
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
              {!errorText && statusText && !showReviewActions && !isRecording && !isUploading ? (
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
