import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  TextInput,
  Platform,
  Modal,
  Dimensions,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
  Keyboard,
  Easing,
  type LayoutChangeEvent,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CachedImage from "../components/CachedImage";
import { PasswordVisibilityIcon } from "../components/PasswordVisibilityIcons";
import { useRouter } from "expo-router";
import { ApiError, postRegister } from "../../services/backendApi";
import { saveAuthToken } from "../../utils/authStorage";
import { setCachedProfile } from "../../utils/profileCache";
import { useIosPasswordSecureMaskSync } from "../../utils/useIosPasswordSecureMaskSync";
import {
  birthdateStringToLocalDate,
  defaultSignupBirthdateDate,
  formatBirthdateDisplayFromDate,
  formatSignupBirthdateInput,
  normalizeGenderForApi,
  normalizePhilippineMobile,
  SIGNUP_BIRTHDATE_DISPLAY_MAX_LEN,
  signupBirthdateToIso,
} from "../../utils/signupHelpers";

const inputClass =
  "h-12 w-full rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-0 text-base font-medium leading-5 text-[#111111]";

const GENDERS = ["Male", "Female", "Other"] as const;
type Gender = (typeof GENDERS)[number] | "";

type Step = 1 | 2 | 3;

type WindowRect = { x: number; y: number; width: number; height: number };

const GENDER_ROW_H = 48;
const genderMenuHeight = GENDER_ROW_H * GENDERS.length;

const SCROLL_FUDGE = 8;

const BIRTHDATE_MIN = new Date(1900, 0, 1);

/** Off-screen offset for iOS birthdate sheet slide-in (px). */
const IOS_BIRTHDATE_SHEET_OFFSET = 340;

