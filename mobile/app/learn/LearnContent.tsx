import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type Stat = {
  value: string;
  label: string;
  color: string;
};

type Tag = {
  label: string;
  backgroundColor: string;
  color: string;
};

type Symptom = {
  name: string;
  note: string;
  dotColor: string;
};

type Step = {
  number: string;
  title: string;
  description: string;
  backgroundColor: string;
};

const overviewStats: Stat[] = [
  { value: "1.3M", label: "Deaths globally per year", color: "#E53935" },
  { value: "10M", label: "People fall ill yearly", color: "#E67E22" },
  { value: "85%", label: "Cure rate with treatment", color: "#1E8449" },
];

const spreadTags: Tag[] = [
  { label: "Airborne", backgroundColor: "#E6F3FB", color: "#1D6FA4" },
  { label: "Close contact", backgroundColor: "#FEF5E7", color: "#E67E22" },
  { label: "Coughing / sneezing", backgroundColor: "#FDEDEC", color: "#C0392B" },
  { label: "Talking", backgroundColor: "#E6F3FB", color: "#1D6FA4" },
  { label: "Singing", backgroundColor: "#E6F3FB", color: "#1D6FA4" },
];

const riskTags: Tag[] = [
  { label: "HIV positive", backgroundColor: "#FDEDEC", color: "#C0392B" },
  { label: "Malnutrition", backgroundColor: "#FDEDEC", color: "#C0392B" },
  { label: "Diabetes", backgroundColor: "#FEF5E7", color: "#E67E22" },
  { label: "Smokers", backgroundColor: "#FEF5E7", color: "#E67E22" },
  { label: "Overcrowded spaces", backgroundColor: "#FEF5E7", color: "#E67E22" },
  { label: "Healthcare workers", backgroundColor: "#E6F3FB", color: "#1D6FA4" },
  { label: "Elderly & children", backgroundColor: "#E6F3FB", color: "#1D6FA4" },
];

const symptoms: Symptom[] = [
  { name: "Persistent cough", note: "3+ weeks", dotColor: "#C0392B" },
  { name: "Coughing up blood", note: "Seek help now", dotColor: "#E67E22" },
  { name: "Night sweats", note: "Recurring", dotColor: "#E67E22" },
  { name: "Unexplained weight loss", note: "Rapid drop", dotColor: "#1D6FA4" },
  { name: "Fatigue & weakness", note: "Prolonged", dotColor: "#1D6FA4" },
  { name: "Fever & chills", note: "Low-grade", dotColor: "#1D6FA4" },
  { name: "Chest pain", note: "When breathing", dotColor: "#1D6FA4" },
];

const steps: Step[] = [
  {
    number: "1",
    title: "See a doctor immediately",
    description:
      "Do not wait. Visit a health center for a proper evaluation if you have a cough lasting 3+ weeks.",
    backgroundColor: "#1D6FA4",
  },
  {
    number: "2",
    title: "Get tested",
    description: "A sputum test, chest X-ray, or skin test can confirm or rule out TB.",
    backgroundColor: "#E67E22",
  },
  {
    number: "3",
    title: "Take medications as prescribed",
    description: "TB treatment takes 6–9 months. Stopping early can lead to drug-resistant TB.",
    backgroundColor: "#1E8449",
  },
  {
    number: "4",
    title: "Isolate while contagious",
    description: "Stay home, use masks, and avoid crowded places in the early weeks of treatment.",
    backgroundColor: "#0a1428",
  },
  {
    number: "5",
    title: "Notify close contacts",
    description: "People who live with you or spend long hours nearby should also get tested.",
    backgroundColor: "#C0392B",
  },
];

const prevention: Step[] = [
  {
    number: "💉",
    title: "BCG vaccine",
    description: "Given at birth, it helps protect infants from severe forms of TB.",
    backgroundColor: "#1D6FA4",
  },
  {
    number: "😷",
    title: "Wear masks in crowded areas",
    description: "N95 or surgical masks reduce airborne transmission risk significantly.",
    backgroundColor: "#1D6FA4",
  },
  {
    number: "🌬️",
    title: "Ensure good ventilation",
    description: "Open windows and use fans to reduce TB bacteria concentration indoors.",
    backgroundColor: "#1D6FA4",
  },
  {
    number: "🥗",
    title: "Support your immune system",
    description: "Eat nutritious food, sleep well, and avoid smoking to stay strong.",
    backgroundColor: "#1D6FA4",
  },
];

const learnCardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 4,
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="-mb-1 text-sm font-bold uppercase tracking-widest text-[#8FA3B1]">
      {children}
    </Text>
  );
}

