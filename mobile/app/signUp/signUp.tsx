import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Dimensions,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CachedImage from "../components/CachedImage";
import { useRouter } from "expo-router";

const inputClass =
  "h-12 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-base font-medium leading-5 text-[#111111]";

const GENDERS = ["Male", "Female", "Other"] as const;
type Gender = (typeof GENDERS)[number] | "";

type Step = 1 | 2 | 3;

type WindowRect = { x: number; y: number; width: number; height: number };

const GENDER_ROW_H = 48;
const genderMenuHeight = GENDER_ROW_H * GENDERS.length;

const SCROLL_FUDGE = 8;

export default function SignUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const authMarkSize = useMemo(() => {
    const d = Math.min(windowWidth, windowHeight);
    return Math.min(168, Math.max(76, Math.round(d * 0.27)));
  }, [windowWidth, windowHeight]);
  const [step, setStep] = useState<Step>(1);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [street, setStreet] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("");

  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [genderPickerOpen, setGenderPickerOpen] = useState(false);
  const [genderAnchor, setGenderAnchor] = useState<WindowRect | null>(null);
  const genderTriggerRef = useRef<View>(null);
  const [scrollViewportH, setScrollViewportH] = useState(0);
  /** Natural height of the form block (not the stretched scroll content container). */
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

  const closeGenderPicker = useCallback(() => {
    setGenderPickerOpen(false);
    setGenderAnchor(null);
  }, []);

  const openGenderPicker = useCallback(() => {
    genderTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setGenderAnchor({ x, y, width, height });
      setGenderPickerOpen(true);
    });
  }, []);

  const goAccountStep = () => {
    setStep(2);
  };

  const goPersonalStep = () => {
    setStep(1);
  };

  const handleCreateAccount = () => {
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordError("");
    console.log("Sign up:", email, password);
    setStep(3);
  };

  const handleGetStarted = () => {
    router.push("/home/HomeScreen");
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
          contentContainerStyle={{ flexGrow: 1 }}
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
          <View className="my-10 w-full items-center sm:my-10 md:my-5">
            <CachedImage
              source={require("../../assets/images/Tbhon assets/TBhon icon.png")}
              style={{ width: authMarkSize, height: authMarkSize }}
              resizeMode="contain"
            />
          </View>

          <Text className="mb-1.5 text-center text-2xl font-bold text-[#111111] sm:mb-2 sm:text-3xl md:mb-3">
            Create your account
          </Text>

          {step !== 3 && (
            <>
              <View className="mb-1.5 flex-row items-center justify-center gap-1.5 sm:mb-2">
                <View
                  className={`h-1.5 rounded-full ${
                    step === 1 ? "w-5 bg-[#1a1a4d]" : "w-1.5 bg-[#22c55e]"
                  }`}
                />
                <View
                  className={`h-1.5 rounded-full ${
                    step === 2 ? "w-5 bg-[#1a1a4d]" : "w-1.5 bg-[#E0E0E0]"
                  }`}
                />
              </View>
              <Text className="mb-2.5 text-center text-sm text-[#666666] sm:mb-3">
                <Text className="font-semibold text-[#5B5BFF]">
                  Step {step}
                </Text>
                {` of 2 — ${step === 1 ? "Personal Info" : "Account Setup"}`}
              </Text>
            </>
          )}

          {step === 1 && (
            <View className="rounded-3xl border border-[#EDEDED] bg-[#FAFAFA] p-4">
              <Text className="mb-3 text-lg font-bold text-[#111111]">Personal Info</Text>

              <View className="mb-1 flex-row gap-2 sm:mb-3">
                <View className="min-w-0 flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                    First name
                  </Text>
                  <TextInput
                    className={`${inputClass} mb-0`}
                    placeholder="Maria"
                    placeholderTextColor="#999999"
                    textAlignVertical="center"
                    style={{ includeFontPadding: false }}
                    value={firstName}
                    onChangeText={setFirstName}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                    Last name
                  </Text>
                  <TextInput
                    className={`${inputClass} mb-0`}
                    placeholder="Santos"
                    placeholderTextColor="#999999"
                    textAlignVertical="center"
                    style={{ includeFontPadding: false }}
                    value={lastName}
                    onChangeText={setLastName}
                  />
                </View>
              </View>

              <View className="mb-1 flex-row items-start gap-2 sm:mb-3">
                <View className="min-w-0 flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                    Birthdate
                  </Text>
                  <TextInput
                    className={`${inputClass} mb-0`}
                    placeholder="MM / DD / YYYY"
                    placeholderTextColor="#999999"
                    textAlignVertical="center"
                    style={{ includeFontPadding: false }}
                    value={birthdate}
                    onChangeText={setBirthdate}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                    Gender
                  </Text>
                  <View ref={genderTriggerRef} collapsable={false}>
                    <Pressable
                      onPress={openGenderPicker}
                      className="h-12 w-full flex-row items-center justify-between rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4"
                    >
                      <Text
                        className={`text-base font-medium leading-5 ${
                          gender ? "text-[#111111]" : "text-[#999999]"
                        }`}
                      >
                        {gender || "Select"}
                      </Text>
                      <Ionicons
                        name={genderPickerOpen ? "chevron-up" : "chevron-down"}
                        size={22}
                        color="#8FA3B1"
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              <View className="mb-2 sm:mb-4">
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                  Street
                </Text>
                <TextInput
                  className={`${inputClass} mb-0`}
                  placeholder="123 Magsaysay Ave."
                  placeholderTextColor="#999999"
                  textAlignVertical="center"
                  style={{ includeFontPadding: false }}
                  value={street}
                  onChangeText={setStreet}
                />
              </View>

              <View className="mb-1 flex-row gap-2 sm:mb-4">
                <View className="min-w-0 flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                    Barangay
                  </Text>
                  <TextInput
                    className={`${inputClass} mb-0`}
                    placeholder="Pinyahan"
                    placeholderTextColor="#999999"
                    textAlignVertical="center"
                    style={{ includeFontPadding: false }}
                    value={barangay}
                    onChangeText={setBarangay}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                    City
                  </Text>
                  <TextInput
                    className={`${inputClass} mb-0`}
                    placeholder="Davao City"
                    placeholderTextColor="#999999"
                    textAlignVertical="center"
                    style={{ includeFontPadding: false }}
                    value={city}
                    onChangeText={setCity}
                  />
                </View>
              </View>

              <Pressable
                className="w-full items-center justify-center rounded-2xl bg-[#1a1a4d] py-3 sm:py-4"
                onPress={goAccountStep}
              >
                <Text
                  className="text-base font-bold text-white"
                  style={{ letterSpacing: 0.5 }}
                >
                  SAVE & CONTINUE
                </Text>
              </Pressable>

              <View className="mt-4 flex-row flex-wrap items-center justify-center gap-x-1 px-1">
                <Text className="text-center text-base font-normal text-[#666666]">
                  Already have an account?{" "}
                </Text>
                <Pressable onPress={() => router.push("/login/login")}>
                  <Text className="text-base font-semibold text-[#5B5BFF]">Log In</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 2 && (
            <View className="rounded-3xl border border-[#EDEDED] bg-[#FAFAFA] p-4">
              <Text className="text-lg font-bold text-[#111111]">Account Setup</Text>
              <Text className="mb-2 text-sm text-[#666666] sm:mb-3">Secure your TBHON account</Text>

              <View className="mb-1 sm:mb-3">
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                  Email
                </Text>
                <TextInput
                  className={`${inputClass} mb-0`}
                  placeholder="maria@email.com"
                  placeholderTextColor="#999999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlignVertical="center"
                  style={{ includeFontPadding: false }}
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View className="mb-1 sm:mb-3">
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                  Phone number
                </Text>
                <View className="flex-row items-stretch gap-2">
                  <View className="justify-center rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-3">
                    <Text className="text-base font-medium text-[#111111]">🇵🇭 +63</Text>
                  </View>
                  <TextInput
                    className={`${inputClass} mb-0 min-w-0 flex-1`}
                    placeholder="9XX XXX XXXX"
                    placeholderTextColor="#999999"
                    keyboardType="phone-pad"
                    textAlignVertical="center"
                    style={{ includeFontPadding: false }}
                    value={phoneLocal}
                    onChangeText={setPhoneLocal}
                  />
                </View>
              </View>

              <View className="mb-2 sm:mb-4">
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                  Password
                </Text>
                <TextInput
                  className={`${inputClass} mb-0`}
                  placeholder="Min. 6 characters"
                  placeholderTextColor="#999999"
                  secureTextEntry
                  textAlignVertical="center"
                  style={{ includeFontPadding: false }}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    setPasswordError("");
                  }}
                />
              </View>

              <View className="mb-1 sm:mb-3">
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                  Confirm password
                </Text>
                <TextInput
                  className={`${inputClass} mb-0`}
                  placeholder="Re-enter password"
                  placeholderTextColor="#999999"
                  secureTextEntry
                  textAlignVertical="center"
                  style={{ includeFontPadding: false }}
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    setPasswordError("");
                  }}
                />
              </View>

              {passwordError ? (
                <Text className="mb-1 text-xs text-red-600 sm:mb-4">{passwordError}</Text>
              ) : (
                <Text className="mb-1 text-xs text-[#888888] sm:mb-4">
                  Password must be at least 6 characters and match confirmation.
                </Text>
              )}

              <View className="flex-row items-stretch gap-3">
                <Pressable
                  className="items-center justify-center rounded-2xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-3"
                  onPress={goPersonalStep}
                >
                  <Text className="text-sm font-semibold text-[#666666]">← Back</Text>
                </Pressable>
                <Pressable
                  className="min-w-0 flex-1 items-center justify-center rounded-2xl bg-[#1a1a4d] py-3 sm:py-4"
                  onPress={handleCreateAccount}
                >
                  <Text
                    className="text-base font-bold text-white"
                    style={{ letterSpacing: 0.5 }}
                  >
                    CREATE ACCOUNT
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 3 && (
            <View className="items-center rounded-3xl border border-[#EDEDED] bg-[#FAFAFA] px-4 py-6 sm:px-5 sm:py-8">
              <View className="mb-3 size-16 items-center justify-center rounded-full border-2 border-[#22c55e] bg-[#DCFCE7]">
                <Ionicons name="checkmark" size={32} color="#16a34a" />
              </View>
              <Text className="mb-2 text-center text-xl font-bold text-[#111111]">
                Account Created!
              </Text>
              <Text className="mb-4 text-center text-sm leading-6 text-[#666666]">
                Welcome to TBHON{firstName ? `, ${firstName}` : ""}.{"\n"}
                {"You're all set to start your health journey."}
              </Text>
              <Pressable
                className="w-full max-w-sm items-center justify-center rounded-2xl bg-[#1a1a4d] py-3 sm:py-3.5"
                onPress={handleGetStarted}
              >
                <Text
                  className="text-base font-bold text-white"
                  style={{ letterSpacing: 0.5 }}
                >
                  GET STARTED
                </Text>
              </Pressable>
            </View>
          )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={genderPickerOpen}
        transparent
        animationType="none"
        onRequestClose={closeGenderPicker}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeGenderPicker} />
          {genderAnchor ? (
            <View pointerEvents="box-none" style={styles.menuLayer}>
              {(() => {
                const { width: winW, height: winH } = Dimensions.get("window");
                const pad = 8;
                const gap = 6;
                let left = genderAnchor.x;
                const maxW = genderAnchor.width;
                if (left + maxW > winW - pad) {
                  left = Math.max(pad, winW - pad - maxW);
                }
                const belowY = genderAnchor.y + genderAnchor.height + gap;
                const aboveY = genderAnchor.y - genderMenuHeight - gap;
                const roomBelow = winH - belowY - pad;
                const openUpward =
                  roomBelow < genderMenuHeight && aboveY >= pad;
                const top = openUpward ? aboveY : belowY;
                return (
                  <View
                    style={[
                      styles.dropdownMenu,
                      {
                        left,
                        top,
                        width: maxW,
                        ...(Platform.OS === "android"
                          ? { elevation: 12 }
                          : {
                              shadowColor: "#000",
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.12,
                              shadowRadius: 12,
                            }),
                      },
                    ]}
                  >
                    {GENDERS.map((g, idx) => (
                      <Pressable
                        key={g}
                        onPress={() => {
                          setGender(g);
                          closeGenderPicker();
                        }}
                        className={`flex-row items-center justify-between px-3 ${
                          idx === GENDERS.length - 1 ? "" : "border-b border-[#F0F0F0]"
                        }`}
                        style={{ minHeight: GENDER_ROW_H }}
                      >
                        <Text className="text-base font-medium text-[#111111]">{g}</Text>
                        {gender === g ? (
                          <Ionicons name="checkmark-circle" size={20} color="#1a1a4d" />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                );
              })()}
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  menuLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  dropdownMenu: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EDEDED",
    overflow: "hidden",
  },
});