function birthdateMaximum(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [genderPickerOpen, setGenderPickerOpen] = useState(false);
  const signupPasswordRef = useRef<TextInput>(null);
  const signupConfirmPasswordRef = useRef<TextInput>(null);
  useIosPasswordSecureMaskSync(signupPasswordRef, passwordVisible, password);
  useIosPasswordSecureMaskSync(signupConfirmPasswordRef, confirmPasswordVisible, confirmPassword);
  const [birthdatePickerOpen, setBirthdatePickerOpen] = useState(false);
  const [birthdatePickerDate, setBirthdatePickerDate] = useState(() =>
    defaultSignupBirthdateDate(),
  );
  const iosBirthdateBackdropOpacity = useRef(new Animated.Value(0)).current;
  const iosBirthdateSheetY = useRef(new Animated.Value(IOS_BIRTHDATE_SHEET_OFFSET)).current;
  const [submittingAccount, setSubmittingAccount] = useState(false);
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

  const openBirthdatePicker = useCallback(() => {
    Keyboard.dismiss();
    const initial = birthdateStringToLocalDate(birthdate) ?? defaultSignupBirthdateDate();
    setBirthdatePickerDate(initial);
    if (Platform.OS === "ios") {
      iosBirthdateBackdropOpacity.setValue(0);
      iosBirthdateSheetY.setValue(IOS_BIRTHDATE_SHEET_OFFSET);
    }
    setBirthdatePickerOpen(true);
  }, [birthdate, iosBirthdateBackdropOpacity, iosBirthdateSheetY]);

  const animateIosBirthdateOpen = useCallback(() => {
    Animated.parallel([
      Animated.timing(iosBirthdateBackdropOpacity, {
        toValue: 0.45,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(iosBirthdateSheetY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [iosBirthdateBackdropOpacity, iosBirthdateSheetY]);

  const animateIosBirthdateClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(iosBirthdateBackdropOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(iosBirthdateSheetY, {
        toValue: IOS_BIRTHDATE_SHEET_OFFSET,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setBirthdatePickerOpen(false);
      }
    });
  }, [iosBirthdateBackdropOpacity, iosBirthdateSheetY]);

  useEffect(() => {
    if (birthdatePickerOpen && Platform.OS === "ios") {
      animateIosBirthdateOpen();
    }
  }, [birthdatePickerOpen, animateIosBirthdateOpen]);

  const onAndroidBirthdateChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      setBirthdatePickerOpen(false);
      if (event.type === "set" && date) {
        setBirthdate(formatBirthdateDisplayFromDate(date));
      }
    },
    [],
  );

  const confirmIosBirthdate = useCallback(() => {
    setBirthdate(formatBirthdateDisplayFromDate(birthdatePickerDate));
    animateIosBirthdateClose();
  }, [birthdatePickerDate, animateIosBirthdateClose]);

  const goAccountStep = () => {
    setStep(2);
  };

  const goPersonalStep = () => {
    setStep(1);
  };

  const handleCreateAccount = async () => {
    const missingPersonal =
      !firstName.trim() ||
      !lastName.trim() ||
      !birthdate.trim() ||
      !gender.trim() ||
      !street.trim() ||
      !barangay.trim() ||
      !city.trim();
    if (missingPersonal) {
      Alert.alert(
        "Complete your profile",
        "Please finish Step 1 (all fields including address) before creating an account.",
      );
      return;
    }

    const birthIso = signupBirthdateToIso(birthdate);
    if (!birthIso) {
      Alert.alert(
        "Birthdate",
        "Use MM / DD / YYYY (e.g. 01 / 15 / 1995) or YYYY-MM-DD.",
      );
      return;
    }

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert("Email required", "Please enter your email.");
      return;
    }

    setPasswordError("");
    setSubmittingAccount(true);
    try {
      const phoneNumber = normalizePhilippineMobile(phoneLocal);
      const { token, user } = await postRegister({
        email: trimmedEmail,
        password,
        phoneNumber: phoneNumber ?? null,
        profile: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthdate: birthIso,
          gender: normalizeGenderForApi(gender),
          street: street.trim() || null,
          barangay: barangay.trim() || null,
          city: city.trim() || null,
        },
      });
      await saveAuthToken(token);
      setCachedProfile(user);
      setStep(3);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not reach the server. Check API URL / network.";
      Alert.alert("Create account failed", message);
    } finally {
      setSubmittingAccount(false);
    }
  };

  const handleGetStarted = () => {
    router.replace("/home/HomeScreen");
  };

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ flex: 1 }}
      edges={["top", "right", "bottom", "left"]}
    >
      {/*
       * iOS: KeyboardAvoidingView + SafeArea bottom stacks padding and causes a visible
       * white strip above the keyboard. Use ScrollView's native keyboard inset instead.
       */}
      <ScrollView
        className="flex-1"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
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
                  {Platform.OS === "web" ? (
                    <TextInput
                      className={`${inputClass} mb-0`}
                      placeholder="MM / DD / YYYY"
                      placeholderTextColor="#999999"
                      keyboardType="number-pad"
                      maxLength={SIGNUP_BIRTHDATE_DISPLAY_MAX_LEN}
                      textAlignVertical="center"
                      style={{ includeFontPadding: false }}
                      value={birthdate}
                      onChangeText={(t) => setBirthdate(formatSignupBirthdateInput(t))}
                    />
                  ) : (
                    <Pressable
                      onPress={openBirthdatePicker}
                      className="h-12 w-full flex-row items-center justify-between rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4"
                    >
                      <Text
                        className={`text-base font-medium leading-5 ${
                          birthdate ? "text-[#111111]" : "text-[#999999]"
                        }`}
                      >
                        {birthdate || "MM / DD / YYYY"}
                      </Text>
                      <Ionicons name="calendar-outline" size={22} color="#8FA3B1" />
                    </Pressable>
                  )}
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
                  {...(Platform.OS === "ios" ? { textContentType: "emailAddress" as const } : {})}
                  {...(Platform.OS === "android" ? { autoComplete: "email" as const } : {})}
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
                <View className="relative">
                  <TextInput
                    ref={signupPasswordRef}
                    className={`tbhon-auth-password ${inputClass} mb-0 pr-12`}
                    placeholder="Min. 8 characters"
                    placeholderTextColor="#999999"
                    secureTextEntry={!passwordVisible}
                    textAlignVertical="center"
                    underlineColorAndroid="transparent"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect={false}
                    {...(Platform.OS === "android" ? { autoComplete: "password-new" as const } : {})}
                    {...(Platform.OS === "ios"
                      ? {
                          textContentType: "newPassword" as const,
                          passwordRules: "minlength: 8;",
                          clearButtonMode: "never" as const,
                        }
                      : {})}
                    {...(Platform.OS === "android"
                      ? { importantForAutofill: "yes" as const }
                      : {})}
                    style={{ includeFontPadding: false }}
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      setPasswordError("");
                    }}
                  />
                  <PasswordVisibilityIcon
                    secureTextEntry={!passwordVisible}
                    onToggle={() => setPasswordVisible((v) => !v)}
                  />
                </View>
              </View>

              <View className="mb-1 sm:mb-3">
                <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#888888]">
                  Confirm password
                </Text>
                <View className="relative">
                  <TextInput
                    ref={signupConfirmPasswordRef}
                    className={`tbhon-auth-password ${inputClass} mb-0 pr-12`}
                    placeholder="Re-enter password"
                    placeholderTextColor="#999999"
                    secureTextEntry={!confirmPasswordVisible}
                    textAlignVertical="center"
                    underlineColorAndroid="transparent"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect={false}
                    {...(Platform.OS === "android" ? { autoComplete: "password" as const } : {})}
                    {...(Platform.OS === "ios"
                      ? { textContentType: "password" as const, clearButtonMode: "never" as const }
                      : {})}
                    style={{ includeFontPadding: false }}
                    value={confirmPassword}
                    onChangeText={(t) => {
                      setConfirmPassword(t);
                      setPasswordError("");
                    }}
                  />
                  <PasswordVisibilityIcon
                    secureTextEntry={!confirmPasswordVisible}
                    onToggle={() => setConfirmPasswordVisible((v) => !v)}
                  />
                </View>
              </View>

              {passwordError ? (
                <Text className="mb-1 text-xs text-red-600 sm:mb-4">{passwordError}</Text>
              ) : (
                <Text className="mb-1 text-xs text-[#888888] sm:mb-4">
                  Password must be at least 8 characters and match confirmation.
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
                  className="min-w-0 flex-1 flex-row items-center justify-center rounded-2xl bg-[#1a1a4d] py-3 sm:py-4"
                  onPress={() => void handleCreateAccount()}
                  disabled={submittingAccount}
                >
                  {submittingAccount ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text
                      className="text-base font-bold text-white"
                      style={{ letterSpacing: 0.5 }}
                    >
                      CREATE ACCOUNT
                    </Text>
                  )}
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

      {birthdatePickerOpen && Platform.OS === "android" ? (
        <DateTimePicker
          value={birthdatePickerDate}
          mode="date"
          display="default"
          onChange={onAndroidBirthdateChange}
          minimumDate={BIRTHDATE_MIN}
          maximumDate={birthdateMaximum()}
        />
      ) : null}

      <Modal
        visible={birthdatePickerOpen && Platform.OS === "ios"}
        transparent
        animationType="none"
        onRequestClose={animateIosBirthdateClose}
      >
        <View style={styles.birthdateModalRoot}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "#000000", opacity: iosBirthdateBackdropOpacity },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={animateIosBirthdateClose} />
          </Animated.View>
          <Animated.View
            style={[
              styles.birthdateSheet,
              {
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateY: iosBirthdateSheetY }],
              },
            ]}
          >
            <View className="mb-2 flex-row items-center justify-between border-b border-[#F0F0F0] pb-3">
              <Pressable onPress={animateIosBirthdateClose} hitSlop={8}>
                <Text className="text-base text-[#888888]">Cancel</Text>
              </Pressable>
              <Text className="text-base font-semibold text-[#111111]">Birthdate</Text>
              <Pressable onPress={confirmIosBirthdate} hitSlop={8}>
                <Text className="text-base font-semibold text-[#1a1a4d]">Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={birthdatePickerDate}
              mode="date"
              display="spinner"
              themeVariant="light"
              onChange={(_, d) => {
                if (d) setBirthdatePickerDate(d);
              }}
              minimumDate={BIRTHDATE_MIN}
              maximumDate={birthdateMaximum()}
            />
          </Animated.View>
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
  birthdateModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  birthdateSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
