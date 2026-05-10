import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { resolveTbApiBaseUrls } from "../../utils/tbApiUrl";

const COUGH_TOTAL = 3;
const MIN_RECORD_SECONDS = 3;
const MAX_RECORD_SECONDS = 10;

type QualityStatus = "checking" | "ok" | "bad" | "skipped";
type QualityLabel = "silence" | "speech" | "replay" | "noise" | "invalid" | "";

const QUALITY_LABEL_MSG: Record<string, string> = {
  silence: "Too quiet — cough louder",
  speech: "Sounds like speech, not a cough",
  replay: "Sounds like a recording/replay",
  noise: "Too much background noise",
  invalid: "Could not validate recording",
};

type Phase = "ready" | "countdown" | "recording" | "done";

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function normalizeFileUri(uri: string): string {
  const trimmed = String(uri || "").trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  return hasScheme ? trimmed : `file://${trimmed}`;
}

function pickMimeAndName(uri: string): { name: string; mimeType: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4") || lower.endsWith(".aac")) {
    return { name: "cough.m4a", mimeType: "audio/mp4" };
  }
  if (lower.endsWith(".3gp") || lower.endsWith(".3gpp")) {
    return { name: "cough.3gp", mimeType: "audio/3gpp" };
  }
  if (lower.endsWith(".caf")) {
    return { name: "cough.caf", mimeType: "audio/x-caf" };
  }
  if (lower.endsWith(".ogg") || lower.endsWith(".oga") || lower.endsWith(".opus")) {
    return { name: "cough.ogg", mimeType: "audio/ogg" };
  }
  return { name: "cough.wav", mimeType: "audio/wav" };
}

async function uploadAudioForCheck(base: string, uri: string): Promise<any | null> {
  const fileUri = normalizeFileUri(uri);
  const { name, mimeType } = pickMimeAndName(fileUri);
  const url = `${base.replace(/\/$/, "")}/check-quality`;
  const result = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType,
    parameters: { filename: name },
  });
  if (result.status < 200 || result.status >= 300) return null;
  try {
    return JSON.parse(result.body || "{}");
  } catch {
    return null;
  }
}

/**
 * Copy a freshly recorded audio file out of Expo Go's volatile cache into the
 * app's persistent documentDirectory so it survives navigation/reloads and
 * is reachable from later screens (e.g. Processing/Predict).
 */
async function persistRecordingToDocs(srcUri: string, coughIndex: number): Promise<string> {
  const src = normalizeFileUri(srcUri);
  const docs = FileSystem.documentDirectory ?? "";
  if (!docs) return src;
  const dirUri = `${docs}coughs`;
  try {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }
  } catch {
    // best-effort; if mkdir fails fall back to docs root
  }
  const lower = src.toLowerCase();
  const ext = lower.endsWith(".m4a")
    ? ".m4a"
    : lower.endsWith(".3gp")
      ? ".3gp"
      : lower.endsWith(".caf")
        ? ".caf"
        : lower.endsWith(".ogg")
          ? ".ogg"
          : ".wav";
  const ts = Date.now();
  const dest = `${dirUri}/cough_${coughIndex}_${ts}${ext}`;
  try {
    await FileSystem.copyAsync({ from: src, to: dest });
    return dest;
  } catch (e) {
    console.log("[Recording] persistRecording copy failed:", String((e as any)?.message ?? e));
    return src;
  }
}

