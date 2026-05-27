import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { SCREENING_CHECKLIST_QUESTIONS } from "../../constants/screeningChecklist";

type Answer = "yes" | "no";

const QUESTIONS = SCREENING_CHECKLIST_QUESTIONS;

const TOTAL = QUESTIONS.length;

function symptomSummary(answers: Record<string, Answer>): {
  yesCount: number;
  level: "low" | "moderate" | "high";
  headline: string;
  body: string;
} {
  const yesCount = QUESTIONS.filter((q) => answers[q.id] === "yes").length;
  const symptomYes = QUESTIONS.filter((q) => q.category === "symptom" && answers[q.id] === "yes").length;
  const riskYes = QUESTIONS.filter((q) => q.category === "risk" && answers[q.id] === "yes").length;

  let level: "low" | "moderate" | "high";
  let headline: string;
  let body: string;

  if (symptomYes >= 3 || (symptomYes >= 2 && riskYes >= 1)) {
    level = "high";
    headline = "Several TB-related symptoms reported";
    body =
      "Your answers indicate multiple symptoms that are commonly associated with TB. We strongly encourage you to consult a healthcare professional for proper testing — especially after completing the cough recording.";
  } else if (symptomYes >= 1 || riskYes >= 2) {
    level = "moderate";
    headline = "Some risk factors or symptoms noted";
    body =
      "You reported one or more symptoms or risk factors linked to TB. Please complete the cough recording and consider speaking with a healthcare provider.";
  } else {
    level = "low";
    headline = "No major symptoms reported";
    body =
      "You did not report significant TB symptoms at this time. The cough recording will help provide additional insight. Continue monitoring your health.";
  }

  return { yesCount, level, headline, body };
}

const LEVEL_COLOR: Record<"low" | "moderate" | "high", string> = {
  low: "#16A34A",
  moderate: "#D97706",
  high: "#DC2626",
};
const LEVEL_BG: Record<"low" | "moderate" | "high", string> = {
  low: "#F0FDF4",
  moderate: "#FFFBEB",
  high: "#FEF2F2",
};
const LEVEL_BORDER: Record<"low" | "moderate" | "high", string> = {
  low: "#BBF7D0",
  moderate: "#FCD34D",
  high: "#FECACA",
};
const LEVEL_LABEL: Record<"low" | "moderate" | "high", string> = {
  low: "Low concern",
  moderate: "Moderate concern",
  high: "High concern",
};

