import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import CachedImage from "../components/CachedImage";
import { useRouter } from "expo-router";

const inputClass =
  "h-12 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-base font-medium leading-5 text-[#111111]";

const formCardShadow =
  Platform.OS === "ios"
    ? {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      }
    : { elevation: 2 };

/** Pixels of slack so float rounding does not toggle scroll. */
const SCROLL_FUDGE = 8;

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [scrollViewportH, setScrollViewportH] = useState(0);
  const [innerContentH, setInnerContentH] = useState(0);

  const scrollEnabled = useMemo(() => {
    if (scrollViewportH <= 0 || innerContentH <= 0) return true;
    return innerContentH > scrollViewportH + SCROLL_FUDGE;
  }, [scrollViewportH, innerContentH]);

  const onScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    setScrollViewportH(e.nativeEvent.layout.height);
  }, []);

  const onInnerLayout = useCallback((e: LayoutChangeEvent) => {
    setInnerContentH(e.nativeEvent.layout.height);
  }, []);

  /** Short or narrow viewports: center the block vertically; larger: align like sign-up (top). */
  const isCompact = useMemo(
    () => windowHeight < 700 || windowWidth < 380,
    [windowHeight, windowWidth],
  );

  /** Scales with the smaller window edge so the mark fits in both orientations. */
  const authMarkSize = useMemo(() => {
    const d = Math.min(windowWidth, windowHeight);
    return Math.min(168, Math.max(76, Math.round(d * 0.27)));
  }, [windowWidth, windowHeight]);

  const handleSignIn = () => {
    console.log("Sign in:", email, password);
    router.push("/home/HomeScreen");
  };

  const handleSignUp = () => {
    router.push("/signUp/signUp");
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ flex: 1 }}
      edges={["top", "right", "bottom", "left"]}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          className="flex-1"
          scrollEnabled={scrollEnabled}
          bounces={scrollEnabled}
          alwaysBounceVertical={false}
          onLayout={onScrollViewLayout}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: isCompact ? "center" : "flex-start",
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={scrollEnabled}
          {...(Platform.OS === "android"
            ? { overScrollMode: scrollEnabled ? ("auto" as const) : ("never" as const) }
            : {})}
        >
          <View
            onLayout={onInnerLayout}
            collapsable={false}
            className="px-5 pt-5 pb-6 sm:px-6 sm:pt-6 sm:pb-7 md:px-8 md:pt-7 md:pb-9"
          >
            <View className="my-3 w-full items-center sm:my-10 md:my-5">
              <CachedImage
                source={require("../../assets/images/Tbhon assets/TBhon icon.png")}
                style={{ width: authMarkSize, height: authMarkSize }}
                resizeMode="contain"
              />
            </View>

            <Text className="mb-1.5 text-center text-2xl font-bold text-[#111111] sm:mb-2 sm:text-3xl md:mb-3">
              Login to your account
            </Text>

            <Text
              className={`text-center text-sm leading-6 text-[#666666] ${
                isCompact ? "mb-4" : "mb-2.5 sm:mb-3"
              }`}
            >
              Enter your email and password to continue.
            </Text>

            <View
              className="rounded-3xl border border-[#EDEDED] bg-[#FAFAFA] p-4"
              style={formCardShadow}
            >
              <Text className="mb-3 text-lg font-bold text-[#111111]">Sign in</Text>

              <View className="mb-1 sm:mb-3">
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                  Email
                </Text>
                <TextInput
                  className={`${inputClass} mb-0`}
                  placeholder="you@email.com"
                  placeholderTextColor="#999999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="username"
                  textAlignVertical="center"
                  style={{ includeFontPadding: false }}
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View className="mb-1 sm:mb-4">
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                  Password
                </Text>
                <TextInput
                  className={`${inputClass} mb-0`}
                  placeholder="Your password"
                  placeholderTextColor="#999999"
                  secureTextEntry
                  autoComplete="password"
                  textContentType="password"
                  textAlignVertical="center"
                  style={{ includeFontPadding: false }}
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              <Pressable
                className="w-full items-center justify-center rounded-2xl bg-[#1a1a4d] py-3 sm:py-4 active:opacity-90"
                onPress={handleSignIn}
                android_ripple={{ color: "rgba(255,255,255,0.2)" }}
              >
                <Text className="text-base font-bold text-white" style={{ letterSpacing: 0.5 }}>
                  SIGN IN
                </Text>
              </Pressable>
            </View>

            <View
              className={`flex-row flex-wrap items-center justify-center gap-x-1 px-1 ${
                isCompact ? "mt-6" : "mt-4 sm:mt-5"
              }`}
            >
              <Text className="text-center text-base font-normal text-[#666666]">
                {"Don't have an account? "}
              </Text>
              <Pressable
                onPress={handleSignUp}
                android_ripple={{ color: "#E8E8E8" }}
                className="rounded-lg py-1"
              >
                <Text className="text-base font-semibold text-[#5B5BFF]">Sign up</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
