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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
  type TextInputProps,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { useFocusEffect } from "@react-navigation/native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CachedImage from "../components/CachedImage";
import { TBHON_LOGO } from "../../constants/branding";
import { getBrandLogoLayout } from "../../utils/brandLogoLayout";
import { palette } from "../../constants/palette";
import { useNavigation, useRouter } from "expo-router";
import { resetAfterAuth } from "../../utils/authNavigation";
import { onUnverifiedAccountSession } from "../../services/unverifiedEngagementNotifications";
import { ApiError, postRegister, postValidateFacilityInvite } from "../../services/backendApi";
import { saveAuthSession } from "../../utils/authStorage";
import { setCachedProfile } from "../../utils/profileCache";
import { useIosPasswordSecureMaskSync } from "../../utils/useIosPasswordSecureMaskSync";
import {
  birthdateStringToLocalDate,
  defaultSignupBirthdateDate,
  formatBirthdateDisplayFromDate,
  formatSignupBirthdateInput,
  normalizeGenderForApi,
  normalizeSignupMobile,
  SIGNUP_BIRTHDATE_DISPLAY_MAX_LEN,
  signupBirthdateToIso,
  signupEmailValidationError,
} from "../../utils/signupHelpers";
import {
  SIGNUP_PASSWORD_REQUIREMENTS,
  signupPasswordValidationError,
} from "../../utils/passwordPolicy";
import {
  STAFF_SIGNUP_CALLOUT,
  STAFF_SIGNUP_PATIENT_CTA,
  STAFF_SIGNUP_SUBTITLE,
  STAFF_SIGNUP_TITLE,
} from "../../constants/patientAccess";

// ─── Sign-up white screen + dark form card ───────────────────────────────
const tk = {
  screenBg: "#FFFFFF",
  cardBg: palette.signupBg,
  heroTitle: palette.deepNavy,
  heroSub: "#5C6294",
  navy: palette.navy,
  navyDeep: palette.deepNavy,
  indigo: palette.indigo,
  violet: palette.softViolet,
  violetLight: palette.lavender,
  violetGlow: "rgba(123, 111, 216, 0.14)",
  textPrimary: "#FFFFFF",
  textSub: "rgba(255, 255, 255, 0.76)",
  textMuted: "rgba(255, 255, 255, 0.52)",
  fieldLabel: "#FFFFFF",
  icon: palette.lavender,
  selectionColor: "rgba(255, 255, 255, 0.28)",
  cursorColor: palette.lavender,
  surface: "rgba(255, 255, 255, 0.09)",
  fieldFocusedBg: "rgba(255, 255, 255, 0.14)",
  border: "rgba(255, 255, 255, 0.22)",
  dropdownBg: "#2E3272",
  dropdownBorder: "rgba(255, 255, 255, 0.18)",
  white: "#FFFFFF",
  primaryBtnBg: palette.lavender,
  primaryBtnText: palette.deepNavy,
  error: "#FF8A8A",
  errorBg: "rgba(217, 64, 64, 0.18)",
  errorBorder: "#FF9B9B",
  errorGlow: "rgba(217, 64, 64, 0.2)",
  success: "#5DD4A8",
  successBg: "rgba(29, 158, 117, 0.2)",
  successBorder: "#5DD4A8",
  secondaryBtnBg: "rgba(255, 255, 255, 0.1)",
  secondaryBtnBorder: "rgba(255, 255, 255, 0.28)",
};

import { PROFILE_GENDER_OPTIONS } from "../../constants/profileGender";

type Gender = (typeof PROFILE_GENDER_OPTIONS)[number] | "";

const SIGNUP_STEP_NUMBERS = [1, 2] as const;
const SIGNUP_STEP_COUNT = SIGNUP_STEP_NUMBERS.length;

type Country = {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  placeholder: string;
  invalidMessage: string;
  validate: (digits: string) => boolean;
};

