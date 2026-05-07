import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
        <Ionicons name="sync-outline" size={18} color="rgba(232,238,255,0.7)" />
        <Text className="text-sm font-semibold text-[#E8EEFF]/70">
          Checking recording quality…
        </Text>
      </View>
    );
  }

  if (status === "ok") {
    return (
      <View className="mt-3.5 flex-row items-center gap-2 rounded-xl border border-[#34D399]/35 bg-[#34D399]/15 px-4 py-2.5">
        <Ionicons name="checkmark-circle" size={18} color="#34D399" />
        <Text className="text-sm font-bold text-[#34D399]">
          Good take — cough detected
        </Text>
      </View>
    );
  }

  const msg = QUALITY_LABEL_MSG[label] ?? "Recording may not be a clear cough";
  return (
    <View className="mt-3.5 flex-row items-start gap-2 rounded-xl border border-[#FBBF24]/35 bg-[#FBBF24]/10 px-4 py-2.5">
      <Ionicons name="warning-outline" size={18} color="#FBBf24" style={{ marginTop: 1 }} />
      <View className="flex-1">
        <Text className="mb-0.5 text-sm font-bold text-[#FBBf24]">
          Poor quality — redo recommended
        </Text>
        <Text className="text-sm text-[#FBBf24]/85">{msg}</Text>
      </View>
    </View>
  );
}

