import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COUGH_TOTAL = 3;

type Phase = "ready" | "countdown" | "recording" | "done";

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

export default function RecordingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [coughIndex, setCoughIndex] = useState(1);
  const [phase, setPhase] = useState<Phase>("ready");
  const [countdown, setCountdown] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [durations, setDurations] = useState<(number | null)[]>(() => Array.from({ length: COUGH_TOTAL }, () => null));

  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeLabel = useMemo(() => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }, [seconds]);

  const clearTimers = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    countdownIntervalRef.current = null;
    recordIntervalRef.current = null;
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const startRecording = () => {
    setPhase("recording");
    recordIntervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
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
          startRecording();
          return 0;
        }
        return c - 1;
      });
    }, 850);
  };

  const stopRecording = () => {
    clearTimers();
    setDurations((prev) => {
      const next = [...prev];
      next[coughIndex - 1] = seconds;
      return next;
    });
    setPhase("done");
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
    setSeconds(0);
    setCountdown(3);
    setPhase("ready");
  };

  /** After a successful take, move to the next cough or stay on last for final review. */
  const goToNextCough = () => {
    clearTimers();
    setSeconds(0);
    setCountdown(3);
    setPhase("ready");
    setCoughIndex((i) => Math.min(COUGH_TOTAL, i + 1));
  };

  /** Full reset (e.g. leave screen). */
  const resetSession = () => {
    clearTimers();
    setCoughIndex(1);
    setSeconds(0);
    setCountdown(3);
    setPhase("ready");
    setDurations(Array.from({ length: COUGH_TOTAL }, () => null));
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
    <View style={{ flex: 1, backgroundColor: "#0B1530" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 16) + 8,
          paddingHorizontal: 18,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={() => {
            if (phase === "recording" || phase === "countdown") {
              redoCurrentCough();
            }
            resetSession();
            router.back();
          }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
          })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#E8EEFF" />
        </Pressable>

        <View style={{ alignItems: "center" }}>
          <Text style={{ color: "#E8EEFF", fontWeight: "800", fontSize: 16 }}>{headerTitle}</Text>
          <Text style={{ color: "rgba(232,238,255,0.55)", fontSize: 12, marginTop: 2, fontWeight: "600" }}>
            Cough {coughIndex} of {COUGH_TOTAL}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            resetSession();
            router.back();
          }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
          })}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color="#E8EEFF" />
        </Pressable>
      </View>

      {/* Progress dots */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, paddingBottom: 8 }}>
        {Array.from({ length: COUGH_TOTAL }).map((_, i) => {
          const n = i + 1;
          const recorded = durations[i] != null;
          const current = n === coughIndex;
          return (
            <View
              key={n}
              style={{
                width: current ? 22 : 8,
                height: 8,
                borderRadius: 4,
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

      {/* Content */}
      <View style={{ flex: 1, paddingHorizontal: 18, justifyContent: "center", alignItems: "center" }}>
        {/* Mic */}
        <View style={{ alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
          <View
            style={{
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: "rgba(255,255,255,0.06)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 170,
                height: 170,
                borderRadius: 85,
                backgroundColor: "rgba(255,255,255,0.07)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: "rgba(255,255,255,0.92)",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.25)",
                }}
              >
                <Ionicons name="mic" size={42} color="#0B1530" />
              </View>
            </View>
          </View>
        </View>

        {phase === "ready" && (
          <>
            <Text style={{ color: "#E8EEFF", fontSize: 16, fontWeight: "700", marginBottom: 6 }}>
              {coughIndex === 1
                ? "We’ll record 3 coughs"
                : `Ready for cough ${coughIndex}`}
            </Text>
            <Text style={{ color: "rgba(232,238,255,0.75)", fontSize: 13, textAlign: "center", lineHeight: 18 }}>
              {coughIndex === 1
                ? "One cough at a time. Hold the phone ~20cm away, then start the countdown."
                : "Same setup — one clear cough when you hear GO."}
            </Text>
          </>
        )}

        {phase === "countdown" && (
          <>
            <Text style={{ color: "rgba(232,238,255,0.8)", fontSize: 14, fontWeight: "700", marginBottom: 10 }}>
              Cough {coughIndex} — get ready…
            </Text>
            <Text style={{ color: "#FFFFFF", fontSize: 44, fontWeight: "900", letterSpacing: 2 }}>
              {countdown <= 0 ? "GO" : countdown}
            </Text>
          </>
        )}

        {phase === "recording" && (
          <>
            <Text style={{ color: "#E8EEFF", fontSize: 16, fontWeight: "800", marginBottom: 6 }}>
              Recording cough {coughIndex}…
            </Text>
            <Text style={{ color: "rgba(232,238,255,0.75)", fontSize: 13, marginBottom: 18 }}>
              Cough once clearly, then tap Stop.
            </Text>

            <View
              style={{
                width: "100%",
                maxWidth: 340,
                height: 64,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
                overflow: "hidden",
              }}
            >
              {Array.from({ length: 22 }).map((_, i) => {
                const base = (i % 6) + 2;
                const anim = phase === "recording" ? (seconds % 4) * 2 : 0;
                const h = 10 + base * 6 + ((i + seconds) % 5) * 3 + anim;
                return (
                  <View
                    key={i}
                    style={{
                      width: 6,
                      height: Math.min(52, h),
                      borderRadius: 4,
                      backgroundColor: "rgba(232,238,255,0.70)",
                    }}
                  />
                );
              })}
            </View>

            <Text style={{ color: "rgba(232,238,255,0.70)", fontSize: 12, marginTop: 10 }}>
              {timeLabel}
            </Text>
          </>
        )}

        {phase === "done" && !allDone && (
          <>
            <Text style={{ color: "#E8EEFF", fontSize: 16, fontWeight: "800", marginBottom: 6 }}>
              Cough {coughIndex} saved
            </Text>
            <Text style={{ color: "rgba(232,238,255,0.75)", fontSize: 13, textAlign: "center", lineHeight: 18 }}>
              Duration {timeLabel}. Next: cough {coughIndex + 1} of {COUGH_TOTAL}.
            </Text>
          </>
        )}

        {phase === "done" && allDone && (
          <>
            <Text style={{ color: "#E8EEFF", fontSize: 16, fontWeight: "800", marginBottom: 6 }}>
              All 3 coughs recorded
            </Text>
            <Text style={{ color: "rgba(232,238,255,0.75)", fontSize: 13, textAlign: "center", lineHeight: 18 }}>
              Last clip: {timeLabel}. You can redo the last cough if needed.
            </Text>
          </>
        )}
      </View>

      {/* Bottom actions */}
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 38) + 42,
        }}
      >
        {phase === "ready" && (
          <Pressable
            onPress={startCountdown}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "rgba(255,255,255,0.92)" : "#FFFFFF",
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
            })}
            accessibilityRole="button"
          >
            <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 14 }}>
              {coughIndex === 1 ? "Start cough 1" : `Record cough ${coughIndex}`}
            </Text>
          </Pressable>
        )}

        {phase === "countdown" && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={redoCurrentCough}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              })}
              accessibilityRole="button"
            >
              <Text style={{ color: "#E8EEFF", fontWeight: "800", fontSize: 14 }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {phase === "recording" && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={stopRecording}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? "rgba(255,90,90,0.95)" : "#FF5A5A",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
              })}
              accessibilityRole="button"
            >
              <Text style={{ color: "#081126", fontWeight: "900", fontSize: 14 }}>Stop</Text>
            </Pressable>
          </View>
        )}

        {phase === "done" && !allDone && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={() => {
                clearDurationForCurrentCough();
                redoCurrentCough();
              }}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              })}
              accessibilityRole="button"
            >
              <Text style={{ color: "#E8EEFF", fontWeight: "800", fontSize: 14 }}>Redo</Text>
            </Pressable>
            <Pressable
              onPress={goToNextCough}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? "rgba(255,255,255,0.92)" : "#FFFFFF",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
              })}
              accessibilityRole="button"
            >
              <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 14 }}>Next cough</Text>
            </Pressable>
          </View>
        )}

        {phase === "done" && allDone && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={() => {
                clearDurationForCurrentCough();
                redoCurrentCough();
              }}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              })}
              accessibilityRole="button"
            >
              <Text style={{ color: "#E8EEFF", fontWeight: "800", fontSize: 14 }}>Redo last</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                resetSession();
                router.push({ pathname: "/screening/phlegm", params: { audioDone: "1" } } as any);
              }}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? "rgba(255,255,255,0.92)" : "#FFFFFF",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
              })}
              accessibilityRole="button"
            >
              <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 14 }}>Continue</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
