import React, { useMemo } from "react";
import { View, Text, Pressable, Platform, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CachedImage from "../components/CachedImage";
import { APP_TAGLINE, TBHON_LOGO } from "../../constants/branding";
import {
  PATIENT_ACCESS_TITLE,
  STAFF_EXISTING_DESC,
  STAFF_LANDING_SECTION,
  STAFF_NEW_DESC,
} from "../../constants/patientAccess";
import { getBrandLogoLayout } from "../../utils/brandLogoLayout";
import { useRouter } from "expo-router";

const cardShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      }
    : { elevation: 2 };

function OptionRow({
  title,
  description,
  icon,
  iconBgClass,
  iconBorderClass,
  iconColor,
  onPress,
}: {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBgClass: string;
  iconBorderClass: string;
  iconColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      className="mb-3 flex-row items-center gap-4 rounded-3xl border border-[#EDEDED] bg-[#FAFAFA] p-4 active:bg-[#F3F3F3] sm:gap-5 sm:p-5"
      style={cardShadow}
      onPress={onPress}
      android_ripple={{ color: "#E8E8E8" }}
    >
      <View
        className={`size-14 shrink-0 items-center justify-center rounded-2xl border sm:size-16 ${iconBgClass} ${iconBorderClass}`}
      >
        <Ionicons name={icon} size={28} color={iconColor} />
      </View>
      <View className="min-w-0 flex-1 pr-1">
        <Text className="text-lg font-bold text-[#111111] sm:text-xl">{title}</Text>
        <Text className="mt-1 text-sm leading-6 text-[#666666] sm:text-base sm:leading-6">
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#8FA3B1" style={{ flexShrink: 0 }} />
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-3 mt-2 text-xs font-bold uppercase tracking-[1.4px] text-[#888888] sm:text-sm">
      {children}
    </Text>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const scrollMinHeight = useMemo(
    () => Math.max(0, windowHeight - insets.top - insets.bottom),
    [windowHeight, insets.top, insets.bottom],
  );

  const brandLogo = useMemo(
    () => getBrandLogoLayout(windowHeight, windowWidth, 40),
    [windowHeight, windowWidth],
  );

  return (
    <SafeAreaView className="flex-1 bg-white" style={{ flex: 1 }} edges={["top", "right", "bottom", "left"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          minHeight: scrollMinHeight,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          className="justify-between px-5 pt-6 pb-7 sm:px-6 sm:pt-7 sm:pb-8 md:px-8 md:pt-8 md:pb-10"
          style={{ minHeight: scrollMinHeight }}
        >
          <View>
            <View
              className="w-full items-center"
              style={{
                marginTop: brandLogo.topMargin,
                marginBottom: brandLogo.bottomMargin,
              }}
            >
              <View style={{ width: brandLogo.boxWidth, aspectRatio: 1 }}>
                <CachedImage source={TBHON_LOGO} className="size-full" resizeMode="contain" />
              </View>
            </View>

            <Text className="mb-1 text-center text-sm text-[#666666]">{APP_TAGLINE}</Text>

            <SectionLabel>{STAFF_LANDING_SECTION}</SectionLabel>

            <OptionRow
              title="Staff sign in"
              description={STAFF_EXISTING_DESC}
              icon="medkit-outline"
              iconBgClass="bg-[#F3EEFF]"
              iconBorderClass="border-[#E4D9FF]"
              iconColor="#5B5BFF"
              onPress={() => router.push("/login/login?intent=staff" as never)}
            />

            <OptionRow
              title="New booth staff"
              description={STAFF_NEW_DESC}
              icon="person-add-outline"
              iconBgClass="bg-[#E8FAF5]"
              iconBorderClass="border-[#C8EDE0]"
              iconColor="#0F766E"
              onPress={() => router.push("/signUp/signUp" as never)}
            />

            <View className="my-4 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-[#E0E0E0]" />
              <Text className="text-xs font-medium text-[#999999] sm:text-sm">screened at the booth?</Text>
              <View className="h-px flex-1 bg-[#E0E0E0]" />
            </View>

            <Pressable
              className="mt-2 items-center py-2 active:opacity-70"
              onPress={() => router.push("/patient/access" as never)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={PATIENT_ACCESS_TITLE}
            >
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="qr-code-outline" size={16} color="#5B5BFF" />
                <Text className="text-sm font-semibold text-[#5B5BFF] sm:text-base">
                  {PATIENT_ACCESS_TITLE}
                </Text>
              </View>
              <Text className="mt-1.5 text-center text-xs leading-5 text-[#888888] sm:text-sm">
                Scan the QR code on your result slip
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
