import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Platform,
  ScrollView,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CachedImage from "../components/CachedImage";
import { PasswordVisibilityIcon } from "../components/PasswordVisibilityIcons";
import { useRouter } from "expo-router";
import { ApiError, postLogin } from "../../services/backendApi";
import { saveAuthToken } from "../../utils/authStorage";
import { setCachedProfile } from "../../utils/profileCache";
import { useIosPasswordSecureMaskSync } from "../../utils/useIosPasswordSecureMaskSync";

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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const loginPasswordRef = useRef<TextInput>(null);
  useIosPasswordSecureMaskSync(loginPasswordRef, passwordVisible, password);
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

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert("Sign in", "Please enter email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const { token, user } = await postLogin(trimmedEmail, password);
      await saveAuthToken(token);
      setCachedProfile(user);
      router.replace("/home/HomeScreen");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not reach the server. Check API URL / network.";
      Alert.alert("Sign in failed", message);
    } finally {
      setSubmitting(false);
    }
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
      {/*
       * iOS: avoid KeyboardAvoidingView + SafeArea bottom — duplicates keyboard lift and
       * shows an extra white band. ScrollView adjusts insets natively instead.
       */}
      <ScrollView
        className="flex-1"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
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
                  textContentType="emailAddress"
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
                <View className="relative">
                  <TextInput
                    ref={loginPasswordRef}
                    className={`tbhon-auth-password ${inputClass} mb-0 pr-12`}
                    placeholder="Your password"
                    placeholderTextColor="#999999"
                    secureTextEntry={!passwordVisible}
                    autoComplete="password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    textContentType="password"
                    textAlignVertical="center"
                    underlineColorAndroid="transparent"
                    {...(Platform.OS === "ios" ? { clearButtonMode: "never" as const } : {})}
                    style={{ includeFontPadding: false }}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <PasswordVisibilityIcon
                    secureTextEntry={!passwordVisible}
                    onToggle={() => setPasswordVisible((v) => !v)}
                  />
                </View>
              </View>

              <Pressable
                className="w-full flex-row items-center justify-center rounded-2xl bg-[#1a1a4d] py-3 sm:py-4 active:opacity-90"
                onPress={handleSignIn}
                disabled={submitting}
                android_ripple={{ color: "rgba(255,255,255,0.2)" }}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-base font-bold text-white" style={{ letterSpacing: 0.5 }}>
                    SIGN IN
                  </Text>
                )}
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
    </SafeAreaView>
  );
}