function QualityBadge({ status, label }: { status: QualityStatus; label: QualityLabel }) {
  if (status === "skipped") return null;

  if (status === "checking") {
    return (
      <View className="mt-3.5 flex-row items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5">
        <Ionicons name="sync-outline" size={18} color="rgba(255,255,255,0.7)" />
        <Text className="text-sm font-semibold text-white/70">
          Checking recording quality…
        </Text>
      </View>
    );
  }

  if (status === "ok") {
    return (
      <View className="mt-3.5 flex-row items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/15 px-4 py-2.5">
        <Ionicons name="checkmark-circle" size={18} color="#34D399" />
        <Text className="text-sm font-bold text-emerald-400">
          Good take — cough detected
        </Text>
      </View>
    );
  }

  const msg = QUALITY_LABEL_MSG[label] ?? "Recording may not be a clear cough";
  return (
    <View className="mt-3.5 flex-row items-start gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-2.5">
      <View className="mt-px">
        <Ionicons name="warning-outline" size={18} color="#fbbf24" />
      </View>
      <View className="flex-1">
        <Text className="mb-0.5 text-sm font-bold text-amber-400">
          Poor quality — redo recommended
        </Text>
        <Text className="text-sm text-amber-400/85">{msg}</Text>
      </View>
    </View>
  );
}

