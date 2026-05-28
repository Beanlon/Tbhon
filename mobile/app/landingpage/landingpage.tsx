import React, { useMemo } from "react";
import { View, Text, Pressable, Platform, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CachedImage from "../components/CachedImage";
import { TBHON_LOGO } from "../../constants/branding";
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
      className={`mb-4 flex-row items-center gap-4 rounded-3xl border border-[#EDEDED] bg-[#FAFAFA] p-4 active:bg-[#F3F3F3] sm:mb-5 sm:gap-5 sm:p-5`}
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
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ flex: 1 }}
      edges={["top", "right", "bottom", "left"]}
    >
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
                <CachedImage
                  source={TBHON_LOGO}
                  className="size-full"
                  resizeMode="contain"
                />
              </View>
            </View>

            <Text className="mb-4 mt-5 text-sm font-semibold uppercase tracking-[1.2px] text-[#888888] sm:mb-5 sm:mt-6 sm:text-base">
              Get started
            </Text>

            <OptionRow
              title="Existing user"
              description="Sign in to access your scan history and health data"
              icon="person-circle-outline"
              iconBgClass="bg-[#F3EEFF]"
              iconBorderClass="border-[#E4D9FF]"
              iconColor="#5B5BFF"
              onPress={() => router.push("/login/login")}
            />

            <View className="mb-4 flex-row items-center gap-3 sm:mb-5">
              <View className="h-px flex-1 bg-[#E0E0E0]" />
              <Text className="text-xs font-medium text-[#999999] sm:text-sm">or</Text>
              <View className="h-px flex-1 bg-[#E0E0E0]" />
            </View>

            <OptionRow
              title="New user"
              description="Create your account with personal info, email and password"
              icon="person-add-outline"
              iconBgClass="bg-[#E8FAF5]"
              iconBorderClass="border-[#C8EDE0]"
              iconColor="#0F766E"
              onPress={() => router.push("/signUp/signUp")}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
