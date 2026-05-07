import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CachedImage from "../components/CachedImage";
import { useRouter } from "expo-router";

const buttonElevation =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      }
    : { elevation: 6 };

export default function LandingPage() {
  const router = useRouter();

  const handleContinue = () => {
    router.replace("/acountOptions/accountOptions");
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ flex: 1 }}
      edges={["top", "right", "bottom", "left"]}
    >
      <View className="flex-1 px-8 pt-6 pb-7 sm:px-10 sm:pb-8 md:px-12">
        <View className="mt-2 mb-12 w-full items-center sm:mb-14 md:mb-16">
          <View className="aspect-square w-3/4 max-w-72">
            <CachedImage
              source={require("../../assets/images/Tbhon assets/Tbhon Logo.png")}
              className="size-full"
              resizeMode="contain"
            />
          </View>
        </View>

        <Text className="mb-4 text-left text-4xl font-bold text-black">Welcome</Text>

        <Text className="text-left text-base font-normal leading-relaxed text-black">
          Tbhon helps you take the first step toward better lung health with early tuberculosis 
          detection powered by smart technology. Quick, accessible, and reliable monitor your symptoms anytime, anywhere.
        </Text>

        <View className="min-h-2 flex-1" />

        <TouchableOpacity
          className="mt-4 w-full items-center justify-center rounded-xl bg-[#050533] py-3.5 sm:py-4 md:py-5"
          style={buttonElevation}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text className="text-base font-bold uppercase tracking-wider text-white">
            CONTINUE
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
