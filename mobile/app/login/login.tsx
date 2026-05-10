import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CachedImage from "../components/CachedImage";
import { useRouter } from "expo-router";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignIn = () => {
    console.log("Sign in:", email, password);
    router.push("/home/HomeScreen");
  };

  const handleSignUp = () => {
    router.push("/signUp/signUpPersonal");
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
          Login to your account
        </Text>

        <View className="flex-1 justify-start">
          <TextInput
            className="mb-3 h-14 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-lg font-medium leading-6 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="Email"
            placeholderTextColor="#999999"
            keyboardType="email-address"
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            className="mb-3 h-14 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-lg font-medium leading-6 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="Password"
            placeholderTextColor="#999999"
            secureTextEntry
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={password}
            onChangeText={setPassword}
          />

          <Pressable
            className="mt-5 mb-5 w-full items-center justify-center rounded-2xl bg-[#1a1a4d] py-3.5 sm:mt-6 sm:mb-6 sm:py-4"
            onPress={handleSignIn}
          >
            <Text className="text-base font-bold text-white" style={{ letterSpacing: 0.5 }}>
              SIGN IN
            </Text>
          </Pressable>

          <View className="flex-row items-center justify-center">
            <Text className="text-base font-normal text-[#666666]">
              {"Don't have an account? "}
            </Text>
            <Pressable onPress={handleSignUp}>
              <Text className="text-base font-semibold text-[#5B5BFF]">Sign up</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
