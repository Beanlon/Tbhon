import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import { IOT_COUGH_COUNT, IOT_COUGH_STEPS } from "../../constants/iotScreening";
import { useIotStatusSimulation } from "../../utils/useIotStatusSimulation";
import { palette } from "../../constants/palette";

const ACCENT_BLUE = palette.indigo;
const SUCCESS_GREEN = "#38d9a9";
const CTA_BLUE = palette.indigo;
const CTA_BLUE_PRESSED = palette.navy;
const COOL_VIOLET_TEXT = "#B7C6FF";
const LIGHT_LOADING_TINT = "#CFD9FF";
const GRADIENT_COLORS = [palette.deepNavy, palette.navy, palette.signupBg] as const;

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
  isPending,
  waveAmplitude,
}: {
  label: string;
  isActive: boolean;
  isDone: boolean;
  isPending: boolean;
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
        ? "rgba(61, 78, 166, 0.18)"
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
          fontFamily: undefined,
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
  const params = useLocalSearchParams<{ checklist?: string; audioUris?: string }>();
  const checklist = typeof params.checklist === "string" ? params.checklist : "";
  const incomingAudioUris =
    typeof params.audioUris === "string" && params.audioUris.length > 0 ? params.audioUris : "[]";

  const [coughIndex, setCoughIndex] = useState(1);
  const [completedCoughs, setCompletedCoughs] = useState(0);
  const [recordedUris, setRecordedUris] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(incomingAudioUris);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  });
  const [audioHint, setAudioHint] = useState<string | null>(null);
  const timeline = useIotStatusSimulation(IOT_COUGH_STEPS);
  const [waveAmplitude, setWaveAmplitude] = useState(0);
  const waveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const micScale = useRef(new Animated.Value(1)).current;
  const allDone = completedCoughs >= IOT_COUGH_COUNT;

  const isRecordingActive =
    timeline.running && timeline.activeIndex >= 1 && timeline.activeIndex <= 3;

  useEffect(() => {
    if (timeline.running) {
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
  }, [timeline.running]);

  useEffect(() => {
    if (isRecordingActive) {
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
    } else {
      micScale.setValue(1);
    }
  }, [isRecordingActive, micScale]);

  const { mainLabel, subLabel } = useMemo(() => {
    if (allDone) {
      return {
        mainLabel: "All coughs captured!",
        subLabel: "Recorded successfully. Tap continue to proceed.",
      };
    }
    if (timeline.done && completedCoughs > 0 && completedCoughs < IOT_COUGH_COUNT) {
      return {
        mainLabel: "Cough captured!",
        subLabel: `${IOT_COUGH_COUNT - completedCoughs} more cough${IOT_COUGH_COUNT - completedCoughs > 1 ? "s" : ""} remaining`,
      };
    }
    if (timeline.running) {
      return {
        mainLabel: isRecordingActive ? "Recording…" : "Processing…",
        subLabel: isRecordingActive
          ? "Cough naturally into your device"
          : "Hang tight, almost done",
      };
    }
    return {
      mainLabel: "Ready to record",
      subLabel: "Tap the button when prompted by your device",
    };
  }, [allDone, timeline.done, timeline.running, isRecordingActive, completedCoughs]);

  const startCough = useCallback(async () => {
    setAudioHint(null);
    timeline.reset();
    const ok = await timeline.run();
    if (!ok) return;
    const currentSlot = Math.max(0, coughIndex - 1);
    const nextCompleted = Math.max(completedCoughs, coughIndex);
    setCompletedCoughs(nextCompleted);
    setRecordedUris((prev) => {
      const next = [...prev];
      next[currentSlot] = `iot://cough-${coughIndex}`;
      return next;
    });
  }, [completedCoughs, coughIndex, timeline]);

  const retakeCurrent = useCallback(() => {
    setAudioHint(null);
    setRecordedUris((prev) => {
      const next = [...prev];
      if (coughIndex - 1 < next.length) next[coughIndex - 1] = "";
      return next;
    });
    timeline.reset();
  }, [coughIndex, timeline]);

  const playCurrent = useCallback(async () => {
    const uri = recordedUris[coughIndex - 1];
    if (!uri || uri.startsWith("iot://")) {
      setAudioHint("Playback will be available once device audio sync is connected.");
      return;
    }
    setAudioHint(null);
    try {
      const sound = new Audio.Sound();
      await sound.loadAsync({ uri }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) {
          void sound.unloadAsync();
        }
      });
    } catch {
      setAudioHint("Could not play this recording right now.");
    }
  }, [recordedUris, coughIndex]);

  const continueNext = () => {
    setAudioHint(null);
    if (completedCoughs < IOT_COUGH_COUNT) {
      setCoughIndex(completedCoughs + 1);
      timeline.reset();
    } else {
      router.push({
        pathname: "/screening/iot-sputum",
        params: {
          checklist,
          audioDone: "1",
          iotMode: "1",
          audioUris: JSON.stringify(recordedUris.filter((u) => typeof u === "string" && u.length > 0)),
        },
      } as any);
    }
  };

  const micBgColor = allDone
    ? SUCCESS_GREEN
    : isRecordingActive
      ? ACCENT_BLUE
      : "#314188";

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
                disabled={timeline.running}
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
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff", letterSpacing: -0.2 }}>
                Cough {coughIndex} of {IOT_COUGH_COUNT}
              </Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Progress dots */}
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
                const isDot = n < coughIndex || (n === coughIndex && allDone);
                const isActive = n === coughIndex && !allDone;
                return (
                  <View
                    key={i}
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width: isActive ? 24 : 6,
                      backgroundColor: isDot
                        ? SUCCESS_GREEN
                        : isActive
                          ? ACCENT_BLUE
                          : "rgba(255,255,255,0.2)",
                    }}
                  />
                );
              })}
            </View>

            {/* Mic area */}
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
              {isRecordingActive && (
                <>
                  <PulseRing delay={0} active={isRecordingActive} />
                  <PulseRing delay={600} active={isRecordingActive} />
                  <PulseRing delay={1200} active={isRecordingActive} />
                </>
              )}
              <Pressable
                onPress={!timeline.running && !allDone && !timeline.done ? startCough : undefined}
                disabled={timeline.running || allDone}
              >
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
                  {allDone || timeline.done ? (
                    <Ionicons name="checkmark" size={32} color="#fff" />
                  ) : (
                    <Ionicons
                      name="mic"
                      size={30}
                      color="#fff"
                      style={{ opacity: isRecordingActive ? 1 : 0.85 }}
                    />
                  )}
                </Animated.View>
              </Pressable>
            </View>

            {/* Text section */}
            <View style={{ alignItems: "center", marginBottom: 32, paddingHorizontal: 28 }}>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: "700",
                  color: timeline.done || allDone ? SUCCESS_GREEN : timeline.running ? COOL_VIOLET_TEXT : "#fff",
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
                  maxWidth: 220,
                }}
              >
                {subLabel}
              </Text>
            </View>

            {/* Steps card */}
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
                  isActive={timeline.activeIndex === i}
                  isDone={i <= timeline.completedThrough}
                  isPending={i > timeline.activeIndex && i > timeline.completedThrough}
                  waveAmplitude={waveAmplitude}
                />
              ))}
            </View>

            {/* CTA */}
            <View style={{ paddingHorizontal: 28 }}>
            {!timeline.running && !timeline.done && !allDone && (
              <Pressable onPress={startCough} style={{ opacity: 1 }}>
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
            {timeline.running && (
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 18,
                  paddingVertical: 17,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: "rgba(255,255,255,0.3)" }}>
                  Recording in progress…
                </Text>
              </View>
            )}
            {timeline.done && !allDone && (
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
                <Pressable onPress={continueNext} style={{ opacity: 1 }}>
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
                        Proceed to cough {coughIndex + 1}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            )}
            {allDone && (
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
                <Pressable onPress={continueNext} style={{ opacity: 1 }}>
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
                        Proceed to sputum capture
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            )}
            {audioHint ? (
              <Text
                style={{
                  marginTop: 10,
                  textAlign: "center",
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                {audioHint}
              </Text>
            ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}
