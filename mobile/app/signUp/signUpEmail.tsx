import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CachedImage from "../components/CachedImage";
import { useRouter } from "expo-router";

export default function SignUpEmail() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSignUp = () => {
    console.log("Sign up:", email, password);
    router.push("/home/HomeScreen");
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ flex: 1 }}
      edges={["top", "right", "bottom", "left"]}
    >
      <View className="flex-1 justify-between px-5 pt-6 pb-7 sm:px-6 sm:pt-7 sm:pb-8 md:px-8 md:pt-8 md:pb-10">
        <View className="mt-2 mb-3 w-full items-center sm:mb-4">
          <View className="aspect-square w-3/4 max-w-72">
            <CachedImage
              source={require("../../assets/images/Tbhon assets/Tbhon Logo.png")}
              className="size-full"
              resizeMode="contain"
            />
          </View>
        </View>

        <Text className="mb-6 text-center text-3xl font-bold text-[#111111] sm:mb-8 md:mb-10">
          Create your account
        </Text>

        <View className="flex-1 justify-start">
          <TextInput
            className="mb-3 h-12 w-full rounded-xl border border-[#EDEDED] bg-[#F8F8F8] px-3 py-0 text-base font-medium leading-5 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="Email"
            placeholderTextColor="#999999"
            keyboardType="email-address"
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            className="mb-3 h-12 w-full rounded-xl border border-[#EDEDED] bg-[#F8F8F8] px-3 py-0 text-base font-medium leading-5 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="Password"
            placeholderTextColor="#999999"
            secureTextEntry
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={password}
            onChangeText={setPassword}
          />

          <TextInput
            className="mb-3 h-12 w-full rounded-xl border border-[#EDEDED] bg-[#F8F8F8] px-3 py-0 text-base font-medium leading-5 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="Confirm Password"
            placeholderTextColor="#999999"
            secureTextEntry
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <Pressable
            className="mt-5 mb-5 w-full items-center justify-center rounded-xl bg-[#1a1a4d] py-3.5 sm:mt-6 sm:mb-6 sm:py-4"
            onPress={handleSignUp}
          >
            <Text className="text-base font-bold text-white" style={{ letterSpacing: 0.5 }}>
              SIGN UP
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
