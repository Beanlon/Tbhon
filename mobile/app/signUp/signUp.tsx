import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  type ViewStyle,
  type TextInputProps,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CachedImage from "../components/CachedImage";
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

// ─── TOKEN SYSTEM ─────────────────────────────────────────────────────────
const tk = {
  navy: "#1C1F4A",
  navyDeep: "#13163A",
  indigo: "#3B3F8C",
  violet: "#5B5FC7",
  violetLight: "#7B80E0",
  violetGlow: "rgba(91,95,199,0.13)",
  surface: "#F7F7FC",
  border: "#E2E4F3",
  textPrimary: "#1C1F4A",
  textSub: "#6B6F9C",
  textMuted: "#9498BC",
  white: "#FFFFFF",
  error: "#D94040",
  errorBg: "#FFF1F1",
  errorBorder: "#F5AAAA",
  errorGlow: "rgba(217,64,64,0.12)",
  success: "#1D9E75",
  successBg: "#F0FAF6",
  successBorder: "#7DCFB3",
};

const GENDERS = ["Male", "Female", "Intersex"] as const;
type Gender = (typeof GENDERS)[number] | "";

interface FieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  secureTextEntry?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  fieldRef?: (ref: View | null) => void;
  editable?: boolean;
  onPress?: () => void;
  error?: string;
  touched?: boolean;
  containerStyle?: ViewStyle;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  icon,
  suffix,
  keyboardType,
  secureTextEntry,
  inputRef,
  fieldRef,
  editable = true,
  onPress,
  error,
  touched,
  containerStyle,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = touched && !!error;
  const isValid = touched && !error && value.length > 0;

  const labelColor = hasError ? tk.error : focused ? tk.violet : tk.textMuted;
  const borderColor = hasError ? tk.errorBorder : focused ? tk.violetLight : isValid ? tk.successBorder : tk.border;
  const backgroundColor = hasError ? tk.errorBg : focused ? tk.white : isValid ? tk.successBg : tk.surface;

  return (
    <View ref={fieldRef} style={[styles.fieldContainer, containerStyle]} collapsable={false}>
      <Text style={[styles.fieldLabel, { color: labelColor }]}>
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        style={[
          styles.fieldBox,
          {
            borderColor,
            backgroundColor,
          },
          focused && styles.fieldBoxFocused,
          !editable && styles.fieldBoxDisabled,
        ]}
      >
        {icon ? (
          <View style={styles.fieldIcon}>
            {icon}
          </View>
        ) : null}
        <TextInput
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={tk.textMuted}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChangeText={onChange}
          style={[
            styles.fieldInput,
            { color: tk.textPrimary },
            icon ? { paddingLeft: 6 } : undefined,
            suffix || isValid ? { paddingRight: 6 } : undefined,
          ]}
          textAlignVertical="center"
          pointerEvents={editable ? "auto" : "none"}
        />
        {isValid && !suffix ? (
          <View style={styles.fieldSuffix}>
            <Ionicons name="checkmark-circle" size={20} color={tk.success} />
          </View>
        ) : suffix ? (
          <View style={styles.fieldSuffix}>{suffix}</View>
        ) : null}
      </Pressable>
      {hasError && (
        <Text style={[styles.errorText, { color: tk.error }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

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

// ─── VALIDATION ───────────────────────────────────────────────────────────
interface FormData {
  firstName: string;
  lastName: string;
  birthdate: string;
  gender: string;
  street: string;
  barangay: string;
  city: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
}
type TouchedMap = Partial<Record<keyof FormData, boolean>>;
type ErrorMap = Partial<Record<keyof FormData, string>>;

function validateStep1(f: FormData): ErrorMap {
  const e: ErrorMap = {};
  if (!f.firstName.trim()) e.firstName = "First name is required.";
  else if (f.firstName.trim().length < 2)
    e.firstName = "Must be at least 2 characters.";
  if (!f.lastName.trim()) e.lastName = "Last name is required.";
  else if (f.lastName.trim().length < 2)
    e.lastName = "Must be at least 2 characters.";
  if (!f.birthdate) e.birthdate = "Birthdate is required.";
  else {
    const age =
      (Date.now() - new Date(f.birthdate).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);
    if (age < 13) e.birthdate = "You must be at least 13 years old.";
  }
  if (!f.gender) e.gender = "Please select a gender.";
  if (!f.street.trim()) e.street = "Street address is required.";
  if (!f.barangay.trim()) e.barangay = "Barangay is required.";
  if (!f.city.trim()) e.city = "City is required.";
  return e;
}

function validateStep2(f: FormData): ErrorMap {
  const e: ErrorMap = {};
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!f.email.trim()) e.email = "Email address is required.";
  else if (!emailRe.test(f.email)) e.email = "Enter a valid email address.";
  if (!f.phone.trim()) e.phone = "Phone number is required.";
  else if (!/^9\d{9}$/.test(f.phone.replace(/\s/g, "")))
    e.phone = "Enter a valid PH mobile number.";
  if (!f.password) e.password = "Password is required.";
  else if (f.password.length < 8)
    e.password = "Password must be at least 8 characters.";
  if (!f.confirm) e.confirm = "Please confirm your password.";
  else if (f.confirm !== f.password) e.confirm = "Passwords do not match.";
  return e;
}


export default function SignUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const compactScreen = windowHeight < 760 || windowWidth < 390;
  const heroMinHeight = compactScreen
    ? Math.max(220, windowHeight * 0.22)
    : Math.max(250, windowHeight * 0.25);
  const sheetTopOverlap = compactScreen ? -18 : -24;
  const sheetPaddingHorizontal = compactScreen ? 16 : 18;
  const sheetPaddingTop = compactScreen ? 24 : 28;
  const sheetPaddingBottom = compactScreen ? 20 : 28;

  const authMarkSize = useMemo(() => {
    const d = Math.min(windowWidth, windowHeight);
    return Math.min(168, Math.max(76, Math.round(d * 0.27)));
  }, [windowWidth, windowHeight]);

  const [step, setStep] = useState<Step>(1);
  const stepTransition = useRef(new Animated.Value(1)).current;

  // Form state
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    birthdate: "",
    gender: "",
    street: "",
    barangay: "",
    city: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });

  const [touched, setTouched] = useState<TouchedMap>({});
  const [shaking, setShaking] = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);

  // UI state
  const [genderPickerOpen, setGenderPickerOpen] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [birthdatePickerOpen, setBirthdatePickerOpen] = useState(false);
  const [birthdatePickerDate, setBirthdatePickerDate] = useState(() =>
    defaultSignupBirthdateDate(),
  );
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [genderAnchor, setGenderAnchor] = useState<WindowRect | null>(null);
  const [countryAnchor, setCountryAnchor] = useState<WindowRect | null>(null);

  // Animations
  const screenEntranceOpacity = useRef(new Animated.Value(0)).current;
  const screenEntranceTranslate = useRef(new Animated.Value(40)).current;
  const iosBirthdateBackdropOpacity = useRef(new Animated.Value(0)).current;
  const iosBirthdateSheetY = useRef(new Animated.Value(IOS_BIRTHDATE_SHEET_OFFSET))
    .current;

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);
  const fieldRefsMap = useRef<Record<keyof FormData, View | null>>({
    firstName: null,
    lastName: null,
    birthdate: null,
    gender: null,
    street: null,
    barangay: null,
    city: null,
    email: null,
    phone: null,
    password: null,
    confirm: null,
  }).current;
  const genderTriggerRef = useRef<View>(null);
  const signupPasswordRef = useRef<TextInput>(null);
  const signupConfirmPasswordRef = useRef<TextInput>(null);
  useIosPasswordSecureMaskSync(signupPasswordRef, showPw, form.password);
  useIosPasswordSecureMaskSync(signupConfirmPasswordRef, showCPw, form.confirm);

  const [scrollViewportH, setScrollViewportH] = useState(0);
  const [innerContentH, setInnerContentH] = useState(0);

  const scrollEnabled = useMemo(() => {
    if (scrollViewportH <= 0 || innerContentH <= 0) return true;
    return innerContentH > scrollViewportH + SCROLL_FUDGE;
  }, [scrollViewportH, innerContentH]);

  // Field setter (NO automatic touched tracking)
  const f = (k: keyof FormData) => (v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const errors = step === 1 ? validateStep1(form) : validateStep2(form);

  const triggerShake = (keys: (keyof FormData)[]) => {
    const s: Partial<Record<keyof FormData, boolean>> = {};
    keys.forEach((k) => (s[k] = true));
    setShaking(s);
    setTimeout(() => setShaking({}), 500);
  };

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

  const countryTriggerRef = useRef<View>(null);

  const closeCountryPicker = useCallback(() => {
    setCountryPickerOpen(false);
    setCountryAnchor(null);
  }, []);

  const openCountryPicker = useCallback(() => {
    countryTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setCountryAnchor({ x, y, width, height });
      setCountryPickerOpen(true);
    });
  }, []);

  const openGenderPicker = useCallback(() => {
    fieldRefsMap.gender?.measureInWindow((x, y, width, height) => {
      setGenderAnchor({ x, y, width, height });
      setGenderPickerOpen(true);
    });
  }, []);

  const openBirthdatePicker = useCallback(() => {
    Keyboard.dismiss();
    const initial =
      birthdateStringToLocalDate(form.birthdate) ?? defaultSignupBirthdateDate();
    setBirthdatePickerDate(initial);
    if (Platform.OS === "ios") {
      iosBirthdateBackdropOpacity.setValue(0);
      iosBirthdateSheetY.setValue(IOS_BIRTHDATE_SHEET_OFFSET);
    }
    setBirthdatePickerOpen(true);
  }, [form.birthdate, iosBirthdateBackdropOpacity, iosBirthdateSheetY]);

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
        setForm((p) => ({
          ...p,
          birthdate: formatBirthdateDisplayFromDate(date),
        }));
        setTouched((p) => ({ ...p, birthdate: true }));
      }
    },
    [],
  );

  const confirmIosBirthdate = useCallback(() => {
    setForm((p) => ({
      ...p,
      birthdate: formatBirthdateDisplayFromDate(birthdatePickerDate),
    }));
    setTouched((p) => ({ ...p, birthdate: true }));
    animateIosBirthdateClose();
  }, [birthdatePickerDate, animateIosBirthdateClose]);

  const handleContinue = () => {
    const errs = validateStep1(form);
    const allKeys: (keyof FormData)[] = [
      "firstName",
      "lastName",
      "birthdate",
      "gender",
      "street",
      "barangay",
      "city",
    ];
    setTouched((p) => {
      const n = { ...p };
      allKeys.forEach((k) => (n[k] = true));
      return n;
    });
    if (Object.keys(errs).length > 0) {
      // Find first error field and scroll to it
      const firstErrorKey = allKeys.find((k) => errs[k]) as keyof FormData | undefined;
      if (firstErrorKey && fieldRefsMap[firstErrorKey]) {
        fieldRefsMap[firstErrorKey]?.measureInWindow((x, y, width, height) => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 80),
            animated: true,
          });
        });
      }
      triggerShake(Object.keys(errs) as (keyof FormData)[]);
      return;
    }
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleCreateAccount = async () => {
    const errs = validateStep2(form);
    const allKeys: (keyof FormData)[] = ["email", "phone", "password", "confirm"];
    setTouched((p) => {
      const n = { ...p };
      allKeys.forEach((k) => (n[k] = true));
      return n;
    });
    if (Object.keys(errs).length > 0) {
      // Find first error field and scroll to it
      const firstErrorKey = allKeys.find((k) => errs[k]) as keyof FormData | undefined;
      if (firstErrorKey && fieldRefsMap[firstErrorKey]) {
        fieldRefsMap[firstErrorKey]?.measureInWindow((x, y, width, height) => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 80),
            animated: true,
          });
        });
      }
      triggerShake(Object.keys(errs) as (keyof FormData)[]);
      return;
    }

    const birthIso = signupBirthdateToIso(form.birthdate);
    if (!birthIso) {
      Alert.alert(
        "Birthdate",
        "Use MM / DD / YYYY (e.g. 01 / 15 / 1995) or YYYY-MM-DD.",
      );
      return;
    }

    setSubmittingAccount(true);
    try {
      const phoneNumber = normalizePhilippineMobile(form.phone);
      const { token, user } = await postRegister({
        email: form.email.trim(),
        password: form.password,
        phoneNumber: phoneNumber ?? null,
        profile: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          birthdate: birthIso,
          gender: normalizeGenderForApi(form.gender),
          street: form.street.trim() || null,
          barangay: form.barangay.trim() || null,
          city: form.city.trim() || null,
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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(screenEntranceOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(screenEntranceTranslate, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [screenEntranceOpacity, screenEntranceTranslate]);

  useEffect(() => {
    stepTransition.setValue(0);
    Animated.timing(stepTransition, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, stepTransition]);

  const stepCardAnimation = {
    opacity: stepTransition,
    transform: [
      {
        translateY: stepTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: screenEntranceOpacity,
        transform: [{ translateY: screenEntranceTranslate }],
      }}
    >
      <SafeAreaView
        style={[styles.root, { backgroundColor: tk.navy }]}
        edges={["top", "right", "bottom", "left"]}
      >
      <ScrollView
        ref={scrollViewRef}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        scrollEnabled={scrollEnabled}
        bounces={scrollEnabled}
        alwaysBounceVertical={false}
        onLayout={onScrollViewLayout}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={scrollEnabled}
        {...(Platform.OS === "android"
          ? {
              overScrollMode: scrollEnabled
                ? ("auto" as const)
                : ("never" as const),
            }
          : {})}
      >
        <View onLayout={onInnerLayout} collapsable={false} style={styles.screenContent}>
          <View style={[styles.hero, { minHeight: heroMinHeight }]}>
            <View style={styles.heroCircleLarge} />
            <View style={styles.heroCircleSmall} />
            <View style={styles.heroTitleRow}>
              <CachedImage
                source={require("../../assets/images/Tbhon assets/TBhon icon.png")}
                style={{ width: authMarkSize, height: authMarkSize }}
                resizeMode="contain"
              />
              <View style={styles.heroTitleText}>
                <Text style={styles.heroTitle}>Create Account</Text>
                <Text style={styles.heroSubtitle}>TBHON Health Platform</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              {[
                { n: 1 as const, label: "Personal Info" },
                { n: 2 as const, label: "Account Setup" },
              ].map((item) => {
                const active = step === item.n;
                const completed = step > item.n;
                return (
                  <View
                    key={item.n}
                    style={[
                      styles.stepPill,
                      active && styles.stepPillActive,
                      completed && styles.stepPillComplete,
                      { flex: active ? 1.2 : 1 },
                    ]}
                  >
                    <View
                      style={[
                        styles.stepDot,
                        active && styles.stepDotActive,
                        completed && styles.stepDotComplete,
                      ]}
                    >
                      {completed ? (
                        <Ionicons
                          name="checkmark"
                          size={12}
                          color={active ? tk.navy : tk.violet}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.stepDotText,
                            active && styles.stepDotTextActive,
                          ]}
                        >
                          {item.n}
                        </Text>
                      )}
                    </View>
                    {active ? (
                      <Text style={styles.stepPillLabel}>{item.label}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>

          <View
            style={[
              styles.cardContainer,
              {
                marginTop: sheetTopOverlap,
                paddingHorizontal: sheetPaddingHorizontal,
                paddingTop: sheetPaddingTop,
                paddingBottom: sheetPaddingBottom,
              },
            ]}
          >
            <Animated.View style={[styles.stepCard, stepCardAnimation]}>
              {step === 1 && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, { color: tk.textPrimary }]}>
                    Personal Info
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: tk.textSub }]}>
                    Tell us a little about yourself.
                  </Text>

                  <Field
                    label="First Name"
                    placeholder="Maria"
                    value={form.firstName}
                    onChange={f("firstName")}
                    fieldRef={(el) => { fieldRefsMap.firstName = el; }}
                    icon={
                      <Ionicons
                        name="person-outline"
                        size={17}
                        color={
                          touched.firstName && errors.firstName
                            ? tk.error
                            : tk.violet
                        }
                      />
                    }
                    error={errors.firstName}
                    touched={touched.firstName}
                  />

                  <Field
                    label="Last Name"
                    placeholder="Santos"
                    value={form.lastName}
                    onChange={f("lastName")}
                    fieldRef={(el) => { fieldRefsMap.lastName = el; }}
                    icon={
                      <Ionicons
                        name="person-outline"
                        size={17}
                        color={
                          touched.lastName && errors.lastName
                            ? tk.error
                            : tk.violet
                        }
                      />
                    }
                    error={errors.lastName}
                    touched={touched.lastName}
                  />

                  <Field
                    label="Birthdate"
                    placeholder="MM / DD / YYYY"
                    value={form.birthdate}
                    onChange={(t) =>
                      f("birthdate")(formatSignupBirthdateInput(t))
                    }
                    fieldRef={(el) => { fieldRefsMap.birthdate = el; }}
                    icon={
                      <Ionicons
                        name="calendar-outline"
                        size={17}
                        color={
                          touched.birthdate && errors.birthdate
                            ? tk.error
                            : tk.violet
                        }
                      />
                    }
                    editable={false}
                    onPress={openBirthdatePicker}
                    error={errors.birthdate}
                    touched={touched.birthdate}
                  />

                  <Field
                    label="Sex"
                    placeholder="Select"
                    value={form.gender}
                    onChange={f("gender")}
                    fieldRef={(el) => { fieldRefsMap.gender = el; }}
                    suffix={<Ionicons name="chevron-down" size={18} color={tk.violet} />}
                    icon={
                      <Ionicons
                        name="transgender-outline"
                        size={17}
                        color={
                          touched.gender && errors.gender
                            ? tk.error
                            : tk.violet
                        }
                      />
                    }
                    editable={false}
                    onPress={openGenderPicker}
                    error={errors.gender}
                    touched={touched.gender}
                  />

                  <Field
                    label="Street Address"
                    placeholder="123 Magsaysay Ave."
                    value={form.street}
                    onChange={f("street")}
                    fieldRef={(el) => { fieldRefsMap.street = el; }}
                    icon={
                      <Ionicons
                        name="home-outline"
                        size={17}
                        color={
                          touched.street && errors.street ? tk.error : tk.violet
                        }
                      />
                    }
                    error={errors.street}
                    touched={touched.street}
                  />

                  <Field
                    label="Barangay"
                    placeholder="Pinyahan"
                    value={form.barangay}
                    onChange={f("barangay")}
                    fieldRef={(el) => { fieldRefsMap.barangay = el; }}
                    icon={
                      <Ionicons
                        name="location-outline"
                        size={17}
                        color={
                          touched.barangay && errors.barangay
                            ? tk.error
                            : tk.violet
                        }
                      />
                    }
                    error={errors.barangay}
                    touched={touched.barangay}
                  />

                  <Field
                    label="City"
                    placeholder="Davao City"
                    value={form.city}
                    onChange={f("city")}
                    fieldRef={(el) => { fieldRefsMap.city = el; }}
                    icon={
                      <Ionicons
                        name="location-outline"
                        size={17}
                        color={
                          touched.city && errors.city ? tk.error : tk.violet
                        }
                      />
                    }
                    error={errors.city}
                    touched={touched.city}
                  />

                  <Pressable
                    style={[
                      styles.primaryButton,
                      { backgroundColor: tk.navy },
                    ]}
                    onPress={handleContinue}
                  >
                    <Text
                      style={[
                        styles.primaryButtonText,
                        { color: tk.white },
                      ]}
                    >
                      CONTINUE
                    </Text>
                    <Ionicons name="arrow-forward" size={17} color={tk.white} />
                  </Pressable>

                  <View style={styles.subtleRow}>
                    <Text style={[styles.subtleText, { color: tk.textSub }]}>
                      Already have an account?{" "}
                    </Text>
                    <Pressable onPress={() => router.push("/login/login")}>
                      <Text style={[styles.subtleLink, { color: tk.violet }]}>
                        Log In
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {step === 2 && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, { color: tk.textPrimary }]}>
                    Account Setup
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: tk.textSub }]}>
                    Secure your TBHON account.
                  </Text>

                  <Field
                    label="Email Address"
                    placeholder="maria@email.com"
                    value={form.email}
                    onChange={f("email")}
                    fieldRef={(el) => { fieldRefsMap.email = el; }}
                    keyboardType="email-address"
                    icon={
                      <Ionicons
                        name="mail-outline"
                        size={17}
                        color={
                          touched.email && errors.email ? tk.error : tk.violet
                        }
                      />
                    }
                    error={errors.email}
                    touched={touched.email}
                  />

                  <View style={styles.phoneFieldGroup}>
                    <Text style={[styles.fieldLabel, { color: tk.textMuted, marginBottom: 12 }]}>Mobile number</Text>
                    <View style={styles.phoneRowContainer}>
                      <Pressable
                        ref={countryTriggerRef}
                        onPress={openCountryPicker}
                        style={[
                          styles.countryChip,
                          { borderColor: tk.border, backgroundColor: tk.surface },
                        ]}
                      >
                        <Text
                          style={[
                            styles.countryChipText,
                            { color: tk.textPrimary },
                          ]}
                        >
                          PH +63
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={tk.textMuted} style={{ marginLeft: 8 }} />
                      </Pressable>

                      <Field
                        label=""
                        placeholder="9XX XXX XXXX"
                        value={form.phone}
                        onChange={f("phone")}
                        fieldRef={(el) => { fieldRefsMap.phone = el; }}
                        keyboardType="phone-pad"
                        icon={
                          <Ionicons
                            name="call-outline"
                            size={17}
                            color={
                              touched.phone && errors.phone ? tk.error : tk.violet
                            }
                          />
                        }
                        error={errors.phone}
                        touched={touched.phone}
                        containerStyle={styles.phoneFieldInline}
                      />
                    </View>
                  </View>

                  <Field
                    label="Password"
                    placeholder="Minimum 8 characters"
                    value={form.password}
                    onChange={f("password")}
                    fieldRef={(el) => { fieldRefsMap.password = el; }}
                    secureTextEntry={!showPw}
                    inputRef={signupPasswordRef}
                    icon={
                      <Ionicons
                        name="lock-closed-outline"
                        size={17}
                        color={
                          touched.password && errors.password
                            ? tk.error
                            : tk.violet
                        }
                      />
                    }
                    suffix={
                      <Pressable
                        onPress={() => setShowPw((v) => !v)}
                        style={styles.passwordToggle}
                        hitSlop={10}
                      >
                        <Ionicons
                          name={showPw ? "eye-outline" : "eye-off-outline"}
                          size={20}
                          color={tk.textMuted}
                        />
                      </Pressable>
                    }
                    error={errors.password}
                    touched={touched.password}
                  />

                  <View style={styles.passwordHintsContainer}>
                    <Text style={[styles.passwordHintLabel, { color: tk.textMuted }]}>Password requirements:</Text>
                    <View style={styles.passwordHintRow}>
                      <Text style={[styles.passwordHintIcon, { color: form.password.length >= 8 ? tk.success : tk.textMuted }]}>✓</Text>
                      <Text style={[styles.passwordHintText, { color: form.password.length >= 8 ? tk.success : tk.textMuted }]}>Minimum 8 characters</Text>
                    </View>
                    <View style={styles.passwordHintRow}>
                      <Text style={[styles.passwordHintIcon, { color: /[A-Z]/.test(form.password) ? tk.success : tk.textMuted }]}>✓</Text>
                      <Text style={[styles.passwordHintText, { color: /[A-Z]/.test(form.password) ? tk.success : tk.textMuted }]}>1 capital letter</Text>
                    </View>
                    <View style={styles.passwordHintRow}>
                      <Text style={[styles.passwordHintIcon, { color: /[!@#$%^&*]/.test(form.password) ? tk.success : tk.textMuted }]}>✓</Text>
                      <Text style={[styles.passwordHintText, { color: /[!@#$%^&*]/.test(form.password) ? tk.success : tk.textMuted }]}>1 special character</Text>
                    </View>
                  </View>

                  <Field
                    label="Confirm Password"
                    placeholder="Re-enter your password"
                    value={form.confirm}
                    onChange={f("confirm")}
                    fieldRef={(el) => { fieldRefsMap.confirm = el; }}
                    secureTextEntry={!showCPw}
                    inputRef={signupConfirmPasswordRef}
                    icon={
                      <Ionicons
                        name="lock-closed-outline"
                        size={17}
                        color={
                          touched.confirm && errors.confirm
                            ? tk.error
                            : tk.violet
                        }
                      />
                    }
                    suffix={
                      <Pressable
                        onPress={() => setShowCPw((v) => !v)}
                        style={styles.passwordToggle}
                        hitSlop={10}
                      >
                        <Ionicons
                          name={showCPw ? "eye-outline" : "eye-off-outline"}
                          size={20}
                          color={tk.textMuted}
                        />
                      </Pressable>
                    }
                    error={errors.confirm}
                    touched={touched.confirm}
                  />

                  <View style={styles.buttonRow}>
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        { borderColor: tk.border },
                      ]}
                      onPress={handleBack}
                    >
                      <Ionicons
                        name="arrow-back"
                        size={17}
                        color={tk.textSub}
                      />
                      <Text
                        style={[
                          styles.secondaryButtonText,
                          { color: tk.textSub },
                        ]}
                      >
                        Back
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.primaryButton,
                        styles.primaryButtonGrow,
                        { backgroundColor: tk.navy },
                      ]}
                      onPress={() => void handleCreateAccount()}
                      disabled={submittingAccount}
                    >
                      {submittingAccount ? (
                        <ActivityIndicator color={tk.white} />
                      ) : (
                        <Text
                          style={[
                            styles.primaryButtonText,
                            { color: tk.white },
                          ]}
                        >
                          CREATE ACCOUNT
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}

              {step === 3 && (
                <View style={styles.successSection}>
                  <View
                    style={[
                      styles.successBadge,
                      { backgroundColor: `${tk.success}18` },
                    ]}
                  >
                    <Ionicons name="checkmark" size={32} color={tk.success} />
                  </View>
                  <Text style={[styles.successTitle, { color: tk.textPrimary }]}>
                    Account Created!
                  </Text>
                  <Text style={[styles.successSubtitle, { color: tk.textSub }]}>
                    Welcome to TBHON. Your health companion is ready.
                  </Text>
                  <Pressable
                    style={[
                      styles.primaryButton,
                      { backgroundColor: tk.navy },
                    ]}
                    onPress={handleGetStarted}
                  >
                    <Text
                      style={[
                        styles.primaryButtonText,
                        { color: tk.white },
                      ]}
                    >
                      GET STARTED
                    </Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          </View>
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
                const menuW = Math.max(maxW, 170);
                if (left + menuW > winW - pad) {
                  left = Math.max(pad, winW - pad - menuW);
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
                        width: menuW,
                        borderColor: tk.border,
                        backgroundColor: tk.white,
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
                          f("gender")(g);
                          closeGenderPicker();
                        }}
                        style={{
                          paddingHorizontal: 12,
                          minHeight: GENDER_ROW_H,
                          justifyContent: "center",
                          borderBottomWidth:
                            idx === GENDERS.length - 1 ? 0 : 1,
                          borderBottomColor: tk.border,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text style={{ color: tk.textPrimary, fontSize: 16 }}>
                            {g}
                          </Text>
                          {form.gender === g ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color={tk.navy}
                            />
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                );
              })()}
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={countryPickerOpen}
        transparent
        animationType="none"
        onRequestClose={closeCountryPicker}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeCountryPicker} />
          {countryAnchor ? (
            <View pointerEvents="box-none" style={styles.menuLayer}>
              {(() => {
                const { width: winW, height: winH } = Dimensions.get("window");
                const pad = 8;
                const gap = 6;
                let left = countryAnchor.x;
                const maxW = countryAnchor.width;
                const menuW = Math.max(maxW, 170);
                if (left + menuW > winW - pad) {
                  left = Math.max(pad, winW - pad - menuW);
                }
                const countryMenuHeight = GENDER_ROW_H;
                const belowY = countryAnchor.y + countryAnchor.height + gap;
                const aboveY = countryAnchor.y - countryMenuHeight - gap;
                const roomBelow = winH - belowY - pad;
                const openUpward = roomBelow < countryMenuHeight && aboveY >= pad;
                const top = openUpward ? aboveY : belowY;
                return (
                  <View
                    style={[
                      styles.dropdownMenu,
                      {
                        left,
                        top,
                        width: menuW,
                        borderColor: tk.border,
                        backgroundColor: tk.white,
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
                    <Pressable
                      onPress={closeCountryPicker}
                      style={{
                        paddingHorizontal: 12,
                        minHeight: GENDER_ROW_H,
                        justifyContent: "center",
                        borderBottomWidth: 0,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={{ color: tk.textPrimary, fontSize: 16 }}>
                          Philippines
                        </Text>
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={tk.navy}
                        />
                      </View>
                    </Pressable>
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
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={animateIosBirthdateClose}
            />
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
            <View
              style={{
                marginBottom: 8,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: tk.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Pressable onPress={animateIosBirthdateClose} hitSlop={8}>
                <Text style={{ fontSize: 16, color: tk.textMuted }}>Cancel</Text>
              </Pressable>
              <Text
                style={{ fontSize: 16, fontWeight: "600", color: tk.textPrimary }}
              >
                Birthdate
              </Text>
              <Pressable onPress={confirmIosBirthdate} hitSlop={8}>
                <Text
                  style={{ fontSize: 16, fontWeight: "600", color: tk.navy }}
                >
                  Done
                </Text>
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tk.navy,
  },
  screenContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  hero: {
    position: "relative",
    paddingVertical: 24,
    paddingHorizontal: 18,
    paddingBottom: 28,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: tk.navy,
    overflow: "hidden",
  },
  heroCircleLarge: {
    position: "absolute",
    top: -24,
    right: -34,
    width: 172,
    height: 172,
    borderRadius: 86,
    backgroundColor: tk.violetGlow,
    display: "none",
  },
  heroCircleSmall: {
    position: "absolute",
    top: 18,
    right: 22,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(91, 91, 199, 0.14)",
    display: "none",
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  heroTitleText: {
    marginLeft: 14,
    flex: 1,
  },
  heroTitle: {
    color: tk.white,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 13,
    marginTop: 6,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepProgressLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: tk.violetLight,
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    minHeight: 36,
    justifyContent: "center",
    marginRight: 10,
  },
  stepPillActive: {
    backgroundColor: tk.violetLight,
  },
  stepPillComplete: {
    backgroundColor: tk.white,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  stepDotActive: {
    backgroundColor: tk.white,
  },
  stepDotComplete: {
    backgroundColor: tk.white,
  },
  stepDotText: {
    color: tk.white,
    fontSize: 12,
    fontWeight: "700",
  },
  stepDotTextActive: {
    color: tk.navy,
  },
  stepPillLabel: {
    color: tk.white,
    marginLeft: 10,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  cardContainer: {
    flex: 1,
    backgroundColor: tk.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginTop: -28,
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 18,
    minHeight: 420,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
  },
  stepCard: {
    width: "100%",
  },
  stepSummary: {
    textAlign: "center",
    color: tk.textSub,
    fontSize: 14,
    marginBottom: 16,
  },
  stepSummaryAccent: {
    color: tk.violet,
    fontWeight: "700",
  },
  formSection: {
    width: "100%",
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: tk.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: tk.textSub,
    fontSize: 14,
    marginBottom: 20,
  },
  rowSplit: {
    flexDirection: "column",
    marginBottom: 0,
  },
  halfField: {
    flex: 1,
    marginRight: 0,
  },
  phoneRowContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 20,
  },
  phoneFieldInline: {
    flex: 1,
    marginBottom: 0,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    color: tk.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  fieldBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tk.border,
    backgroundColor: tk.surface,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 14,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  fieldBoxFocused: {
    borderColor: tk.violetLight,
    backgroundColor: tk.white,
    shadowColor: tk.violet,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 3,
  },
  fieldBoxDisabled: {
    backgroundColor: "#EEF2FF",
  },
  fieldInput: {
    height: 50,
    paddingVertical: 0,
    fontSize: 15,
    color: tk.textPrimary,
    flex: 1,
  },
  fieldIcon: {
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  fieldSuffix: {
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: tk.error,
    fontSize: 12,
    marginTop: 6,
    fontWeight: "500",
  },
  primaryButton: {
    backgroundColor: tk.navy,
    borderRadius: 24,
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 28,
    minWidth: 170,
  },
  primaryButtonGrow: {
    flex: 1,
    marginLeft: 12,
  },
  primaryButtonText: {
    color: tk.white,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: tk.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: tk.border,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  secondaryButtonText: {
    color: tk.textSub,
    fontSize: 15,
    fontWeight: "700",
  },
  phoneFieldGroup: {
    marginBottom: 20,
  },
  phoneFieldInline: {
    flex: 1,
    marginBottom: 0,
  },
  countryChip: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: tk.surface,
    borderWidth: 1.5,
    borderColor: tk.border,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 50,
    flexDirection: "row",
    gap: 8,
    minWidth: 110,
  },
  countryChipText: {
    color: tk.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  subtleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 16,
  },
  passwordHintsContainer: {
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: tk.surface,
    borderRadius: 12,
  },
  passwordHintLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  passwordHintRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  passwordHintIcon: {
    fontSize: 14,
    fontWeight: "700",
    marginRight: 6,
  },
  passwordHintText: {
    fontSize: 12,
    fontWeight: "500",
  },
  passwordToggle: {
    justifyContent: "center",
    alignItems: "center",
    height: 50,
    width: 34,
  },
  subtleText: {
    color: tk.textSub,
    fontSize: 14,
  },
  subtleLink: {
    color: tk.violet,
    fontSize: 14,
    fontWeight: "700",
  },
  helpText: {
    color: tk.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  successSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: tk.successBorder,
    backgroundColor: tk.successBg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: tk.textPrimary,
    marginBottom: 12,
  },
  successSubtitle: {
    color: tk.textSub,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
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
    backgroundColor: tk.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tk.border,
    overflow: "hidden",
  },
  birthdateModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  birthdateSheet: {
    backgroundColor: tk.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