export default function RecordingScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const micIconSize = windowWidth < 380 ? 36 : 42;
  const [coughIndex, setCoughIndex] = useState(1);
  const [phase, setPhase] = useState<Phase>("ready");
  const [countdown, setCountdown] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [durations, setDurations] = useState<(number | null)[]>(() => Array.from({ length: COUGH_TOTAL }, () => null));
  const [audioUris, setAudioUris] = useState<(string | null)[]>(() => Array.from({ length: COUGH_TOTAL }, () => null));
  const [micReady, setMicReady] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 26 }, () => 0.15));
  const [qualityStatus, setQualityStatus] = useState<QualityStatus>("skipped");
  const [qualityLabel, setQualityLabel] = useState<QualityLabel>("");

  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef<any>(null);
  const stoppingRef = useRef(false);

  const timeLabel = useMemo(() => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }, [seconds]);

  const clearTimers = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    if (meterIntervalRef.current) clearInterval(meterIntervalRef.current);
    countdownIntervalRef.current = null;
    recordIntervalRef.current = null;
    meterIntervalRef.current = null;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (!mounted) return;
        setMicReady(perm.granted === true);
        if (perm.granted) {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        }
      } catch {
        if (mounted) setMicReady(false);
      }
    })();

    return () => {
      mounted = false;
      clearTimers();
      void recordingRef.current?.stopAndUnloadAsync().catch(() => undefined);
      recordingRef.current = null;
    };
  }, []);

  const startRecording = async () => {
    stoppingRef.current = false;
    setPhase("recording");
    setLevels(Array.from({ length: 26 }, () => 0.15));
    setQualityStatus("skipped");
    setQualityLabel("");
    recordIntervalRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_RECORD_SECONDS && !stoppingRef.current) {
          stoppingRef.current = true;
          void stopRecording();
        }
        return next;
      });
    }, 1000);

    if (!micReady) return;
    try {
      const rec = new Audio.Recording();
      const opts: any = Audio.RecordingOptionsPresets.HIGH_QUALITY;
      if (opts?.ios) opts.ios.isMeteringEnabled = true;
      if (opts?.android) opts.android.isMeteringEnabled = true;
      await rec.prepareToRecordAsync(opts);
      await rec.startAsync();
      recordingRef.current = rec;

      meterIntervalRef.current = setInterval(async () => {
        try {
          const r = recordingRef.current;
          if (!r) return;
          const st = await r.getStatusAsync();
          const db = typeof st?.metering === "number" ? st.metering : -160;
          const clamped = Math.max(-60, Math.min(0, db));
          const norm = (clamped + 60) / 60;
          const v = 0.12 + norm * 0.88;
          setLevels((prev) => {
            const next = prev.slice(1);
            next.push(v);
            return next;
          });
        } catch {
          // ignore polling errors
        }
      }, 90);
    } catch {
      recordingRef.current = null;
    }
  };

  const startCountdown = () => {
    clearTimers();

    setSeconds(0);
    setCountdown(3);
    setPhase("countdown");

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          void startRecording();
          return 0;
        }
        return c - 1;
      });
    }, 850);
  };

  const stopRecording = async () => {
    if (stoppingRef.current) {
      // allow the first stop call to proceed; guard against double-taps
    } else {
      stoppingRef.current = true;
    }
    clearTimers();

    let uri: string | null = null;
    try {
      const rec = recordingRef.current;
      if (rec) {
        await rec.stopAndUnloadAsync();
        uri = rec.getURI() ?? null;
      }
    } catch {
      uri = null;
    } finally {
      recordingRef.current = null;
    }

    if (uri) {
      try {
        uri = await persistRecordingToDocs(uri, coughIndex);
      } catch (e) {
        console.log("[Recording] persistRecording threw:", String((e as any)?.message ?? e));
      }
    }

    setDurations((prev) => {
      const next = [...prev];
      next[coughIndex - 1] = seconds;
      return next;
    });
    setAudioUris((prev) => {
      const next = [...prev];
      next[coughIndex - 1] = uri;
      return next;
    });
    setPhase("done");

    if (uri) {
      setQualityStatus("checking");
      setQualityLabel("");
      const apiBases = resolveTbApiBaseUrls();
      try {
        let data: any = null;
        for (const base of apiBases) {
          try {
            const result = await uploadAudioForCheck(base, uri);
            if (result) {
              data = result;
              break;
            }
          } catch (e) {
            console.log(`[Recording] check-quality failed at ${base}:`, String((e as any)?.message ?? e));
          }
        }
        if (!data) {
          setQualityStatus("skipped");
          return;
        }
        setQualityStatus(data?.ok === true ? "ok" : "bad");
        setQualityLabel((data?.label ?? "") as QualityLabel);
      } catch {
        setQualityStatus("skipped");
      }
    } else {
      setQualityStatus("skipped");
    }
  };

  const clearDurationForCurrentCough = () => {
    setDurations((prev) => {
      const next = [...prev];
      next[coughIndex - 1] = null;
      return next;
    });
  };

  /** Same cough again (ready state, same index). */
  const redoCurrentCough = () => {
    clearTimers();
    stoppingRef.current = false;
    setSeconds(0);
    setCountdown(3);
    setPhase("ready");
  };

  /** After a successful take, move to the next cough or stay on last for final review. */
  const goToNextCough = () => {
    clearTimers();
    stoppingRef.current = false;
    setSeconds(0);
    setCountdown(3);
    setPhase("ready");
    setCoughIndex((i) => Math.min(COUGH_TOTAL, i + 1));
  };

  /** Full reset (e.g. leave screen). */
  const resetSession = () => {
    clearTimers();
    stoppingRef.current = false;
    setCoughIndex(1);
    setSeconds(0);
    setCountdown(3);
    setPhase("ready");
    setDurations(Array.from({ length: COUGH_TOTAL }, () => null));
    setAudioUris(Array.from({ length: COUGH_TOTAL }, () => null));
  };

  const isLastCough = coughIndex === COUGH_TOTAL;
  const allDone = isLastCough && phase === "done";

  const headerTitle =
    phase === "recording"
      ? "Recording Cough"
      : phase === "done" && allDone
        ? "All coughs recorded"
        : phase === "done"
          ? "Cough saved"
          : "Record Cough";

  return (
    <>
      <StatusBar style="light" backgroundColor="#0B1530" translucent={false} />
      <SafeAreaView
        className="flex-1 bg-navy"
        edges={["top", "right", "bottom", "left"]}
      >
      <View className="flex-row items-center justify-between px-4 pb-3.5 pt-2 sm:px-5 md:px-6">
        <Pressable
          onPress={() => {
            if (phase === "recording" || phase === "countdown") {
              redoCurrentCough();
            }
            resetSession();
            router.back();
          }}
          className="size-11 items-center justify-center rounded-full bg-white/5 active:bg-white/10"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#ffffff" />
        </Pressable>

        <View className="min-w-0 flex-1 items-center px-2">
          <Text className="text-center text-sm font-bold text-white sm:text-base" numberOfLines={2}>
            {headerTitle}
          </Text>
          <Text className="mt-0.5 text-center text-xs font-semibold text-white/55 sm:text-sm">
            Cough {coughIndex} of {COUGH_TOTAL}
          </Text>
        </View>

        <View className="size-11" />
      </View>

      <View className="flex-row justify-center gap-2 px-4 pb-2 sm:px-5 md:px-6">
        {Array.from({ length: COUGH_TOTAL }).map((_, i) => {
          const n = i + 1;
          const recorded = durations[i] != null;
          const current = n === coughIndex;
          const dotTone = recorded
            ? "bg-white/85"
            : current
              ? "bg-white/45"
              : "bg-white/18";
          return (
            <View
              key={n}
              className={`h-2 rounded-full ${current ? "w-6" : "w-2"} ${dotTone}`}
            />
          );
        })}
      </View>

      <View className="min-h-0 flex-1 items-center justify-center px-4 sm:px-5 md:px-6">
        <View className="mb-3 items-center justify-center sm:mb-4">
          <View className="size-48 items-center justify-center rounded-full bg-white/5 sm:size-56">
            <View className="size-36 items-center justify-center rounded-full bg-white/5 sm:size-44">
              <View className="size-28 items-center justify-center rounded-full border border-white/25 bg-white/90 sm:size-32">
                <Ionicons name="mic" size={micIconSize} color="#0f172a" />
              </View>
            </View>
          </View>
        </View>

        {phase === "ready" && (
          <>
            <Text className="mb-1.5 text-center text-sm font-bold text-white sm:text-base">
              {coughIndex === 1
                ? "We’ll record 3 coughs"
                : `Ready for cough ${coughIndex}`}
            </Text>
            <Text className="max-w-md text-center text-xs leading-5 text-white/75 sm:text-sm">
              {coughIndex === 1
                ? "One cough at a time. Hold the phone ~20cm away, then start the countdown."
                : "Same setup — one clear cough when you hear GO."}
            </Text>
          </>
        )}

        {phase === "countdown" && (
          <>
            <Text className="mb-2.5 text-center text-sm font-bold text-white/80 sm:text-base">
              Cough {coughIndex} — get ready…
            </Text>
            <Text className="text-4xl font-extrabold tracking-widest text-white sm:text-5xl">
              {countdown <= 0 ? "GO" : countdown}
            </Text>
          </>
        )}

        {phase === "recording" && (
          <>
            <Text className="mb-1.5 text-center text-sm font-bold text-white sm:text-base">
              Recording cough {coughIndex}…
            </Text>
            <Text className="mb-3 max-w-md text-center text-xs text-white/75 sm:mb-4 sm:text-sm">
              Cough once clearly, then tap Stop.
            </Text>

            <View className="h-14 w-full max-w-xs flex-row items-end justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-2.5 sm:h-16 sm:max-w-80 sm:px-3.5">
              {levels.map((lvl, i) => {
                const h = 8 + lvl * 44;
                return (
                  <View
                    key={i}
                    className="rounded bg-white/70"
                    style={{
                      width: 5,
                      height: Math.min(52, h),
                    }}
                  />
                );
              })}
            </View>

            <Text className="mt-2 text-xs text-white/70 sm:mt-2.5 sm:text-sm">{timeLabel}</Text>
          </>
        )}

        {phase === "done" && !allDone && (
          <>
            <Text className="mb-1.5 text-center text-sm font-bold text-white sm:text-base">
              Cough {coughIndex} saved
            </Text>
            <Text className="max-w-md text-center text-xs leading-5 text-white/75 sm:text-sm">
              Duration {timeLabel}. Next: cough {coughIndex + 1} of {COUGH_TOTAL}.
            </Text>
            <QualityBadge status={qualityStatus} label={qualityLabel} />
          </>
        )}

        {phase === "done" && allDone && (
          <>
            <Text className="mb-1.5 text-center text-sm font-bold text-white sm:text-base">
              All 3 coughs recorded
            </Text>
            <Text className="max-w-md text-center text-xs leading-5 text-white/75 sm:text-sm">
              Last clip: {timeLabel}. You can redo the last cough if needed.
            </Text>
            <QualityBadge status={qualityStatus} label={qualityLabel} />
          </>
        )}
      </View>

      <View className="px-4 pt-3 pb-6 sm:px-5 sm:pb-8 md:px-6">
        {phase === "ready" && (
          <Pressable
            onPress={startCountdown}
            className="items-center justify-center rounded-2xl bg-white py-3.5 active:bg-white/90 sm:py-4"
            accessibilityRole="button"
          >
            <Text className="text-sm font-bold text-navy sm:text-base">
              {coughIndex === 1 ? "Start cough 1" : `Record cough ${coughIndex}`}
            </Text>
          </Pressable>
        )}

        {phase === "countdown" && (
          <View className="flex-row gap-3">
            <Pressable
              onPress={redoCurrentCough}
              className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-3.5 active:bg-white/10 sm:py-4"
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold text-white sm:text-base">Cancel</Text>
            </Pressable>
          </View>
        )}

        {phase === "recording" && (
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => void stopRecording()}
              disabled={seconds < MIN_RECORD_SECONDS}
              className={`flex-1 items-center justify-center rounded-2xl py-3.5 sm:py-4 ${
                seconds < MIN_RECORD_SECONDS
                  ? "bg-rose-400/35"
                  : "bg-rose-500 active:bg-rose-500/95"
              }`}
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold text-slate-950 sm:text-base">
                {seconds < MIN_RECORD_SECONDS ? `Hold… (${MIN_RECORD_SECONDS - seconds}s)` : "Stop"}
              </Text>
            </Pressable>
          </View>
        )}

        {phase === "done" && !allDone && (() => {
          const advanceDisabled = qualityStatus !== "ok";
          const advanceLabel =
            qualityStatus === "checking"
              ? "Checking…"
              : qualityStatus === "ok"
                ? "Next cough"
                : "Redo to continue";
          return (
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  clearDurationForCurrentCough();
                  redoCurrentCough();
                }}
                className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-3.5 active:bg-white/10 sm:py-4"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-white sm:text-base">Redo</Text>
              </Pressable>
              <Pressable
                onPress={goToNextCough}
                disabled={advanceDisabled}
                className={`flex-1 items-center justify-center rounded-2xl py-3.5 sm:py-4 ${
                  advanceDisabled ? "bg-white/20" : "bg-white active:bg-white/90"
                }`}
                accessibilityRole="button"
                accessibilityState={{ disabled: advanceDisabled }}
              >
                <Text
                  className={`text-sm font-bold sm:text-base ${
                    advanceDisabled ? "text-white/55" : "text-navy"
                  }`}
                >
                  {advanceLabel}
                </Text>
              </Pressable>
            </View>
          );
        })()}

        {phase === "done" && allDone && (() => {
          const allOk = qualityStatus === "ok";
          const continueDisabled = !allOk;
          const continueLabel = qualityStatus === "checking" ? "Checking…" : allOk ? "Continue" : "Redo to continue";
          return (
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  clearDurationForCurrentCough();
                  redoCurrentCough();
                }}
                className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-3.5 active:bg-white/10 sm:py-4"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-white sm:text-base">Redo last</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (continueDisabled) return;
                  resetSession();
                  const recordedUris = audioUris.filter((u) => typeof u === "string" && u.length > 0) as string[];
                  router.push({
                    pathname: "/screening/phlegm",
                    params: {
                      audioDone: recordedUris.length === COUGH_TOTAL ? "1" : "0",
                      audioUris: JSON.stringify(recordedUris),
                    },
                  } as any);
                }}
                disabled={continueDisabled}
                className={`flex-1 items-center justify-center rounded-2xl py-3.5 sm:py-4 ${
                  continueDisabled ? "bg-white/20" : "bg-white active:bg-white/90"
                }`}
                accessibilityRole="button"
                accessibilityState={{ disabled: continueDisabled }}
              >
                <Text
                  className={`text-sm font-bold sm:text-base ${
                    continueDisabled ? "text-white/55" : "text-navy"
                  }`}
                >
                  {continueLabel}
                </Text>
              </Pressable>
            </View>
          );
        })()}
      </View>
    </SafeAreaView>
    </>
  );
}
