import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

export default function ReviewInputsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ audioDone?: string; audioUris?: string; imageUri?: string; checklist?: string }>();

  const audioDone = params.audioDone === "1";
  const imageDone = typeof params.imageUri === "string" && params.imageUri.length > 0;
  const imageUri = imageDone ? (params.imageUri as string) : null;
  const audioUris = typeof params.audioUris === "string" ? params.audioUris : "[]";
  const checklist = typeof params.checklist === "string" ? params.checklist : "";

  const [audioOpen, setAudioOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const canAnalyze = audioDone;

  const StatusPill = ({ done, optional }: { done: boolean; optional?: boolean }) => (
    <View className="flex-row items-center gap-2">
      {optional && !done ? (
        <>
          <Text className="text-xs font-bold text-slate-500 sm:text-sm">Optional</Text>
          <Ionicons name="remove-circle-outline" size={18} color="#94A3B8" />
        </>
      ) : (
        <>
          <Text
            className={`text-xs font-bold sm:text-sm ${done ? "text-emerald-600" : "text-amber-600"}`}
          >
            {done ? "✓" : "—"}
          </Text>
          <Ionicons name={done ? "checkmark-circle" : "alert-circle"} size={18} color={done ? "#10B981" : "#F59E0B"} />
        </>
      )}
    </View>
  );

  const AccordionRow = ({
    label,
    done,
    optional,
    open,
    onToggle,
    children,
  }: {
    label: string;
    done: boolean;
    optional?: boolean;
    open: boolean;
    onToggle: () => void;
    children?: ReactNode;
  }) => (
    <View className="border-b border-neutral-100 last:border-b-0">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between py-3.5 active:opacity-90 sm:py-4"
        accessibilityRole="button"
      >
        <View className="flex-row items-center gap-2.5">
          <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={18} color="#0f172a" />
          <Text className="text-sm font-bold text-slate-900 sm:text-base">{label}</Text>
        </View>
        <StatusPill done={done} optional={optional} />
      </Pressable>

      {open ? <View className="pb-3.5 pt-0 sm:pb-4">{children}</View> : null}
    </View>
  );

  return (
    <>
      <StatusBar style="dark" backgroundColor="#EAE8FA" translucent={false} />
      <SafeAreaView className="flex-1 bg-lavender" edges={["top", "right", "bottom", "left"]}>
      <View className="flex-row items-center justify-between border-b border-neutral-100 px-4 pb-3.5 pt-2 sm:px-5 md:px-6">
        <Pressable
          onPress={() => router.back()}
          className="size-11 items-center justify-center rounded-full bg-navy/5 active:bg-navy/10"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#0f172a" />
        </Pressable>

        <View className="min-w-0 flex-1 items-center px-2">
          <Text
            className="text-center text-sm font-bold text-slate-900 sm:text-base"
            numberOfLines={2}
          >
            Review inputs
          </Text>
          <Text className="mt-0.5 text-center text-xs font-semibold text-slate-500 sm:text-sm">
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
          <View className="overflow-hidden rounded-2xl border border-neutral-200 bg-white px-4 shadow-sm">
            <AccordionRow
              label="Recorded audio"
              done={audioDone}
              open={audioOpen}
              onToggle={() => setAudioOpen((v) => !v)}
            >
              <Text className="text-xs leading-5 text-slate-600 sm:text-sm">
                {audioDone
                  ? "Audio recorded (3 coughs). Playback will appear once we wire real audio file recording."
                  : "No audio recorded yet."}
              </Text>
            </AccordionRow>

            <AccordionRow
              label="Sputum / phlegm photo (optional)"
              done={imageDone}
              optional
              open={imageOpen}
              onToggle={() => setImageOpen((v) => !v)}
            >
              {imageUri ? (
                <View className="h-52 overflow-hidden rounded-2xl border border-neutral-200 bg-white sm:h-56 md:h-60">
                  <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                </View>
              ) : (
                <Text className="text-xs leading-5 text-slate-600 sm:text-sm">
                  No sample provided. Analysis will use your cough recordings (and checklist) only.
                </Text>
              )}
            </AccordionRow>
          </View>

          <View className="mt-4 flex-row gap-3">
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: "/screening/recording",
                  params: { checklist },
                } as any)
              }
              className="flex-1 items-center justify-center rounded-2xl border border-navy/10 bg-navy/5 py-3.5 active:bg-navy/10 sm:py-4"
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold text-navy sm:text-base">Re-record</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: "/screening/phlegm",
                  params: { audioDone: audioDone ? "1" : "0", audioUris, checklist },
                } as any)
              }
              className="flex-1 items-center justify-center rounded-2xl border border-navy/10 bg-navy/5 py-3.5 active:bg-navy/10 sm:py-4"
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold text-navy sm:text-base">
                {imageDone ? "Change photo" : "Add sample"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View className="px-4 pt-3 pb-6 sm:px-5 sm:pb-8 md:px-6">
        <Pressable
          onPress={() => {
            router.push({
              pathname: "/screening/processing",
                params: { audioDone: audioDone ? "1" : "0", audioUris, imageUri: imageUri ?? "", checklist },
            } as any);
          }}
          disabled={!canAnalyze}
          className={`items-center justify-center rounded-2xl py-3.5 sm:py-4 ${
            canAnalyze ? "bg-navy active:bg-navy/95" : "bg-neutral-200"
          }`}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAnalyze }}
        >
          <Text
            className={`text-sm font-bold sm:text-base ${canAnalyze ? "text-white" : "text-neutral-400"}`}
          >
            {canAnalyze ? "Analyze" : "Record coughs to analyze"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
    </>
  );
}