const COUNTRIES: readonly Country[] = [
  {
    name: "Philippines",
    code: "PH",
    dialCode: "+63",
    flag: "🇵🇭",
    placeholder: "9XX XXX XXXX",
    invalidMessage: "Enter a valid Philippine mobile number.",
    validate: (d) => /^9\d{9}$/.test(d),
  },
  {
    name: "United States",
    code: "US",
    dialCode: "+1",
    flag: "🇺🇸",
    placeholder: "(555) 555-5555",
    invalidMessage: "Enter a valid 10-digit US number.",
    validate: (d) => /^\d{10}$/.test(d),
  },
  {
    name: "Canada",
    code: "CA",
    dialCode: "+1",
    flag: "🇨🇦",
    placeholder: "(555) 555-5555",
    invalidMessage: "Enter a valid 10-digit Canadian number.",
    validate: (d) => /^\d{10}$/.test(d),
  },
  {
    name: "United Kingdom",
    code: "GB",
    dialCode: "+44",
    flag: "🇬🇧",
    placeholder: "7XXX XXXXXX",
    invalidMessage: "Enter a valid UK mobile number.",
    validate: (d) => /^7\d{9}$/.test(d),
  },
  {
    name: "Australia",
    code: "AU",
    dialCode: "+61",
    flag: "🇦🇺",
    placeholder: "4XX XXX XXX",
    invalidMessage: "Enter a valid Australian mobile number.",
    validate: (d) => /^4\d{8}$/.test(d),
  },
  {
    name: "Singapore",
    code: "SG",
    dialCode: "+65",
    flag: "🇸🇬",
    placeholder: "8XXX XXXX",
    invalidMessage: "Enter a valid Singapore mobile number.",
    validate: (d) => /^[89]\d{7}$/.test(d),
  },
  {
    name: "Malaysia",
    code: "MY",
    dialCode: "+60",
    flag: "🇲🇾",
    placeholder: "1X XXX XXXX",
    invalidMessage: "Enter a valid Malaysian mobile number.",
    validate: (d) => /^1\d{8,9}$/.test(d),
  },
  {
    name: "Thailand",
    code: "TH",
    dialCode: "+66",
    flag: "🇹🇭",
    placeholder: "8X XXX XXXX",
    invalidMessage: "Enter a valid Thai mobile number.",
    validate: (d) => /^[689]\d{8}$/.test(d),
  },
  {
    name: "Vietnam",
    code: "VN",
    dialCode: "+84",
    flag: "🇻🇳",
    placeholder: "9XX XXX XXXX",
    invalidMessage: "Enter a valid Vietnamese mobile number.",
    validate: (d) => /^[35789]\d{8}$/.test(d),
  },
  {
    name: "Indonesia",
    code: "ID",
    dialCode: "+62",
    flag: "🇮🇩",
    placeholder: "8XX XXXX XXXX",
    invalidMessage: "Enter a valid Indonesian mobile number.",
    validate: (d) => /^8\d{9,11}$/.test(d),
  },
];

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
  onBlur?: () => void;
  autoCapitalize?: React.ComponentProps<typeof TextInput>["autoCapitalize"];
  autoCorrect?: boolean;
  autoComplete?: React.ComponentProps<typeof TextInput>["autoComplete"];
  textContentType?: React.ComponentProps<typeof TextInput>["textContentType"];
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
  onBlur: onBlurProp,
  autoCapitalize,
  autoCorrect,
  autoComplete,
  textContentType,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = touched && !!error;
  const isValid = touched && !error && value.length > 0;

  const labelColor = hasError ? tk.error : tk.fieldLabel;
  const borderColor = hasError ? tk.errorBorder : focused ? tk.violetLight : isValid ? tk.successBorder : tk.border;
  const backgroundColor = hasError
    ? tk.errorBg
    : focused
      ? tk.fieldFocusedBg
      : isValid
        ? tk.successBg
        : tk.surface;

  return (
    <View ref={fieldRef} style={[styles.fieldContainer, containerStyle]} collapsable={false}>
      {label ? (
        <Text style={[styles.fieldLabel, { color: labelColor }]}>
          {label}
        </Text>
      ) : null}
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
          selectionColor={tk.selectionColor}
          cursorColor={tk.cursorColor}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          editable={editable}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          underlineColorAndroid="transparent"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlurProp?.();
          }}
          onChangeText={onChange}
          style={[
            styles.fieldInput,
            { color: tk.textPrimary, backgroundColor: "transparent" },
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
const genderMenuHeight = GENDER_ROW_H * PROFILE_GENDER_OPTIONS.length;

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
  facilityInviteCode: string;
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

function validateStep2(f: FormData, country: Country): ErrorMap {
  const e: ErrorMap = {};
  const code = f.facilityInviteCode.trim().replace(/\s+/g, "");
  if (!code) e.facilityInviteCode = "Facility invite code is required.";
  else if (!/^[A-Za-z0-9-]{6,64}$/.test(code)) {
    e.facilityInviteCode = "Use 6–64 letters, numbers, or hyphens (e.g. RHU-MALAY-2026).";
  }
  const emailError = signupEmailValidationError(f.email);
  if (emailError) e.email = emailError;
  const phoneDigits = f.phone.replace(/\D/g, "");
  if (!f.phone.trim()) e.phone = "Phone number is required.";
  else if (!country.validate(phoneDigits)) {
    e.phone = `${country.invalidMessage} Expected ${country.dialCode} ${country.placeholder}.`;
  }
  const passwordError = signupPasswordValidationError(f.password);
  if (passwordError) e.password = passwordError;
  if (!f.confirm) e.confirm = "Please confirm your password.";
  else if (f.confirm !== f.password) e.confirm = "Passwords do not match.";
  return e;
}


export default function SignUp() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const compactScreen = windowHeight < 760 || windowWidth < 390;
  const sheetPaddingHorizontal = compactScreen ? 16 : 18;
  const sheetPaddingTop = compactScreen ? 22 : 26;
  const sheetPaddingBottom = compactScreen ? 22 : 28;

  const brandLogo = useMemo(() => {
    const layout = getBrandLogoLayout(windowHeight, windowWidth, 40);
    return {
      ...layout,
      topMargin: Math.max(12, layout.topMargin - 14),
    };
  }, [windowHeight, windowWidth]);

  /** Scroll offset where the dark form card reaches the status bar region. */
  const statusBarThreshold = useMemo(
    () =>
      Math.max(
        0,
        brandLogo.topMargin + brandLogo.boxWidth + brandLogo.bottomMargin + 8,
      ),
    [brandLogo],
  );

  const [statusBarStyle, setStatusBarStyle] = useState<"light" | "dark">("dark");

  const scrollContentStyle = useMemo(
    () => ({
      flexGrow: 1,
      paddingTop: insets.top + 4,
      paddingBottom: insets.bottom + 28,
    }),
    [insets.top, insets.bottom],
  );

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
    facilityInviteCode: "",
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
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]);
  const [birthdatePickerOpen, setBirthdatePickerOpen] = useState(false);
  const [birthdatePickerDate, setBirthdatePickerDate] = useState(() =>
    defaultSignupBirthdateDate(),
  );
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [validatedFacilityName, setValidatedFacilityName] = useState<string | null>(null);
  const [facilityInviteValidationError, setFacilityInviteValidationError] = useState<string | null>(null);
  const [validatingInvite, setValidatingInvite] = useState(false);
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
    facilityInviteCode: null,
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

  const f = (k: keyof FormData) => (v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (k === "facilityInviteCode") {
      setValidatedFacilityName(null);
      setFacilityInviteValidationError(null);
    }
  };

  const validateInviteCode = useCallback(async (): Promise<boolean> => {
    const code = form.facilityInviteCode.trim().replace(/\s+/g, "");
    if (!code || !/^[A-Za-z0-9-]{6,64}$/.test(code)) {
      setValidatedFacilityName(null);
      setFacilityInviteValidationError(null);
      return false;
    }
    setValidatingInvite(true);
    try {
      const { facility } = await postValidateFacilityInvite(code);
      setValidatedFacilityName(facility.name);
      setFacilityInviteValidationError(null);
      return true;
    } catch {
      setValidatedFacilityName(null);
      setFacilityInviteValidationError("No facility found for this invite code.");
      return false;
    } finally {
      setValidatingInvite(false);
    }
  }, [form.facilityInviteCode]);

  const touchField = (k: keyof FormData) => () => {
    setTouched((p) => ({ ...p, [k]: true }));
  };

  const errors =
    step === 1 ? validateStep1(form) : validateStep2(form, selectedCountry);
  const facilityInviteError = errors.facilityInviteCode ?? facilityInviteValidationError ?? undefined;

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

  const applySystemChrome = useCallback((onDarkBackdrop: boolean) => {
    const statusStyle = onDarkBackdrop ? "light" : "dark";
    setStatusBarStyle((prev) => (prev === statusStyle ? prev : statusStyle));
    if (Platform.OS === "android") {
      void NavigationBar.setButtonStyleAsync(statusStyle).catch(() => {});
    }
  }, []);

  const onSignupScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      applySystemChrome(y >= statusBarThreshold);
    },
    [applySystemChrome, statusBarThreshold],
  );

  useFocusEffect(
    useCallback(() => {
      applySystemChrome(false);
      return () => {
        if (Platform.OS === "android") {
          void NavigationBar.setButtonStyleAsync("dark").catch(() => {});
        }
      };
    }, [applySystemChrome]),
  );

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
    const errs = validateStep2(form, selectedCountry);
    const allKeys: (keyof FormData)[] = ["email", "phone", "password", "confirm", "facilityInviteCode"];
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

    const inviteValid = await validateInviteCode();
    if (!inviteValid) {
      triggerShake(["facilityInviteCode"]);
      fieldRefsMap.facilityInviteCode?.measureInWindow((x, y) => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, y - 80),
          animated: true,
        });
      });
      return;
    }

    setSubmittingAccount(true);
    try {
      const phoneNumber = normalizeSignupMobile(
        form.phone,
        selectedCountry.dialCode,
      );
      const { accessToken, refreshToken, token, user } = await postRegister({
        email: form.email.trim(),
        password: form.password,
        phoneNumber: phoneNumber ?? null,
        facilityInviteCode: form.facilityInviteCode.trim(),
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
      await saveAuthSession(accessToken ?? token, refreshToken);
      setCachedProfile(user);
      void onUnverifiedAccountSession(user);
      resetAfterAuth(navigation);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not reach the server. Please check your internet connection.";
      Alert.alert("Create account failed", message);
    } finally {
      setSubmittingAccount(false);
    }
  };

  const handleGetStarted = () => {
    resetAfterAuth(navigation);
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
        style={[styles.root, { backgroundColor: tk.screenBg }]}
        edges={["left", "right"]}
      >
      <StatusBar style={statusBarStyle} translucent backgroundColor="transparent" />
      <ScrollView
        ref={scrollViewRef}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        scrollEnabled={scrollEnabled}
        bounces={scrollEnabled}
        alwaysBounceVertical={false}
        onLayout={onScrollViewLayout}
        onScroll={onSignupScroll}
        scrollEventThrottle={16}
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...(Platform.OS === "android"
          ? {
              overScrollMode: scrollEnabled
                ? ("auto" as const)
                : ("never" as const),
            }
          : {})}
      >
        <View onLayout={onInnerLayout} collapsable={false} style={styles.screenContent}>
          <View
            style={[
              styles.heroBrand,
              {
                marginTop: brandLogo.topMargin,
                marginBottom: brandLogo.bottomMargin,
              },
            ]}
          >
            <View style={[styles.logoBox, { width: brandLogo.boxWidth }]}>
              <CachedImage source={TBHON_LOGO} style={styles.logoImage} resizeMode="contain" />
            </View>
          </View>

          <View
            style={[
              styles.cardContainer,
              {
                marginTop: 4,
                paddingHorizontal: sheetPaddingHorizontal,
                paddingTop: sheetPaddingTop,
                paddingBottom: sheetPaddingBottom,
              },
            ]}
          >
            <Text style={styles.signupHeading}>{STAFF_SIGNUP_TITLE}</Text>
            <Text style={styles.signupSubheading}>{STAFF_SIGNUP_SUBTITLE}</Text>
            <View style={styles.patientRedirect}>
              <Text style={styles.patientRedirectText}>
                {STAFF_SIGNUP_CALLOUT}{" "}
                <Text
                  style={styles.patientRedirectLink}
                  onPress={() => router.push("/patient/access" as never)}
                >
                  {STAFF_SIGNUP_PATIENT_CTA}
                </Text>
              </Text>
            </View>

            {step <= SIGNUP_STEP_COUNT ? (
              <View style={styles.stepProgress}>
                <View style={styles.stepBarRow}>
                  {SIGNUP_STEP_NUMBERS.map((n) => {
                    const active = step >= n;
                    return (
                      <View
                        key={n}
                        style={[
                          styles.stepBarSegmentWrap,
                          active && styles.stepBarSegmentGlow,
                        ]}
                      >
                        <View
                          style={[
                            styles.stepBarSegment,
                            active && styles.stepBarSegmentActive,
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <Animated.View style={[styles.stepCard, stepCardAnimation]}>
              {step === 1 && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, { color: tk.textPrimary }]}>
                    Personal Info
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: tk.textSub }]}>
                    Your details as the booth operator — not the person being screened.
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
                            : tk.icon
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
                            : tk.icon
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
                            : tk.icon
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
                    suffix={<Ionicons name="chevron-down" size={18} color={tk.icon} />}
                    icon={
                      <Ionicons
                        name="transgender-outline"
                        size={17}
                        color={
                          touched.gender && errors.gender
                            ? tk.error
                            : tk.icon
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
                          touched.street && errors.street ? tk.error : tk.icon
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
                            : tk.icon
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
                          touched.city && errors.city ? tk.error : tk.icon
                        }
                      />
                    }
                    error={errors.city}
                    touched={touched.city}
                  />

                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleContinue}
                  >
                    <Text style={styles.primaryButtonText}>CONTINUE</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={17}
                      color={tk.primaryBtnText}
                    />
                  </Pressable>

                  <View style={styles.subtleRow}>
                    <Text style={styles.subtleText}>
                      Already have an account?{" "}
                      <Text
                        style={styles.subtleLink}
                        onPress={() => router.push("/login/login")}
                      >
                        Log In
                      </Text>
                    </Text>
                  </View>
                </View>
              )}

              {step === 2 && (
                <View style={styles.formSection}>
                  <Text style={[styles.sectionTitle, { color: tk.textPrimary }]}>
                    Account Setup
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: tk.textSub }]}>
                    Enter your RHU invite code and secure your booth account.
                  </Text>

                  <Field
                    label="Facility invite code"
                    placeholder="RHU-MALAY-2026"
                    value={form.facilityInviteCode}
                    onChange={f("facilityInviteCode")}
                    onBlur={() => {
                      touchField("facilityInviteCode")();
                      void validateInviteCode();
                    }}
                    fieldRef={(el) => { fieldRefsMap.facilityInviteCode = el; }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    icon={
                      <Ionicons
                        name="business-outline"
                        size={17}
                        color={
                          touched.facilityInviteCode && facilityInviteError
                            ? tk.error
                            : tk.icon
                        }
                      />
                    }
                    suffix={
                      validatingInvite ? (
                        <ActivityIndicator size="small" color={tk.icon} />
                      ) : touched.facilityInviteCode && facilityInviteError ? (
                        <Ionicons name="close-circle" size={20} color={tk.error} />
                      ) : null
                    }
                    error={facilityInviteError}
                    touched={touched.facilityInviteCode}
                  />
                  {validatedFacilityName ? (
                    <Text style={[styles.inviteFacilityHint, { color: tk.success }]}>
                      ✓ {validatedFacilityName}
                    </Text>
                  ) : null}

                  <Field
                    label="Email Address"
                    placeholder="maria@email.com"
                    value={form.email}
                    onChange={f("email")}
                    onBlur={touchField("email")}
                    fieldRef={(el) => { fieldRefsMap.email = el; }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    icon={
                      <Ionicons
                        name="mail-outline"
                        size={17}
                        color={
                          touched.email && errors.email ? tk.error : tk.icon
                        }
                      />
                    }
                    error={errors.email}
                    touched={touched.email}
                  />

                  <View style={styles.phoneFieldGroup}>
                    <Text style={[styles.fieldLabel, { marginBottom: 12 }]}>Mobile number</Text>
                    <View style={styles.phoneRowContainer}>
                      <Pressable
                        ref={countryTriggerRef}
                        onPress={openCountryPicker}
                        style={[
                          styles.countryChip,
                          { borderColor: tk.border, backgroundColor: tk.surface },
                        ]}
                      >
                        <Text style={styles.countryChipFlag}>
                          {selectedCountry.flag}
                        </Text>
                        <Text
                          style={[
                            styles.countryChipText,
                            { color: tk.textPrimary },
                          ]}
                        >
                          {selectedCountry.dialCode}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={tk.icon} />
                      </Pressable>

                      <Field
                        label=""
                        placeholder={selectedCountry.placeholder}
                        value={form.phone}
                        onChange={(value) => f("phone")(value.replace(/\D/g, ""))}
                        fieldRef={(el) => { fieldRefsMap.phone = el; }}
                        keyboardType="phone-pad"
                        icon={
                          <Ionicons
                            name="call-outline"
                            size={17}
                            color={
                              touched.phone && errors.phone ? tk.error : tk.icon
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
                    autoComplete="new-password"
                    textContentType="newPassword"
                    icon={
                      <Ionicons
                        name="lock-closed-outline"
                        size={17}
                        color={
                          touched.password && errors.password
                            ? tk.error
                            : tk.icon
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
                          color={tk.icon}
                        />
                      </Pressable>
                    }
                    error={errors.password}
                    touched={touched.password}
                  />

                  <View style={styles.passwordHintsContainer}>
                    <Text style={[styles.passwordHintLabel, { color: tk.fieldLabel }]}>
                      Password requirements:
                    </Text>
                    {SIGNUP_PASSWORD_REQUIREMENTS.map((req) => {
                      const met = req.test(form.password);
                      return (
                        <View key={req.id} style={styles.passwordHintRow}>
                          <Text
                            style={[
                              styles.passwordHintIcon,
                              { color: met ? tk.success : tk.textMuted },
                            ]}
                          >
                            ✓
                          </Text>
                          <Text
                            style={[
                              styles.passwordHintText,
                              { color: met ? tk.success : tk.textMuted },
                            ]}
                          >
                            {req.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <Field
                    label="Confirm Password"
                    placeholder="Re-enter your password"
                    value={form.confirm}
                    onChange={f("confirm")}
                    fieldRef={(el) => { fieldRefsMap.confirm = el; }}
                    secureTextEntry={!showCPw}
                    inputRef={signupConfirmPasswordRef}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    icon={
                      <Ionicons
                        name="lock-closed-outline"
                        size={17}
                        color={
                          touched.confirm && errors.confirm
                            ? tk.error
                            : tk.icon
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
                          color={tk.icon}
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
                        color={tk.white}
                      />
                      <Text style={styles.secondaryButtonText}>Back</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primaryButton, styles.primaryButtonGrow]}
                      onPress={() => void handleCreateAccount()}
                      disabled={submittingAccount}
                    >
                      {submittingAccount ? (
                        <ActivityIndicator color={tk.primaryBtnText} />
                      ) : (
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.75}
                          style={[
                            styles.primaryButtonText,
                            styles.primaryButtonTextRow,
                            {
                              fontSize: Math.min(
                                15,
                                Math.max(11, windowWidth * 0.035),
                              ),
                            },
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
                    Welcome to TBHON. Staff triage support is ready.
                  </Text>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={handleGetStarted}
                  >
                    <Text style={styles.primaryButtonText}>GET STARTED</Text>
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
                        borderColor: tk.dropdownBorder,
                        backgroundColor: tk.dropdownBg,
                        ...(Platform.OS === "android"
                          ? { elevation: 12 }
                          : {
                              shadowColor: "#000",
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.35,
                              shadowRadius: 12,
                            }),
                      },
                    ]}
                  >
                    {PROFILE_GENDER_OPTIONS.map((g, idx) => (
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
                            idx === PROFILE_GENDER_OPTIONS.length - 1 ? 0 : 1,
                          borderBottomColor: tk.dropdownBorder,
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
                              color={tk.icon}
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
                const menuW = Math.max(maxW, 220);
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
                        maxHeight: 300,
                        borderColor: tk.dropdownBorder,
                        backgroundColor: tk.dropdownBg,
                        ...(Platform.OS === "android"
                          ? { elevation: 12 }
                          : {
                              shadowColor: "#000",
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.35,
                              shadowRadius: 12,
                            }),
                      },
                    ]}
                  >
                    <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={COUNTRIES.length > 4}>
                      {COUNTRIES.map((country) => (
                        <Pressable
                          key={country.code}
                          onPress={() => {
                            setSelectedCountry(country);
                            setForm((prev) => ({ ...prev, phone: "" }));
                            setTouched((prev) => ({ ...prev, phone: false }));
                            closeCountryPicker();
                          }}
                          style={{
                            paddingHorizontal: 12,
                            minHeight: GENDER_ROW_H,
                            justifyContent: "center",
                            borderBottomWidth: country.code !== COUNTRIES[COUNTRIES.length - 1].code ? 1 : 0,
                            borderBottomColor: tk.dropdownBorder,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <Text
                              style={{ color: tk.textPrimary, fontSize: 16 }}
                              numberOfLines={1}
                            >
                              {country.name}
                            </Text>
                            {selectedCountry.code === country.code && (
                              <Ionicons
                                name="checkmark-circle"
                                size={20}
                                color={tk.icon}
                              />
                            )}
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
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
    backgroundColor: tk.screenBg,
  },
  screenContent: {
    paddingHorizontal: 20,
  },
  heroBrand: {
    width: "100%",
    alignItems: "center",
    backgroundColor: tk.screenBg,
    zIndex: 2,
  },
  logoBox: {
    aspectRatio: 1,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  signupHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: tk.textPrimary,
    textAlign: "left",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  signupSubheading: {
    fontSize: 14,
    fontWeight: "600",
    color: tk.textSub,
    textAlign: "left",
    marginBottom: 14,
    lineHeight: 20,
  },
  patientRedirect: {
    marginBottom: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.12)",
  },
  patientRedirectText: {
    color: tk.textMuted,
    fontSize: 13,
    textAlign: "left",
    lineHeight: 19,
  },
  patientRedirectLink: {
    color: tk.violetLight,
    fontSize: 13,
    fontWeight: "700",
  },
  stepProgress: {
    marginBottom: 18,
  },
  stepBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepBarSegmentWrap: {
    flex: 1,
  },
  stepBarSegment: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  stepBarSegmentActive: {
    backgroundColor: palette.lavender,
  },
  stepBarSegmentGlow: {
    shadowColor: palette.lavender,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 8,
    elevation: 4,
  },
  cardContainer: {
    marginTop: 4,
    backgroundColor: tk.cardBg,
    zIndex: 1,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: palette.deepNavy,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 28,
    elevation: 10,
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
    color: tk.violetLight,
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
  inviteFacilityHint: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: -12,
    marginBottom: 16,
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
    marginBottom: 0,
  },
  phoneFieldInline: {
    flex: 1,
    marginBottom: 0,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    color: tk.fieldLabel,
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
    backgroundColor: tk.fieldFocusedBg,
    shadowColor: palette.softViolet,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 3,
  },
  fieldBoxDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
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
    backgroundColor: tk.primaryBtnBg,
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
    minWidth: 0,
    marginTop: 0,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: tk.primaryBtnText,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  primaryButtonTextRow: {
    flexShrink: 1,
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: tk.secondaryBtnBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: tk.secondaryBtnBorder,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  secondaryButtonText: {
    color: tk.white,
    fontSize: 15,
    fontWeight: "700",
  },
  phoneFieldGroup: {
    marginBottom: 20,
  },
  countryChip: {
    height: 50,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: tk.surface,
    borderWidth: 1.5,
    borderColor: tk.border,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minWidth: 100,
    flexShrink: 0,
  },
  countryChipFlag: {
    fontSize: 20,
    lineHeight: 24,
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
    alignItems: "center",
    marginTop: 18,
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
    textAlign: "center",
    lineHeight: 20,
  },
  subtleLink: {
    color: tk.violetLight,
    fontSize: 14,
    fontWeight: "600",
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
    backgroundColor: tk.dropdownBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tk.dropdownBorder,
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
