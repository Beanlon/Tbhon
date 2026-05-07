import React from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CachedImage from "../components/CachedImage";
import { useRouter } from "expo-router";

const cardShadow = {
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 4,
};

export default function AccountOptions() {
  const router = useRouter();

  const handleExistingUser = () => {
    router.push("/login/login");
  };

  const handleNewUser = () => {
    router.push("/signUp/signUpPersonal");
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ flex: 1 }}
      edges={["top", "right", "bottom", "left"]}
    >
      <View className="flex-1 px-5 pt-6 pb-7 sm:px-6 sm:pt-7 sm:pb-8 md:px-8 md:pt-8 md:pb-10">
        <View className="mt-2 mb-3 w-full items-center sm:mb-4">
          <View className="aspect-square w-3/4 max-w-72">
            <CachedImage
              source={require("../../assets/images/Tbhon assets/Tbhon Logo.png")}
              className="size-full"
              resizeMode="contain"
            />
          </View>
        </View>

        <Text className="mb-8 text-center text-3xl font-bold text-[#111111] sm:mb-10 md:mb-12">
          Start with your account
        </Text>

        <View className="gap-4 sm:gap-5 md:gap-6">
          <Pressable
            className="rounded-2xl border border-[#F1F1F1] bg-white p-4 sm:p-5 md:p-6"
            style={cardShadow}
            android_ripple={{ color: "#E9E9E9" }}
            onPress={handleExistingUser}
          >
            <Text className="mb-2 text-lg font-bold leading-6 text-[#111111] sm:mb-2.5">
              Already an existing user
            </Text>
            <Text className="text-base font-normal leading-6 text-[#2F2F2F]">
              Sign up to access your pre-existing account to access your scan history, and other data
            </Text>
          </Pressable>

          <Pressable
            className="rounded-2xl border border-[#F1F1F1] bg-white p-4 sm:p-5 md:p-6"
            style={cardShadow}
            android_ripple={{ color: "#E9E9E9" }}
            onPress={handleNewUser}
          >
            <Text className="mb-2 text-lg font-bold leading-6 text-[#111111] sm:mb-2.5">
              Don’t have an account
            </Text>
            <Text className="text-base font-normal leading-6 text-[#2F2F2F]">
              Create your account by entering your personal information and also your email and
              password
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
