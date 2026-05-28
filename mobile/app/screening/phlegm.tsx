import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import {
  ApiError,
  buildServerSputumImageUrl,
  downloadSessionSputumToCache,
  ensureScreeningSessionId,
  fetchSessionSputumPreview,
  getAuthMediaHeaders,
  getMe,
  queueIotDeviceImageCommand,
} from "../../services/backendApi";

const IOT_POLL_MS = 2500;

type SputumPreview = Awaited<ReturnType<typeof fetchSessionSputumPreview>>;

function sputumFingerprint(preview: NonNullable<SputumPreview>): string {
  return `${preview.imageId}|${preview.byteSize}|${preview.capturedAt ?? ""}`;
}

export default function PhlegmCaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    audioDone?: string;
    audioUris?: string;
    checklist?: string;
    sessionId?: string;
  }>();
  const { width: windowWidth } = useWindowDimensions();
  const [errorText, setErrorText] = useState<string | null>(null);

  const [screeningSessionId, setScreeningSessionId] = useState<string | null>(
    typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : null,
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [iotBusy, setIotBusy] = useState(false);
  const [iotPolling, setIotPolling] = useState(false);
  const [iotStatusText, setIotStatusText] = useState(
    "Tap Request sample — queues the same `image` command as the terminal.",
  );
  const [iotPreviewKey, setIotPreviewKey] = useState(0);
  const [iotPreviewUrl, setIotPreviewUrl] = useState<string | null>(null);
  const [hasReceivedPhoto, setHasReceivedPhoto] = useState(false);
  const [authMediaHeaders, setAuthMediaHeaders] = useState<Record<string, string> | null>(null);

  /** Fingerprint of the image currently shown (or last accepted). */
  const acceptedFingerprintRef = useRef<string | null>(null);
  /** While retaking: ignore polls until fingerprint differs from this baseline. */
  const retakeBaselineRef = useRef<string | null>(null);
  const previewGenerationRef = useRef(0);

  const showPreviewFromPoll = useCallback(
    (preview: NonNullable<SputumPreview>) => {
    const base = buildServerSputumImageUrl(preview.sessionId, {
      hasRawData: true,
      sessionId: preview.sessionId,
      byteSize: preview.byteSize,
      capturedAt: preview.capturedAt,
    });
    if (!base) return;
    if (screeningSessionId && preview.sessionId !== screeningSessionId) return;

    const fp = sputumFingerprint(preview);
    previewGenerationRef.current += 1;
    setIotPreviewUrl(base);
    setIotPreviewKey((k) => k + 1);
    acceptedFingerprintRef.current = fp;
    retakeBaselineRef.current = null;
    setIotPolling(false);
    setHasReceivedPhoto(true);
    setIotStatusText("Photo received from device. Proceed or retake.");
  },
    [screeningSessionId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthMediaHeaders();
        if (!cancelled) setAuthMediaHeaders(headers);
      } catch {
        /* not signed in — preview after upload may still need login */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user } = await getMe();
        if (!cancelled) setUserId(user.userId);
      } catch {
        /* shown when signed in */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (screeningSessionId) return;
    let cancelled = false;
    (async () => {
      const sessionId = await ensureScreeningSessionId(null);
      if (!cancelled) setScreeningSessionId(sessionId);
    })();
    return () => {
      cancelled = true;
    };
  }, [screeningSessionId]);

  const screeningParams = useMemo(
    () => ({
      audioDone: params.audioDone ?? "0",
      audioUris: params.audioUris ?? "[]",
      checklist: params.checklist ?? "",
      ...(screeningSessionId ? { sessionId: screeningSessionId } : {}),
    }),
    [params.audioDone, params.audioUris, params.checklist, screeningSessionId],
  );

  const goToReview = (
    imageUri: string,
    serverPreview: NonNullable<SputumPreview>,
  ) => {
    setErrorText(null);
    router.replace({
      pathname: "/screening/review",
      params: {
        ...screeningParams,
        imageUri,
        deviceSputum: "1",
        sputumByteSize: String(serverPreview.byteSize),
        sputumCapturedAt: serverPreview.capturedAt ?? "",
      },
    } as any);
  };

  const skipPhlegmToReview = () => {
    setErrorText(null);
    router.replace({
      pathname: "/screening/review",
      params: { ...screeningParams, imageUri: "" },
    } as any);
  };

  /** Queue `image` and poll — used by Request sample and Retake. */
  const queueDeviceCapture = useCallback(
    async (mode: "request" | "retake") => {
      setErrorText(null);
      setIotBusy(true);
      setIotStatusText(
        mode === "retake"
          ? "Requesting a new photo from device…"
          : "Queuing image command on device…",
      );

      try {
        if (mode === "retake") {
          retakeBaselineRef.current = acceptedFingerprintRef.current;
          setIotPreviewUrl(null);
          setIotPreviewKey((k) => k + 1);
        } else {
          retakeBaselineRef.current = null;
        }

        const { user } = await getMe();
        const sessionId = await ensureScreeningSessionId(screeningSessionId);
        setScreeningSessionId(sessionId);
        if (!userId) setUserId(user.userId);

        // Queue immediately so the device poll sees `image` (not empty) on retake.
        const queued = await queueIotDeviceImageCommand({
          userId: user.userId,
          sessionId,
        });

        setIotPolling(true);
        setIotStatusText(
          mode === "retake"
            ? "New image command queued — device should poll and capture again."
            : (queued.message ?? "Queued 'image' for device. Waiting for upload…"),
        );
      } catch (e) {
        setIotPolling(false);
        retakeBaselineRef.current = null;
        if (e instanceof ApiError && e.status === 401) {
          setErrorText(
            "Sign in on the app, or check EXPO_PUBLIC_IOT_API_KEY in mobile/.env if you are already signed in.",
          );
        } else if (e instanceof ApiError && e.status === 403) {
          setErrorText("Sign in to link the device capture to your screening.");
        } else {
          setErrorText(String((e as Error)?.message ?? "Failed to queue image command"));
        }
        setIotStatusText(
          mode === "retake"
            ? "Retake failed. Tap Retake to try again."
            : "Request failed. Tap Request sample to try again.",
        );
      } finally {
        setIotBusy(false);
      }
    },
    [screeningSessionId],
  );

  const requestSample = useCallback(() => queueDeviceCapture("request"), [queueDeviceCapture]);
  const retakeOnDevice = useCallback(() => queueDeviceCapture("retake"), [queueDeviceCapture]);

  useEffect(() => {
    if (!iotPolling || !screeningSessionId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const preview = await fetchSessionSputumPreview(screeningSessionId);
        if (cancelled || !preview || preview.byteSize <= 0) return;
        if (preview.sessionId !== screeningSessionId) return;

        const fp = sputumFingerprint(preview);
        const baseline = retakeBaselineRef.current;

        if (baseline) {
          if (fp === baseline) return;
        } else if (fp === acceptedFingerprintRef.current) {
          return;
        }

        showPreviewFromPoll(preview);
      } catch {
        /* session may not exist until first upload */
      }
    };

    void poll();
    const id = setInterval(() => void poll(), IOT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [iotPolling, screeningSessionId, showPreviewFromPoll]);

  const proceedWithDeviceSample = async () => {
    if (!screeningSessionId) return;
    setIotBusy(true);
    setErrorText(null);
    try {
      const preview = await fetchSessionSputumPreview(screeningSessionId);
      if (!preview || preview.byteSize <= 0 || preview.sessionId !== screeningSessionId) {
        throw new Error("No device photo on the server for this session yet. Wait for upload or retake.");
      }
      const localUri = await downloadSessionSputumToCache(screeningSessionId);
      goToReview(localUri, preview);
    } catch (e) {
      setErrorText(String((e as Error)?.message ?? "Could not load device photo"));
    } finally {
      setIotBusy(false);
    }
  };

  const previewHeight = Math.max(280, Math.min(420, windowWidth * 1.1));
  const waitingForDevice = iotPolling || iotBusy;
  const showCaptureActions = hasReceivedPhoto;
  const iotImageSource =
    iotPreviewUrl && authMediaHeaders
      ? { uri: iotPreviewUrl, headers: authMediaHeaders }
      : iotPreviewUrl
        ? { uri: iotPreviewUrl }
        : null;

  return (
    <>
      <StatusBar style="light" backgroundColor="#0B1530" translucent={false} />
      <SafeAreaView className="flex-1 bg-navy" edges={["top", "right", "bottom", "left"]}>
        <View className="flex-row items-center justify-between px-4 pb-3.5 pt-2 sm:px-5 md:px-6">
          <Pressable
            onPress={() => router.back()}
            className="size-11 items-center justify-center rounded-full bg-white/5 active:bg-white/10"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color="#ffffff" />
          </Pressable>

          <View className="min-w-0 flex-1 items-center px-2">
            <Text className="text-center text-sm font-bold text-white sm:text-base" numberOfLines={2}>
              Device sputum sample
            </Text>
            <Text className="mt-0.5 text-center text-xs font-semibold text-white/55 sm:text-sm">
              Request a still photo from the bench device
            </Text>
          </View>

          <View className="size-11" />
        </View>

        <View className="min-h-0 flex-1 px-4 sm:px-5 md:px-6">
          <View
            className="overflow-hidden rounded-2xl border border-white/10 bg-black/50"
            style={{ height: previewHeight }}
          >
            {iotImageSource && !waitingForDevice ? (
              <Image
                key={`iot-${iotPreviewKey}`}
                source={iotImageSource}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : waitingForDevice ? (
              <View className="flex-1 items-center justify-center gap-3 px-6">
                <ActivityIndicator size="large" color="#67e8f9" />
                <Text className="text-center text-sm font-semibold text-white/80">
                  Waiting for device…
                </Text>
                <Text className="text-center text-xs leading-5 text-white/50">
                  {retakeBaselineRef.current
                    ? "New photo will replace the previous one when uploaded."
                    : "After upload, the photo appears here."}
                </Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center px-6">
                <Ionicons name="hardware-chip-outline" size={40} color="rgba(255,255,255,0.35)" />
                <Text className="mt-3 text-center text-sm text-white/60">
                  No sample yet. Tap Request sample below.
                </Text>
              </View>
            )}
          </View>

          <Text className="mt-3 text-center text-xs leading-5 text-cyan-200/90 sm:text-sm">{iotStatusText}</Text>

          {userId || screeningSessionId ? (
            <View className="mt-2 gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <Text className="text-center text-[10px] font-semibold uppercase tracking-wide text-white/45">
                Give these to the bench device
              </Text>
              {userId ? (
                <Text className="text-center font-mono text-[10px] text-white/50" selectable>
                  userId:{"\n"}
                  {userId}
                </Text>
              ) : (
                <Text className="text-center text-[10px] text-amber-300/90">Sign in to see userId</Text>
              )}
              {screeningSessionId ? (
                <Text className="text-center font-mono text-[10px] text-white/50" selectable>
                  sessionId:{"\n"}
                  {screeningSessionId}
                </Text>
              ) : null}
            </View>
          ) : null}

          {!!errorText && (
            <Text className="mt-2 text-center text-xs font-bold text-red-400 sm:text-sm">{errorText}</Text>
          )}
        </View>

        <View className="gap-3 px-4 pt-3 pb-6 sm:px-5 sm:pb-8 md:px-6">
          {!showCaptureActions ? (
            <Pressable
              onPress={() => void requestSample()}
              disabled={waitingForDevice}
              className={`items-center justify-center rounded-2xl py-3.5 sm:py-4 ${
                waitingForDevice ? "bg-white/20" : "bg-cyan-500 active:bg-cyan-600"
              }`}
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold text-white sm:text-base">Request sample</Text>
            </Pressable>
          ) : (
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => void retakeOnDevice()}
                disabled={waitingForDevice}
                className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-3.5 active:bg-white/10 sm:py-4"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-white sm:text-base">
                  {waitingForDevice ? "Retaking…" : "Retake"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void proceedWithDeviceSample()}
                disabled={waitingForDevice}
                className="flex-1 items-center justify-center rounded-2xl bg-white py-3.5 active:bg-white/90 sm:py-4"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-navy sm:text-base">
                  {iotBusy ? "Loading…" : "Proceed"}
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={skipPhlegmToReview}
            className="self-center rounded-lg px-3 py-2 active:opacity-80"
            accessibilityRole="button"
          >
            <Text className="text-center text-xs font-semibold text-white/55 underline decoration-white/30">
              Skip — no sample
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}