export default function ScreeningChecklistScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  // selection for the current question only — null means nothing picked yet
  const [selected, setSelected] = useState<Answer | null>(null);

  const isDone = step >= TOTAL;
  const current = isDone ? null : QUESTIONS[step];

  const goNext = () => {
    if (!current || selected === null) return;
    setAnswers((prev) => ({ ...prev, [current.id]: selected }));
    setSelected(null);
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setSelected(null);
    if (step === 0) {
      router.back();
      return;
    }
    // restore the previous answer as the initial selection
    const prevQ = QUESTIONS[step - 1];
    setStep((s) => s - 1);
    setSelected(answers[prevQ.id] ?? null);
  };

  const payloadJson = useMemo(() => {
    const items = QUESTIONS.map((q) => ({
      id: q.id,
      label: q.question,
      value: answers[q.id] === "yes",
    }));
    return JSON.stringify({ version: 2, items });
  }, [answers]);

  const summary = useMemo(() => {
    if (!isDone) return null;
    return symptomSummary(answers);
  }, [isDone, answers]);

  const progressPct = Math.min(100, Math.round((step / TOTAL) * 100));

  return (
    <>
      <StatusBar style="dark" backgroundColor="#fff" translucent={false} />
      <SafeAreaView className="flex-1 bg-lavender" edges={["top", "right", "bottom", "left"]}>
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-neutral-100 px-4 pb-3.5 pt-2 sm:px-5">
          <Pressable
            onPress={goBack}
            className="size-11 items-center justify-center rounded-full bg-navy/5 active:bg-navy/10"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color="#0f172a" />
          </Pressable>

          <View className="min-w-0 flex-1 items-center px-2">
            <Text className="text-center text-sm font-bold text-slate-900 sm:text-base">
              {isDone ? "Your responses" : "Symptom check"}
            </Text>
            <Text className="mt-0.5 text-center text-xs font-semibold text-slate-500 sm:text-sm">
              {isDone ? "Review before continuing" : `Question ${step + 1} of ${TOTAL}`}
            </Text>
          </View>

          <View className="size-11" />
        </View>

        {/* Progress bar */}
        {!isDone && (
          <View className="h-1.5 w-full bg-slate-100">
            <View className="h-1.5 rounded-full bg-navy" style={{ width: `${progressPct}%` }} />
          </View>
        )}

        {/* Question */}
        {!isDone && current ? (
          <View className="flex-1 px-6 pb-8 pt-10 sm:px-8">
            {/* Category pill */}
            <View className="mb-6 self-start rounded-full bg-navy/5 px-4 py-1.5">
              <Text className="text-xs font-bold uppercase tracking-wider text-navy/70">
                {current.category === "symptom" ? "Symptom" : "Exposure Risk"}
              </Text>
            </View>

            <Text className="text-xl font-bold leading-8 text-slate-900 sm:text-2xl sm:leading-[2.35rem]">
              {current.question}
            </Text>

            {current.subtext ? (
              <Text className="mt-4 text-[15px] leading-7 text-slate-500 sm:text-base sm:leading-8">
                {current.subtext}
              </Text>
            ) : null}

            {/* Yes / No choice — tap to select, tap again to deselect */}
            <View className="mt-12 gap-4">
              {/* YES */}
              <Pressable
                onPress={() => setSelected((s) => (s === "yes" ? null : "yes"))}
                className="flex-row items-center gap-5 rounded-2xl border px-6 py-5 active:opacity-80 sm:py-[22px]"
                style={{
                  backgroundColor: selected === "yes" ? "#0B1530" : "#F8FAFC",
                  borderColor: selected === "yes" ? "#0B1530" : "#E2E8F0",
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected === "yes" }}
                accessibilityLabel="Yes"
              >
                <View
                  className="size-9 items-center justify-center rounded-full border-2"
                  style={{
                    backgroundColor: selected === "yes" ? "#fff" : "transparent",
                    borderColor: selected === "yes" ? "#fff" : "#CBD5E1",
                  }}
                >
                  {selected === "yes" && <Ionicons name="checkmark" size={18} color="#0B1530" />}
                </View>
                <Text
                  className="text-base font-bold"
                  style={{ color: selected === "yes" ? "#fff" : "#0f172a" }}
                >
                  Yes
                </Text>
              </Pressable>

              {/* NO */}
              <Pressable
                onPress={() => setSelected((s) => (s === "no" ? null : "no"))}
                className="flex-row items-center gap-5 rounded-2xl border px-6 py-5 active:opacity-80 sm:py-[22px]"
                style={{
                  backgroundColor: selected === "no" ? "#0B1530" : "#F8FAFC",
                  borderColor: selected === "no" ? "#0B1530" : "#E2E8F0",
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected === "no" }}
                accessibilityLabel="No"
              >
                <View
                  className="size-9 items-center justify-center rounded-full border-2"
                  style={{
                    backgroundColor: selected === "no" ? "#fff" : "transparent",
                    borderColor: selected === "no" ? "#fff" : "#CBD5E1",
                  }}
                >
                  {selected === "no" && <Ionicons name="close" size={18} color="#0B1530" />}
                </View>
                <Text
                  className="text-base font-bold"
                  style={{ color: selected === "no" ? "#fff" : "#0f172a" }}
                >
                  No
                </Text>
              </Pressable>
            </View>

            {/* Next button — sits right below No */}
            <Pressable
              onPress={goNext}
              disabled={selected === null}
              className="mt-10 items-center justify-center rounded-2xl py-[18px] sm:py-5"
              style={{ backgroundColor: selected === null ? "#E2E8F0" : "#0B1530" }}
              accessibilityRole="button"
              accessibilityLabel="Next question"
              accessibilityState={{ disabled: selected === null }}
            >
              <Text
                className="text-base font-bold"
                style={{ color: selected === null ? "#94A3B8" : "#fff" }}
              >
                {selected === null ? "Select an answer to continue" : "Next →"}
              </Text>
            </Pressable>

            <Text className="mt-8 px-1 text-center text-xs italic leading-5 text-slate-400">
              Your answers are not a diagnosis. They help give context to the cough analysis.
            </Text>
          </View>
        ) : null}

        {/* Summary screen */}
        {isDone && summary ? (
          <ScrollView
            className="flex-1 px-6 pt-8 sm:px-8"
            contentContainerStyle={{ paddingBottom: 28 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Level card */}
            <View
              className="mb-6 rounded-2xl border p-6 sm:p-7"
              style={{
                backgroundColor: LEVEL_BG[summary.level],
                borderColor: LEVEL_BORDER[summary.level],
              }}
            >
              <View className="mb-2 flex-row items-center gap-2">
                <Ionicons
                  name={
                    summary.level === "high"
                      ? "warning"
                      : summary.level === "moderate"
                        ? "alert-circle"
                        : "checkmark-circle"
                  }
                  size={20}
                  color={LEVEL_COLOR[summary.level]}
                />
                <Text className="text-sm font-bold" style={{ color: LEVEL_COLOR[summary.level] }}>
                  {LEVEL_LABEL[summary.level]}
                </Text>
              </View>
              <Text className="text-base font-bold text-slate-900">{summary.headline}</Text>
              <Text className="mt-3 text-[15px] leading-7 text-slate-700">{summary.body}</Text>
            </View>

            {/* Answered yes list */}
            {summary.yesCount > 0 ? (
              <View className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-5 sm:px-6">
                <Text className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  You answered Yes to
                </Text>
                {QUESTIONS.filter((q) => answers[q.id] === "yes").map((q) => (
                  <View key={q.id} className="mb-4 flex-row items-start gap-3 last:mb-0">
                    <Ionicons name="ellipse" size={7} color="#0B1530" style={{ marginTop: 9 }} />
                    <Text className="flex-1 text-[15px] leading-7 text-slate-800">{q.question}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text className="text-center text-xs italic leading-5 text-slate-400">
              This is not a medical diagnosis. Continue to cough recording for the full screening.
            </Text>
          </ScrollView>
        ) : null}

        {/* Bottom CTA — only on summary */}
        {isDone ? (
          <View className="border-t border-slate-100 px-6 pb-8 pt-5 sm:px-8 sm:pb-10 sm:pt-6">
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/screening/recording",
                  params: { checklist: payloadJson },
                } as any)
              }
              className="items-center justify-center rounded-2xl bg-navy py-[18px] active:bg-navy/90 sm:py-5"
              accessibilityRole="button"
            >
              <Text className="text-base font-bold text-white">Continue to cough recording</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </>
  );
}