export default function RecordingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <View className="flex-1 bg-[#0B1530]">
      <View
        className="flex-row items-center justify-between px-4 pb-3.5"
        style={{ paddingTop: Math.max(insets.top, 16) + 8 }}
      >
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
          <Ionicons name="chevron-back" size={22} color="#E8EEFF" />
        </Pressable>

        <View className="items-center">
          <Text className="text-base font-extrabold text-[#E8EEFF]">{headerTitle}</Text>
          <Text className="mt-0.5 text-sm font-semibold text-[#E8EEFF]/55">
            Cough {coughIndex} of {COUGH_TOTAL}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            resetSession();
            router.back();
          }}
          className="size-11 items-center justify-center rounded-full bg-white/5 active:bg-white/10"
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color="#E8EEFF" />
        </Pressable>
      </View>

      <View className="flex-row justify-center gap-2 pb-2">
        {Array.from({ length: COUGH_TOTAL }).map((_, i) => {
          const n = i + 1;
          const recorded = durations[i] != null;
          const current = n === coughIndex;
          return (
            <View
              key={n}
              className="rounded-full"
              style={{
                width: current ? 22 : 8,
                height: 8,
                backgroundColor: recorded
                  ? "rgba(255,255,255,0.85)"
                  : current
                    ? "rgba(255,255,255,0.45)"
                    : "rgba(255,255,255,0.18)",
              }}
            />
          );
        })}
      </View>

      <View className="flex-1 items-center justify-center px-4">
        <View className="mb-4 items-center justify-center">
          <View className="size-56 items-center justify-center rounded-full bg-white/5">
            <View className="size-44 items-center justify-center rounded-full bg-white/5">
              <View className="size-32 items-center justify-center rounded-full border border-white/25 bg-white/90">
                <Ionicons name="mic" size={42} color="#0B1530" />
              </View>
            </View>
          </View>
        </View>

        {phase === "ready" && (
          <>
            <Text className="mb-1.5 text-base font-bold text-[#E8EEFF]">
              {coughIndex === 1
                ? "We’ll record 3 coughs"
                : `Ready for cough ${coughIndex}`}
            </Text>
            <Text className="text-center text-sm leading-5 text-[#E8EEFF]/75">
              {coughIndex === 1
                ? "One cough at a time. Hold the phone ~20cm away, then start the countdown."
                : "Same setup — one clear cough when you hear GO."}
            </Text>
          </>
        )}

        {phase === "countdown" && (
          <>
            <Text className="mb-2.5 text-base font-bold text-[#E8EEFF]/80">
              Cough {coughIndex} — get ready…
            </Text>
            <Text className="text-5xl font-black tracking-widest text-white">
              {countdown <= 0 ? "GO" : countdown}
            </Text>
          </>
        )}

        {phase === "recording" && (
          <>
            <Text className="mb-1.5 text-base font-extrabold text-[#E8EEFF]">
              Recording cough {coughIndex}…
            </Text>
            <Text className="mb-4 text-sm text-[#E8EEFF]/75">
              Cough once clearly, then tap Stop.
            </Text>

            <View className="h-16 w-full max-w-80 flex-row items-end justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-3.5">
              {levels.map((lvl, i) => {
                const h = 8 + lvl * 44;
                return (
                  <View
                    key={i}
                    className="rounded bg-[#E8EEFF]/70"
                    style={{
                      width: 5,
                      height: Math.min(52, h),
                    }}
                  />
                );
              })}
            </View>

            <Text className="mt-2.5 text-sm text-[#E8EEFF]/70">{timeLabel}</Text>
          </>
        )}

        {phase === "done" && !allDone && (
          <>
            <Text className="mb-1.5 text-base font-extrabold text-[#E8EEFF]">
              Cough {coughIndex} saved
            </Text>
            <Text className="text-center text-sm leading-5 text-[#E8EEFF]/75">
              Duration {timeLabel}. Next: cough {coughIndex + 1} of {COUGH_TOTAL}.
            </Text>
            <QualityBadge status={qualityStatus} label={qualityLabel} />
          </>
        )}

        {phase === "done" && allDone && (
          <>
            <Text className="mb-1.5 text-base font-extrabold text-[#E8EEFF]">
              All 3 coughs recorded
            </Text>
            <Text className="text-center text-sm leading-5 text-[#E8EEFF]/75">
              Last clip: {timeLabel}. You can redo the last cough if needed.
            </Text>
            <QualityBadge status={qualityStatus} label={qualityLabel} />
          </>
        )}
      </View>

      <View
        className="px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 38) + 42 }}
      >
        {phase === "ready" && (
          <Pressable
            onPress={startCountdown}
            className="items-center justify-center rounded-2xl bg-white py-4 active:bg-white/90"
            accessibilityRole="button"
          >
            <Text className="text-base font-black text-[#0B1530]">
              {coughIndex === 1 ? "Start cough 1" : `Record cough ${coughIndex}`}
            </Text>
          </Pressable>
        )}

        {phase === "countdown" && (
          <View className="flex-row gap-3">
            <Pressable
              onPress={redoCurrentCough}
              className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-4 active:bg-white/10"
              accessibilityRole="button"
            >
              <Text className="text-base font-extrabold text-[#E8EEFF]">Cancel</Text>
            </Pressable>
          </View>
        )}

        {phase === "recording" && (
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => void stopRecording()}
              disabled={seconds < MIN_RECORD_SECONDS}
              className={`flex-1 items-center justify-center rounded-2xl py-4 ${
                seconds < MIN_RECORD_SECONDS
                  ? "bg-[#FF5A5A]/35"
                  : "bg-[#FF5A5A] active:bg-[#FF5A5A]/95"
              }`}
              accessibilityRole="button"
            >
              <Text className="text-base font-black text-[#081126]">
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
                className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-4 active:bg-white/10"
                accessibilityRole="button"
              >
                <Text className="text-base font-extrabold text-[#E8EEFF]">Redo</Text>
              </Pressable>
              <Pressable
                onPress={goToNextCough}
                disabled={advanceDisabled}
                className={`flex-1 items-center justify-center rounded-2xl py-4 ${
                  advanceDisabled ? "bg-white/20" : "bg-white active:bg-white/90"
                }`}
                accessibilityRole="button"
                accessibilityState={{ disabled: advanceDisabled }}
              >
                <Text
                  className={`text-base font-black ${
                    advanceDisabled ? "text-[#E8EEFF]/55" : "text-[#0B1530]"
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
                className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-4 active:bg-white/10"
                accessibilityRole="button"
              >
                <Text className="text-base font-extrabold text-[#E8EEFF]">Redo last</Text>
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
                className={`flex-1 items-center justify-center rounded-2xl py-4 ${
                  continueDisabled ? "bg-white/20" : "bg-white active:bg-white/90"
                }`}
                accessibilityRole="button"
                accessibilityState={{ disabled: continueDisabled }}
              >
                <Text
                  className={`text-base font-black ${
                    continueDisabled ? "text-[#E8EEFF]/55" : "text-[#0B1530]"
                  }`}
                >
                  {continueLabel}
                </Text>
              </Pressable>
            </View>
          );
        })()}
      </View>
    </View>
  );
}
