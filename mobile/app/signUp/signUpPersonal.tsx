import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CachedImage from "../components/CachedImage";
import { useRouter } from "expo-router";

export default function SignUpPersonal() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [location, setLocation] = useState("");

  const handleContinue = () => {
    router.push("/signUp/signUpEmail");
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
            className="mb-3 h-14 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-lg font-medium leading-6 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="First Name"
            placeholderTextColor="#999999"
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={firstName}
            onChangeText={setFirstName}
          />

          <TextInput
            className="mb-3 h-14 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-lg font-medium leading-6 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="Last Name"
            placeholderTextColor="#999999"
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={lastName}
            onChangeText={setLastName}
          />

          <TextInput
            className="mb-3 h-14 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-lg font-medium leading-6 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="Birthdate"
            placeholderTextColor="#999999"
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={birthdate}
            onChangeText={setBirthdate}
          />

          <TextInput
            className="mb-3 h-14 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-lg font-medium leading-6 text-[#111111] sm:mb-4 md:mb-5"
            placeholder="Location"
            placeholderTextColor="#999999"
            textAlignVertical="center"
            style={{ includeFontPadding: false }}
            value={location}
            onChangeText={setLocation}
          />

          <Pressable
            className="mt-5 w-full items-center justify-center rounded-2xl bg-[#1a1a4d] py-3.5 sm:mt-6 sm:py-4"
            onPress={handleContinue}
          >
            <Text className="text-base font-bold text-white" style={{ letterSpacing: 0.5 }}>
              CONTINUE
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