function InfoCard({
  icon,
  iconBackground,
  title,
  subtitle,
  children,
}: {
  icon: string;
  iconBackground: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View className="rounded-3xl border border-[#efefef] bg-white p-5" style={learnCardShadow}>
      <View className="mb-4 flex-row items-center gap-2.5">
        <View
          className="h-10 w-10 items-center justify-center rounded-3xl"
          style={{ backgroundColor: iconBackground }}
        >
          <Text className="text-lg">{icon}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-[#111111]">{title}</Text>
          <Text className="mt-0.5 text-sm text-[#8FA3B1]">{subtitle}</Text>
        </View>
      </View>
      <View className="mb-4 h-px bg-[#efefef]" />
      {children}
    </View>
  );
}

function TagPill({ label, backgroundColor, color }: Tag) {
  return (
    <View
      className="rounded-full py-1.5 px-3"
      style={{ backgroundColor }}
    >
      <Text className="text-sm font-semibold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function BulletStat({ value, label, color }: Stat) {
  return (
    <View className="flex-1 items-center rounded-xl bg-[#f8f8f8] px-2.5 py-3.5">
      <Text className="text-2xl font-extrabold" style={{ color }}>
        {value}
      </Text>
      <Text className="mt-1 text-center text-xs leading-4 text-[#8FA3B1]">
        {label}
      </Text>
    </View>
  );
}

function StepRow({ number, title, description, backgroundColor }: Step) {
  return (
    <View className="flex-row items-start gap-3">
      <View
        className="mt-0.5 size-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor }}
      >
        <Text className="text-sm font-extrabold text-white">{number}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-[#111111]">{title}</Text>
        <Text className="mt-0.5 text-sm leading-5 text-justify text-[#5D6D7E]">{description}</Text>
      </View>
    </View>
  );
}

function AlertBanner({
  tone,
  icon,
  title,
  description,
}: {
  tone: "warn" | "danger" | "green";
  icon: string;
  title: string;
  description: string;
}) {
  const colors = {
    warn: { backgroundColor: "#FEF5E7", borderColor: "#E67E22", textColor: "#7D4E00" },
    danger: { backgroundColor: "#FDEDEC", borderColor: "#C0392B", textColor: "#7B241C" },
    green: { backgroundColor: "#E9F7EF", borderColor: "#1E8449", textColor: "#1A6035" },
  }[tone];

  return (
    <View
      className="flex-row items-start gap-2.5 rounded-xl border-l-4 p-4"
      style={{
        backgroundColor: colors.backgroundColor,
        borderLeftColor: colors.borderColor,
      }}
    >
      <Text className="mt-px text-base">{icon}</Text>
      <View className="flex-1">
        <Text className="mb-0.5 text-base font-bold" style={{ color: colors.textColor }}>
          {title}
        </Text>
        <Text className="text-sm leading-5 text-justify" style={{ color: colors.textColor }}>
          {description}
        </Text>
      </View>
    </View>
  );
}

export function LearnContent() {
  const router = useRouter();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: "2%" }}
    >
      <View className="px-5 pb-3 pt-3">
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="mb-1 text-base text-[#666]">📚 Learn</Text>
            <Text className="text-3xl font-extrabold text-black">Tuberculosis (TB)</Text>
          </View>
          <View className="size-16 items-center justify-center rounded-full bg-[#d8d8d8]">
            <Text className="text-2xl">🫁</Text>
          </View>
        </View>

        <View
          className="flex-row items-center gap-3.5 rounded-3xl border border-[#efefef] bg-white p-5"
          style={learnCardShadow}
        >
          <View className="size-14 shrink-0 items-center justify-center rounded-3xl bg-[#E6F3FB]">
            <Ionicons name="medkit-outline" size={26} color="#1D6FA4" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-extrabold leading-6 text-[#111111]">
              A curable bacterial infection - understand it, prevent it, and act early.
            </Text>
            <Text className="mt-1 text-sm leading-5 text-justify text-[#5D6D7E]">
              Keep the same clean card styling used throughout the home screen while learning the
              essentials.
            </Text>
          </View>
        </View>
      </View>

      <View className="gap-4 px-5">
        <SectionLabel>Overview</SectionLabel>
        <InfoCard icon="🔬" iconBackground="#E6F3FB" title="What is Tuberculosis?" subtitle="Basic definition">
          <Text className="mb-4 text-base leading-5 text-justify text-[#5D6D7E]">
            TB is a contagious disease caused by the bacterium{" "}
            <Text className="font-bold text-[#111111]">Mycobacterium tuberculosis</Text>. It mainly
            affects the lungs, but it can spread to other organs including the kidneys, spine, and
            brain.
          </Text>
          <View className="flex-row gap-2">
            {overviewStats.map((item) => (
              <BulletStat key={item.label} {...item} />
            ))}
          </View>
        </InfoCard>

        <SectionLabel>Causes</SectionLabel>
        <InfoCard icon="💨" iconBackground="#FEF5E7" title="How TB Spreads" subtitle="Transmission routes">
          <View className="mb-4 flex-row flex-wrap gap-2">
            {spreadTags.map((tag) => (
              <TagPill key={tag.label} {...tag} />
            ))}
          </View>
          <AlertBanner
            tone="warn"
            icon="⚠️"
            title="Not spread by touch"
            description="TB is not transmitted through handshakes, sharing food, kissing, or touching surfaces. It spreads only through the air."
          />
        </InfoCard>

        <InfoCard icon="⚡" iconBackground="#FDEDEC" title="Who is at Higher Risk?" subtitle="Vulnerability factors">
          <View className="flex-row flex-wrap gap-2">
            {riskTags.map((tag) => (
              <TagPill key={tag.label} {...tag} />
            ))}
          </View>
        </InfoCard>

        <SectionLabel>Symptoms</SectionLabel>
        <InfoCard icon="🩺" iconBackground="#FDEDEC" title="Signs & Symptoms" subtitle="Watch for these warning signs">
          <View className="gap-2">
            {symptoms.map((symptom) => (
              <View
                key={symptom.name}
                className="flex-row items-center gap-2.5 rounded-xl bg-[#f8f8f8] px-3 py-2.5"
              >
                <View
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: symptom.dotColor }}
                />
                <Text className="flex-1 text-base font-semibold text-[#111111]">
                  {symptom.name}
                </Text>
                <Text className="text-sm text-[#8FA3B1]">{symptom.note}</Text>
              </View>
            ))}
          </View>
        </InfoCard>

        <InfoCard icon="🔄" iconBackground="#E9F7EF" title="Latent vs Active TB" subtitle="Two very different states">
          <View className="flex-row gap-2">
            <View className="flex-1 rounded-xl bg-[#E9F7EF] p-4">
              <Text className="mb-1.5 text-sm font-bold text-[#1E8449]">Latent TB</Text>
              <Text className="text-sm leading-5 text-justify text-[#1A6035]">
                • No symptoms{"\n"}• Not contagious{"\n"}• Bacteria inactive{"\n"}• Can become
                active
              </Text>
            </View>
            <View className="flex-1 rounded-xl bg-[#FDEDEC] p-4">
              <Text className="mb-1.5 text-sm font-bold text-[#C0392B]">Active TB</Text>
              <Text className="text-sm leading-5 text-justify text-[#7B241C]">
                • Symptoms present{"\n"}• Contagious to others{"\n"}• Bacteria active{"\n"}•
                Requires treatment
              </Text>
            </View>
          </View>
        </InfoCard>

        <SectionLabel>What To Do</SectionLabel>
        <InfoCard icon="✅" iconBackground="#E9F7EF" title="Steps to Take" subtitle="If you suspect TB">
          <View className="gap-3">
            {steps.map((step) => (
              <StepRow key={step.title} {...step} />
            ))}
          </View>
        </InfoCard>

        <SectionLabel>Prevention</SectionLabel>
        <InfoCard icon="🛡️" iconBackground="#E9F7EF" title="How to Prevent TB" subtitle="Protect yourself and others">
          <View className="gap-3">
            {prevention.map((item) => (
              <StepRow key={item.title} {...item} />
            ))}
          </View>
        </InfoCard>

        <AlertBanner
          tone="danger"
          icon="🚨"
          title="Seek emergency care if..."
          description="You cough up blood, experience severe chest pain, or have difficulty breathing. These are signs of advanced TB requiring urgent medical attention."
        />

        <AlertBanner
          tone="green"
          icon="💚"
          title="Good news - TB is curable!"
          description="With complete and consistent treatment, the vast majority of people fully recover from TB."
        />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push("/screening/recording")}
          className="mb-4 mt-2 flex-row items-center justify-between rounded-2xl bg-[#0a1428] px-5 py-4"
        >
          <View>
            <Text className="text-base font-bold text-white">Find a TB Testing Center</Text>
            <Text className="mt-0.5 text-sm text-white/70">Locate the nearest health facility</Text>
          </View>
          <View className="size-9 items-center justify-center rounded-full bg-white/20">
            <Text className="text-base text-white">→</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
