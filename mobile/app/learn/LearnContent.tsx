import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, darkComponent, type ThemeColors } from "../../contexts/ThemeContext";
import {
  PATIENT_LEARN_HERO_SUBTITLE,
  STAFF_LEARN_COUNSELING_BANNER,
  STAFF_LEARN_HERO_SUBTITLE,
} from "../../constants/patientAccess";

type LearnContentProps = {
  mode?: "patient" | "operator";
};

type SectionId = "overviewSymptoms" | "causesRiskPrevention" | "actionSeekHelp";

type Stat = {
  value: string;
  label: string;
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
  { value: "1.3M", label: "Deaths / year" },
  { value: "10M", label: "Ill / year" },
  { value: "85%", label: "Cure rate" },
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
    backgroundColor: darkComponent.accent,
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

type SourceItem = {
  label: string;
  url: string;
};

const trustedSources: SourceItem[] = [
  { label: "World Health Organization (WHO) - Tuberculosis", url: "https://www.who.int/health-topics/tuberculosis" },
  { label: "U.S. CDC - Tuberculosis (TB)", url: "https://www.cdc.gov/tb/" },
  { label: "European CDC - Tuberculosis", url: "https://www.ecdc.europa.eu/en/tuberculosis" },
  {
    label: "Philippine DOH - National Tuberculosis Control Program",
    url: "https://doh.gov.ph/national-tuberculosis-control-program",
  },
];

function TagPill({ label, backgroundColor, color }: Tag) {
  return (
    <View
      className="rounded-full py-1.5 px-3"
      style={{ backgroundColor }}
    >
      <Text className="text-xs font-semibold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function BulletStat({ value, label, isDark, colors }: Stat & { isDark: boolean; colors: ThemeColors }) {
  return (
    <View className="flex-1 items-center rounded-xl px-2.5 py-3.5" style={{ backgroundColor: isDark ? colors.surfaceAlt : "#EAE8FA" }}>
      <Text className="text-2xl font-extrabold" style={{ color: isDark ? colors.text : "#0C1E4A" }}>
        {value}
      </Text>
      <Text className="mt-1 text-center text-xs leading-4" style={{ color: isDark ? colors.textSecondary : "#3D4EA6" }}>
        {label}
      </Text>
    </View>
  );
}

function StepRow({ number, title, description, backgroundColor, isDark, colors }: Step & { isDark: boolean; colors: ThemeColors }) {
  return (
    <View
      className="flex-row items-start gap-3 rounded-xl border p-3.5"
      style={{ borderColor: isDark ? colors.border : "#EAE8FA", backgroundColor: isDark ? colors.surface : "#FFFFFF" }}
    >
      <View
        className="mt-0.5 size-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor }}
      >
        <Text className="text-sm font-extrabold text-white">{number}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold" style={{ color: isDark ? colors.text : "#111111" }}>{title}</Text>
        <Text className="mt-0.5 text-sm leading-5 text-justify" style={{ color: isDark ? colors.textSecondary : "#5D6D7E" }}>{description}</Text>
      </View>
    </View>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      className="rounded-2xl border p-5"
      style={[learnCardShadow, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
    >
      <View className="mb-4 flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: isDark ? colors.surfaceAlt : "#EAE8FA" }}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold" style={{ color: colors.text }}>{title}</Text>
          <Text className="text-xs" style={{ color: colors.textMuted }}>{subtitle}</Text>
        </View>
      </View>
      <View className="flex-1">
        {children}
      </View>
    </View>
  );
}

function TrustedSourcesBlock() {
  const { colors, isDark } = useTheme();
  const openSource = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <View className="mb-3 rounded-2xl border p-4" style={[learnCardShadow, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
      <View className="mb-2.5 flex-row items-center gap-2">
        <Ionicons name="library-outline" size={18} color={colors.primary} />
        <Text className="text-base font-extrabold" style={{ color: colors.text }}>Trusted References</Text>
      </View>
      <Text className="mb-3 text-sm leading-6" style={{ color: colors.textSecondary }}>
        Information in this section is based on globally recognized health authorities.
      </Text>
      <View className="gap-2">
        {trustedSources.map((source) => (
          <TouchableOpacity key={source.url} onPress={() => openSource(source.url)} activeOpacity={0.75}>
            <View className="flex-row items-center justify-between rounded-lg px-3.5 py-3" style={{ backgroundColor: isDark ? colors.surfaceAlt : "#F8FAFF" }}>
              <Text className="mr-3 flex-1 text-sm font-semibold leading-5" style={{ color: isDark ? colors.textSecondary : colors.primary }}>
                {source.label}
              </Text>
              <Ionicons name="open-outline" size={18} color={isDark ? colors.textSecondary : colors.primary} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function LearnContent({ mode = "patient" }: LearnContentProps) {
  const isOperator = mode === "operator";
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const tbSearchUrl = "https://www.google.com/search?q=TB+testing+center+near+me";
  const [openAccordion, setOpenAccordion] = useState<SectionId | null>("overviewSymptoms");

  const sections = useMemo(
    () =>
      [
        {
          id: "overviewSymptoms",
          label: "Overview + Symptoms",
          icon: "information-circle-outline",
        },
        {
          id: "causesRiskPrevention",
          label: "Causes + Risk + Prevention",
          icon: "cloud-outline",
        },
        {
          id: "actionSeekHelp",
          label: "Action + Seek Help",
          icon: "medkit-outline",
        },
      ] satisfies Array<{ id: SectionId; label: string; icon: keyof typeof Ionicons.glyphMap }>,
    [],
  );

  const handleOpenTestingCenters = () => {
    Alert.alert(
      "Open Browser?",
      "You are about to leave the app and open your phone's browser to search for nearby TB testing centers.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            void Linking.openURL(tbSearchUrl);
          },
        },
      ],
    );
  };

  const handleOpenMoreArticles = () => {
    Alert.alert(
      "Search More Articles?",
      "You are about to leave the app and open your browser to search for more TB-related articles.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            void Linking.openURL(
              "https://www.google.com/search?q=tuberculosis+articles+WHO+CDC+DOH",
            );
          },
        },
      ],
    );
  };

  const renderSection = (section: SectionId) => {
    if (section === "overviewSymptoms") {
      return (
        <View className="gap-3">
          <SectionCard
            icon="information-circle-outline"
            title="What is Tuberculosis?"
            subtitle="Basic definition"
          >
            <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
              TB is a contagious disease caused by{" "}
              <Text className="font-bold" style={{ color: colors.text }}>Mycobacterium tuberculosis</Text>. It mainly
              affects the lungs but can spread to other organs.
            </Text>
            <View className="flex-row gap-2">
              {overviewStats.map((item) => (
                <BulletStat key={item.label} {...item} isDark={isDark} colors={colors} />
              ))}
            </View>
          </SectionCard>
          <SectionCard icon="pulse-outline" title="Signs & Symptoms" subtitle="Watch for these signs">
            <View className="gap-2.5">
              {symptoms.map((symptom) => (
                <View
                  key={symptom.name}
                  className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: colors.surface }}
                >
                  <View
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: symptom.dotColor }}
                  />
                  <Text className="flex-1 text-sm font-semibold" style={{ color: colors.text }}>{symptom.name}</Text>
                  <Text className="text-xs" style={{ color: colors.textMuted }}>{symptom.note}</Text>
                </View>
              ))}
            </View>
            <View className="mt-4 rounded-xl border p-3" style={{ borderColor: colors.cardBorder, backgroundColor: colors.surface }}>
              <Text className="mb-1.5 text-sm font-bold" style={{ color: colors.primary }}>Latent vs Active TB</Text>
              <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
                Latent: no symptoms and not contagious. Active: symptoms present, contagious, and
                needs treatment.
              </Text>
            </View>
          </SectionCard>
        </View>
      );
    }

    if (section === "causesRiskPrevention") {
      return (
        <View className="gap-3">
          <SectionCard icon="cloud-outline" title="How TB Spreads" subtitle="Transmission routes">
            <View className="mb-3 flex-row flex-wrap gap-2">
              {spreadTags.map((tag) => (
                <TagPill key={tag.label} {...tag} />
              ))}
            </View>
            <Text className="text-xs italic" style={{ color: colors.textMuted }}>
              Not spread by touch, handshakes, or sharing food.
            </Text>
          </SectionCard>
          <SectionCard icon="people-outline" title="Higher Risk Groups" subtitle="Who is vulnerable">
            <View className="flex-row flex-wrap gap-2">
              {riskTags.map((tag) => (
                <TagPill key={tag.label} {...tag} />
              ))}
            </View>
          </SectionCard>
          <SectionCard
            icon="shield-checkmark-outline"
            title="How to Prevent TB"
            subtitle="Protect yourself and others"
          >
            <View className="gap-3">
              {prevention.map((item) => (
                <StepRow key={item.title} {...item} isDark={isDark} colors={colors} />
              ))}
            </View>
          </SectionCard>
        </View>
      );
    }

    if (section === "actionSeekHelp") {
      return (
        <View className="gap-3">
          <SectionCard icon="medkit-outline" title="Steps to Take" subtitle="If you suspect TB">
            <View className="gap-3">
              {steps.map((step) => (
                <StepRow key={step.title} {...step} isDark={isDark} colors={colors} />
              ))}
            </View>
          </SectionCard>
          <SectionCard
            icon="alert-circle-outline"
            title="Seek care immediately if..."
            subtitle="Emergency signs"
          >
            <View className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3.5">
              <Text className="text-sm font-semibold text-[#991B1B]">
                Coughing up blood, severe chest pain, or difficulty breathing.
              </Text>
              <Text className="mt-1.5 text-sm leading-5 text-[#7F1D1D]">
                These may indicate advanced TB and need urgent medical attention.
              </Text>
            </View>
            <View className="mt-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3.5">
              <Text className="text-sm font-semibold text-[#166534]">Good news: TB is curable.</Text>
              <Text className="mt-1.5 text-sm leading-5 text-[#166534]">
                With complete and consistent treatment, most people fully recover.
              </Text>
            </View>
          </SectionCard>
        </View>
      );
    }

    return null;
  };

  const renderAccordionVariant = () => (
    <View className="gap-3">
      {sections.map((item) => {
        const isOpen = openAccordion === item.id;
        return (
          <View
            key={item.id}
            className="overflow-hidden rounded-2xl border"
            style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
          >
            <Pressable
              className="flex-row items-center justify-between px-4 py-3.5"
              onPress={() => setOpenAccordion(isOpen ? null : item.id)}
            >
              <View className="flex-row items-center gap-2.5">
                <View
                  className="h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: isOpen ? colors.primary : isDark ? colors.surfaceAlt : "#EAE8FA" }}
                >
                  <Ionicons name={item.icon} size={15} color={isOpen ? "#FFFFFF" : colors.primary} />
                </View>
                <Text className="text-sm font-semibold" style={{ color: colors.text }}>{item.label}</Text>
              </View>
              <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
            </Pressable>
            {isOpen ? <View className="border-t p-3" style={{ borderColor: colors.cardBorder }}>{renderSection(item.id)}</View> : null}
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, minHeight: 0, width: "100%", backgroundColor: colors.background }}>
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 28 }}
    >
      <View className="px-5" style={{ paddingTop: insets.top + 14 }}>
        <View className="mb-5 rounded-3xl p-5" style={{ backgroundColor: isDark ? colors.heroCard : "#0C1E4A" }}>
          <Text className="text-sm" style={{ color: isDark ? colors.textMuted : "#C9D5FF" }}>Learn</Text>
          <Text className="mt-1 text-2xl font-extrabold text-white">Tuberculosis (TB)</Text>
          <Text className="mt-2 text-sm leading-5" style={{ color: isDark ? colors.heroTextMuted : "#D8E1FF" }}>
            {isOperator ? STAFF_LEARN_HERO_SUBTITLE : PATIENT_LEARN_HERO_SUBTITLE}
          </Text>
        </View>

        {isOperator ? (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.cardBorder, backgroundColor: colors.primaryLight }}
          >
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              {STAFF_LEARN_COUNSELING_BANNER}
            </Text>
          </View>
        ) : null}

        <View className="mb-4">
          <View className="mb-3 overflow-hidden rounded-2xl border px-4 py-4" style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}>
            <View
              className="absolute -right-6 -top-7 h-20 w-20 rounded-full"
              style={{ backgroundColor: isDark ? "rgba(107,95,196,0.28)" : "#E4D7FF" }}
            />
            <View
              className="absolute right-8 top-7 h-10 w-10 rounded-full"
              style={{ backgroundColor: isDark ? "rgba(149,136,216,0.18)" : "#EFE6FF" }}
            />
            <Text className="text-[22px] font-extrabold" style={{ color: colors.primary }}>Commonly Asked Questions</Text>
            <Text className="mt-1 text-sm" style={{ color: colors.textSecondary }}>
              Open each item below to view formal guidance and key details.
            </Text>
          </View>
          {renderAccordionVariant()}
        </View>

        <TrustedSourcesBlock />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOpenTestingCenters}
          className="mb-4 mt-2 flex-row items-center justify-between rounded-[28px] px-6 py-5"
          style={[learnCardShadow, { backgroundColor: isDark ? colors.heroCard : "#C9D5FF" }]}
        >
          <View className="flex-1 pr-3">
            <Text className="text-[18px] font-extrabold" style={{ color: isDark ? colors.text : "#0C1E4A" }}>Find a TB Testing Center</Text>
            <Text className="mt-1 text-base" style={{ color: isDark ? colors.textSecondary : "#1A3478" }}>Locate the nearest health facility</Text>
          </View>
          <View className="h-14 w-14 items-center justify-center rounded-full bg-white/60">
            <Ionicons name="arrow-forward" size={28} color={isDark ? colors.text : "#0C1E4A"} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOpenMoreArticles}
          className="mb-4 flex-row items-center justify-between rounded-[28px] border px-6 py-5"
          style={[learnCardShadow, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
        >
          <View className="flex-1 pr-3">
            <Text className="text-[18px] font-extrabold" style={{ color: colors.text }}>Search More TB Articles</Text>
            <Text className="mt-1 text-base" style={{ color: colors.textMuted }}>
              Browse more trusted and up-to-date online references
            </Text>
          </View>
          <View className="h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: colors.primaryLight }}>
            <Ionicons name="open-outline" size={22} color={colors.primary} />
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  );
}
