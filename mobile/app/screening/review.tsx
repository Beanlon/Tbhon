import { useState, useRef, useEffect, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Audio } from "expo-av";
import { useTheme } from "../../contexts/ThemeContext";
import { IOT_COUGH_COUNT, formatSputumMissingDetail, SPUTUM_NO_SAMPLE_PILL, SPUTUM_SMEAR_REVIEW_LABEL, SPUTUM_SMEAR_REVIEW_LABEL_IOT } from "../../constants/iotScreening";
import { REVIEW_COUGH_FROM_DEVICE } from "../../constants/screeningBoothCopy";

export default function ReviewInputsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{
    audioDone?: string;
    audioUris?: string;
    iotRecordingIds?: string;
    imageUri?: string;
    checklist?: string;
    sessionId?: string;
    deviceSputum?: string;
    sputumByteSize?: string;
    sputumCapturedAt?: string;
    sputumSkipReason?: string;
    iotMode?: string;
  }>();

  const iotMode = params.iotMode === "1";
  const audioDone = params.audioDone === "1";
  const imageDone = typeof params.imageUri === "string" && params.imageUri.length > 0;
  const imageUri = imageDone ? (params.imageUri as string) : null;
  const audioUris = typeof params.audioUris === "string" ? params.audioUris : "[]";
  const iotRecordingIds = typeof params.iotRecordingIds === "string" ? params.iotRecordingIds : "[]";
  const checklist = typeof params.checklist === "string" ? params.checklist : "";
  const sessionId =
    typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : "";
  const sessionNavParams = sessionId.length > 0 ? ({ sessionId } as const) : {};
  const deviceSputumFlow = params.deviceSputum === "1";
  const sputumSkipReason =
    typeof params.sputumSkipReason === "string" && params.sputumSkipReason.trim().length > 0
      ? params.sputumSkipReason.trim()
      : "";
  const sputumSkipNavParams = sputumSkipReason.length > 0 ? ({ sputumSkipReason } as const) : {};
  const deviceSputumNavParams =
    params.deviceSputum === "1"
      ? {
          deviceSputum: "1" as const,
          sputumByteSize:
            typeof params.sputumByteSize === "string" ? params.sputumByteSize : "",
          sputumCapturedAt:
            typeof params.sputumCapturedAt === "string" ? params.sputumCapturedAt : "",
        }
      : {};
  const coughUris = (() => {
    try {
      const parsed = JSON.parse(audioUris);
      return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
    } catch {
      return [];
    }
  })();

  const [audioOpen, setAudioOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [audioHint, setAudioHint] = useState<string | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const canAnalyze = audioDone;

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.setOnPlaybackStatusUpdate(null);
        void soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  const stopCurrentSound = async () => {
    if (soundRef.current) {
      soundRef.current.setOnPlaybackStatusUpdate(null);
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  };

  const playAudioAt = async (index: number) => {
    const uri = coughUris[index];
    if (!uri || uri.startsWith("iot://")) {
      setAudioHint("Playback will be available when device audio sync is connected.");
      return;
    }

    if (playingIndex === index) {
      await stopCurrentSound();
      setPlayingIndex(null);
      return;
    }

    await stopCurrentSound();
    setAudioHint(null);
    setPlayingIndex(index);

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      const sound = new Audio.Sound();
      soundRef.current = sound;
      await sound.loadAsync({ uri }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.setOnPlaybackStatusUpdate(null);
          setPlayingIndex((current) => (current === index ? null : current));
          void sound.unloadAsync();
          if (soundRef.current === sound) {
            soundRef.current = null;
          }
        }
      });
    } catch (e) {
      setAudioHint(
        `Could not play this audio clip: ${e instanceof Error ? e.message : String(e)}`,
      );
      setPlayingIndex(null);
      soundRef.current = null;
    }
  };

  const StatusPill = ({ done, pendingLabel }: { done: boolean; pendingLabel?: string }) => {
    if (!done && pendingLabel) {
      return <Text className="text-xs font-bold sm:text-sm" style={{ color: colors.textMuted }}>{pendingLabel}</Text>;
    }
    if (done) {
      return <Ionicons name="checkmark-circle" size={20} color="#10B981" />;
    }
    return <Ionicons name="alert-circle" size={20} color={isDark ? "#FBBF24" : "#F59E0B"} />;
  };

  const AccordionRow = ({
    label,
    done,
    pendingLabel,
    open,
    onToggle,
    children,
  }: {
    label: string;
    done: boolean;
    pendingLabel?: string;
    open: boolean;
    onToggle: () => void;
    children?: ReactNode;
  }) => (
    <View className="border-b last:border-b-0" style={{ borderColor: colors.borderLight }}>
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between py-3.5 active:opacity-90 sm:py-4"
        accessibilityRole="button"
      >
        <View className="flex-row items-center gap-2.5">
          <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={18} color={colors.text} />
          <Text className="text-sm font-bold sm:text-base" style={{ color: colors.text }}>{label}</Text>
        </View>
        <StatusPill done={done} pendingLabel={pendingLabel} />
      </Pressable>

      {open ? <View className="pb-3.5 pt-0 sm:pb-4">{children}</View> : null}
    </View>
  );

  return (
    <>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "right", "bottom", "left"]}>
      <View className="flex-row items-center justify-between border-b px-4 pb-3.5 pt-2 sm:px-5 md:px-6" style={{ borderColor: colors.borderLight }}>
        <View className="size-11" />

        <View className="min-w-0 flex-1 items-center px-2">
          <Text
            className="text-center text-sm font-bold sm:text-base"
            style={{ color: colors.text }}
            numberOfLines={2}
          >
            Review inputs
          </Text>
          <Text className="mt-0.5 text-center text-xs font-semibold sm:text-sm" style={{ color: colors.textMuted }}>
            Verify before analysis
          </Text>
        </View>

        <View className="size-11" />
      </View>

      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-4 pb-4 pt-4 sm:px-5 md:px-6">
          <View
            className="overflow-hidden rounded-2xl border px-4"
            style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
          >
            <AccordionRow
              label={iotMode ? "Cough recordings (device)" : "Recorded audio"}
              done={audioDone}
              open={audioOpen}
              onToggle={() => setAudioOpen((v) => !v)}
            >
              <Text className="text-xs leading-5 sm:text-sm" style={{ color: colors.textSecondary }}>
                {audioDone
                  ? iotMode
                    ? REVIEW_COUGH_FROM_DEVICE
                    : "Audio recorded (3 coughs). Playback will appear once we wire real audio file recording."
                  : "No cough recordings received yet."}
              </Text>
              {audioDone && (
                <View className="mt-3 gap-2">
                  {Array.from({ length: iotMode ? IOT_COUGH_COUNT : Math.max(coughUris.length, 3) }).map((_, i) => {
                    const label = `Cough ${i + 1}`;
                    const uri = coughUris[i] ?? "";
                    const canPlay = uri.length > 0 && !uri.startsWith("iot://");
                    return (
                      <Pressable
                        key={label}
                        onPress={() => void playAudioAt(i)}
                        disabled={!uri}
                        className="flex-row items-center justify-between rounded-xl border px-3.5 py-3 active:opacity-90"
                        style={{
                          borderColor: colors.borderLight,
                          backgroundColor: colors.surfaceAlt,
                          opacity: uri ? 1 : 0.7,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Play ${label}`}
                        accessibilityState={{ disabled: !uri }}
                      >
                        <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                          {label}
                        </Text>
                        <View className="flex-row items-center gap-2">
                          {!canPlay ? (
                            <Text className="text-xs font-semibold" style={{ color: colors.textMuted }}>
                              Pending sync
                            </Text>
                          ) : null}
                          <Ionicons
                            name={playingIndex === i ? "pause-circle" : "play-circle"}
                            size={20}
                            color={canPlay ? colors.primary : colors.textMuted}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {audioHint ? (
                <Text className="mt-2 text-xs leading-5 sm:text-sm" style={{ color: colors.textMuted }}>
                  {audioHint}
                </Text>
              ) : null}
            </AccordionRow>

            <AccordionRow
              label={iotMode ? SPUTUM_SMEAR_REVIEW_LABEL_IOT : SPUTUM_SMEAR_REVIEW_LABEL}
              done={imageDone}
              pendingLabel={imageDone ? undefined : sputumSkipReason || SPUTUM_NO_SAMPLE_PILL}
              open={imageOpen}
              onToggle={() => setImageOpen((v) => !v)}
            >
              {imageUri ? (
                <View
                  className="h-52 overflow-hidden rounded-2xl border sm:h-56 md:h-60"
                  style={{ borderColor: colors.cardBorder, backgroundColor: colors.surface }}
                >
                  <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                </View>
              ) : (
                <Text className="text-xs leading-5 sm:text-sm" style={{ color: colors.textSecondary }}>
                  {formatSputumMissingDetail(sputumSkipReason)}
                </Text>
              )}
            </AccordionRow>
          </View>

          <View className="mt-4 flex-row gap-3">
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: "/screening/iot-cough",
                  params: { checklist, iotMode: "1", ...sessionNavParams },
                } as any)
              }
              className="flex-1 items-center justify-center rounded-2xl border py-3.5 active:opacity-90 sm:py-4"
              style={{ borderColor: colors.borderLight, backgroundColor: colors.surfaceAlt }}
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold sm:text-base" style={{ color: colors.text }}>
                Re-record
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: deviceSputumFlow || iotMode ? "/screening/iot-sputum" : "/screening/phlegm",
                  params: {
                    audioDone: audioDone ? "1" : "0",
                    audioUris,
                    iotRecordingIds,
                    checklist,
                    ...(iotMode ? { iotMode: "1" } : {}),
                    ...sessionNavParams,
                    ...(deviceSputumFlow ? { deviceSputum: "1" } : {}),
                  },
                } as any)
              }
              className="flex-1 items-center justify-center rounded-2xl border py-3.5 active:opacity-90 sm:py-4"
              style={{ borderColor: colors.borderLight, backgroundColor: colors.surfaceAlt }}
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold sm:text-base" style={{ color: colors.text }}>
                {imageDone ? (deviceSputumFlow || iotMode ? "Re-capture smear" : "Change smear photo") : "Capture smear"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View className="px-4 pb-6 pt-3 sm:px-5 sm:pb-8 md:px-6">
        <Pressable
          onPress={() => {
            router.push({
              pathname: "/screening/processing",
              params: {
                audioDone: audioDone ? "1" : "0",
                audioUris,
                iotRecordingIds,
                imageUri: imageUri ?? "",
                checklist,
                ...(iotMode ? { iotMode: "1" } : {}),
                ...sessionNavParams,
                ...deviceSputumNavParams,
                ...sputumSkipNavParams,
              },
            } as any);
          }}
          disabled={!canAnalyze}
          className="w-full rounded-2xl"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAnalyze }}
        >
          {({ pressed }) => (
            <View
              className="items-center justify-center rounded-2xl py-3.5 sm:py-4"
              style={{
                backgroundColor: canAnalyze
                  ? pressed
                    ? isDark
                      ? "#3A4A8A"
                      : "#1A3478"
                    : isDark
                      ? "#4458A6"
                      : colors.primary
                  : colors.surfaceAlt,
                borderWidth: 1,
                borderColor: canAnalyze ? (isDark ? "rgba(183,198,255,0.5)" : "rgba(61,78,166,0.28)") : colors.borderLight,
              }}
            >
              <Text className="text-sm font-bold sm:text-base" style={{ color: canAnalyze ? "#fff" : colors.textMuted }}>
                {canAnalyze ? "Analyze" : "Record coughs to analyze"}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
    </>
  );
}
