import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resetToLanding } from '../../utils/authNavigation';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from "expo-status-bar";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ApiError, getMe, patchMe, putMyProfile, type ApiUserPayload } from "../../services/backendApi";
import { clearAuthToken, getAuthToken } from "../../utils/authStorage";
import {
  clearProfileCache,
  isProfileCacheFresh,
  peekProfile,
  setCachedProfile,
} from "../../utils/profileCache";
import { clearScreeningCache } from "../../utils/screeningHistoryCache";
import { signupEmailValidationError } from "../../utils/signupHelpers";
import {
  buildPersonalInfoRows,
  displayFullName,
  profileAvatarInitials,
  profileSubtitleLine,
  type PersonalGridRows,
} from "../../utils/profileDisplay";
import { useTheme } from "../../contexts/ThemeContext";

const EMPTY_PERSONAL_ROWS: PersonalGridRows = [
  [
    { label: "Full name", value: "—", truncateValue: true },
    { label: "Age", value: "—" },
  ],
  [
    { label: "Date of birth", value: "—" },
    { label: "Sex", value: "—" },
  ],
  [
    { label: "Phone number", value: "—" },
    { label: "Email address", value: "—", truncateValue: true },
  ],
  [{ label: "Location", value: "—" }],
];

const profileCardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 4,
};

const EDIT_GENDER_OPTIONS = ["male", "female", "other"] as const;
type EditCountry = {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  placeholder: string;
  invalidMessage: string;
  validate: (digits: string) => boolean;
};

const EDIT_COUNTRIES: readonly EditCountry[] = [
  {
    name: "Philippines",
    code: "PH",
    dialCode: "+63",
    flag: "🇵🇭",
    placeholder: "9XX XXX XXXX",
    invalidMessage: "Use +63 format (9XX XXX XXXX).",
    validate: (d) => /^9\d{9}$/.test(d),
  },
  {
    name: "United States",
    code: "US",
    dialCode: "+1",
    flag: "🇺🇸",
    placeholder: "(555) 555-5555",
    invalidMessage: "Use +1 format (10 digits).",
    validate: (d) => /^\d{10}$/.test(d),
  },
  {
    name: "Canada",
    code: "CA",
    dialCode: "+1",
    flag: "🇨🇦",
    placeholder: "(555) 555-5555",
    invalidMessage: "Use +1 format (10 digits).",
    validate: (d) => /^\d{10}$/.test(d),
  },
  {
    name: "United Kingdom",
    code: "GB",
    dialCode: "+44",
    flag: "🇬🇧",
    placeholder: "7XXX XXXXXX",
    invalidMessage: "Use +44 format (7XXX XXXXXX).",
    validate: (d) => /^7\d{9}$/.test(d),
  },
  {
    name: "Australia",
    code: "AU",
    dialCode: "+61",
    flag: "🇦🇺",
    placeholder: "4XX XXX XXX",
    invalidMessage: "Use +61 format (4XX XXX XXX).",
    validate: (d) => /^4\d{8}$/.test(d),
  },
  {
    name: "Singapore",
    code: "SG",
    dialCode: "+65",
    flag: "🇸🇬",
    placeholder: "8XXX XXXX",
    invalidMessage: "Use +65 format (8XXX XXXX).",
    validate: (d) => /^[89]\d{7}$/.test(d),
  },
  {
    name: "Malaysia",
    code: "MY",
    dialCode: "+60",
    flag: "🇲🇾",
    placeholder: "1X XXX XXXX",
    invalidMessage: "Use +60 format (1X XXX XXXX).",
    validate: (d) => /^1\d{8,9}$/.test(d),
  },
  {
    name: "Thailand",
    code: "TH",
    dialCode: "+66",
    flag: "🇹🇭",
    placeholder: "8X XXX XXXX",
    invalidMessage: "Use +66 format (8X XXX XXXX).",
    validate: (d) => /^[689]\d{8}$/.test(d),
  },
  {
    name: "Vietnam",
    code: "VN",
    dialCode: "+84",
    flag: "🇻🇳",
    placeholder: "9XX XXX XXXX",
    invalidMessage: "Use +84 format (9XX XXX XXXX).",
    validate: (d) => /^[35789]\d{8}$/.test(d),
  },
  {
    name: "Indonesia",
    code: "ID",
    dialCode: "+62",
    flag: "🇮🇩",
    placeholder: "8XX XXXX XXXX",
    invalidMessage: "Use +62 format (8XX XXXX XXXX).",
    validate: (d) => /^8\d{9,11}$/.test(d),
  },
];

function dateToIsoLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToLocalDate(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const parsed = new Date(y, mo - 1, d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBirthdateDisplay(iso: string): string {
  const dt = isoToLocalDate(iso);
  if (!dt) return "Select birthdate";
  return dt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function parsePhoneForCountry(rawPhone: string | null | undefined): {
  country: EditCountry;
  localDigits: string;
} {
  const digits = (rawPhone ?? "").replace(/\D/g, "");
  if (!digits) return { country: EDIT_COUNTRIES[0], localDigits: "" };
  if (digits.startsWith("63")) return { country: EDIT_COUNTRIES[0], localDigits: digits.slice(2) };
  if (digits.startsWith("1")) return { country: EDIT_COUNTRIES[1], localDigits: digits.slice(1) };
  if (digits.startsWith("44")) return { country: EDIT_COUNTRIES[3], localDigits: digits.slice(2) };
  if (digits.startsWith("61")) return { country: EDIT_COUNTRIES[4], localDigits: digits.slice(2) };
  if (digits.startsWith("65")) return { country: EDIT_COUNTRIES[5], localDigits: digits.slice(2) };
  if (digits.startsWith("60")) return { country: EDIT_COUNTRIES[6], localDigits: digits.slice(2) };
  if (digits.startsWith("66")) return { country: EDIT_COUNTRIES[7], localDigits: digits.slice(2) };
  if (digits.startsWith("84")) return { country: EDIT_COUNTRIES[8], localDigits: digits.slice(2) };
  if (digits.startsWith("62")) return { country: EDIT_COUNTRIES[9], localDigits: digits.slice(2) };
  return { country: EDIT_COUNTRIES[0], localDigits: digits };
}

function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text className="-mb-1 text-sm font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
      {children}
    </Text>
  );
}

function ProfileCard({
  icon,
  iconBackground,
  iconColor,
  title,
  subtitle,
  badge,
  badgeStyle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBackground: string;
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeStyle?: { backgroundColor: string; color: string };
  children: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const dividerColor = isDark ? "rgba(234,232,250,0.32)" : colors.borderLight;
  return (
    <View
      className="rounded-3xl border p-5"
      style={[profileCardShadow, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
    >
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center gap-2.5">
          <View
            className="size-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: iconBackground }}
          >
            <Ionicons name={icon} size={20} color={iconColor} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold" style={{ color: colors.text }}>{title}</Text>
            <Text className="mt-0.5 text-sm" style={{ color: colors.textMuted }}>{subtitle}</Text>
          </View>
        </View>
        {badge != null && badgeStyle != null && (
          <View
            className="rounded-full px-2.5 py-1"
            style={{ backgroundColor: badgeStyle.backgroundColor }}
          >
            <Text className="text-sm font-bold" style={{ color: badgeStyle.color }}>
              {badge}
            </Text>
          </View>
        )}
      </View>
      <View className="mb-4 h-px" style={{ backgroundColor: dividerColor }} />
      {children}
    </View>
  );
}

function ProfileCardHeaderOnly({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const dividerColor = isDark ? "rgba(234,232,250,0.32)" : colors.borderLight;
  return (
    <View
      className="rounded-3xl border p-5"
      style={[profileCardShadow, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
    >
      <View className="mb-4">
        <Text className="text-lg font-extrabold" style={{ color: colors.text }}>{title}</Text>
        <Text className="mt-0.5 text-sm font-semibold" style={{ color: colors.textMuted }}>{subtitle}</Text>
      </View>
      <View className="mb-4 h-px" style={{ backgroundColor: dividerColor }} />
      {children}
    </View>
  );
}

function InfoGrid({ rows }: { rows: PersonalGridRows }) {
  const { colors, isDark } = useTheme();
  const dividerColor = isDark ? "rgba(234,232,250,0.32)" : colors.borderLight;
  return (
    <View>
      {rows.map((pair, rowIdx) => {
        const isLastRow = rowIdx === rows.length - 1;
        const isSingle = pair.length === 1;
        return (
          <View
            key={rowIdx}
            className={`flex-row ${!isLastRow ? "border-b" : ""}`}
            style={!isLastRow ? { borderColor: dividerColor } : undefined}
          >
            {pair.map((cell, cellIdx) => (
              <View
                key={cell.label}
                className={
                  isSingle
                    ? "w-full shrink py-3"
                    : `min-w-0 flex-1 py-3 ${cellIdx === 0 ? "pr-3" : "pl-3"} ${
                        cellIdx === 0 ? "border-r" : ""
                      }`
                }
                style={cellIdx === 0 && !isSingle ? { borderColor: dividerColor } : undefined}
              >
                <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>{cell.label}</Text>
                <Text
                  className="mt-1 text-base font-bold"
                  style={{ color: cell.valueAccent ? colors.primary : colors.text }}
                  numberOfLines={cell.truncateValue ? 1 : undefined}
                  ellipsizeMode={cell.truncateValue ? "tail" : undefined}
                >
                  {cell.value}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function SettingRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  right,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  right: React.ReactNode;
  isLast?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const dividerColor = isDark ? "rgba(234,232,250,0.32)" : colors.borderLight;
  return (
    <View
      className={`flex-row items-center justify-between py-3 ${isLast ? "" : "border-b"}`}
      style={!isLast ? { borderColor: dividerColor } : undefined}
    >
      <View className="flex-1 flex-row items-center gap-3 pr-2">
        <View
          className="size-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: iconBg }}
        >
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold" style={{ color: colors.text }}>{title}</Text>
          <Text className="mt-0.5 text-sm" style={{ color: colors.textMuted }}>{subtitle}</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

function initialUserFromCache(): ApiUserPayload | null {
  return peekProfile();
}

export function ProfilePage() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isDark, toggleDarkMode, colors } = useTheme();
  const seeded = initialUserFromCache();
  const [user, setUser] = useState<ApiUserPayload | null>(seeded);
  const [isLoading, setIsLoading] = useState(() => seeded == null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalMounted, setEditModalMounted] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showBirthdatePicker, setShowBirthdatePicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [selectedEditCountry, setSelectedEditCountry] = useState<EditCountry>(EDIT_COUNTRIES[0]);
  const [editBirthdateDraft, setEditBirthdateDraft] = useState<Date>(new Date(1995, 0, 1));
  const editSheetAnim = useRef(new Animated.Value(0)).current;
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    birthdate: "",
    gender: "",
    street: "",
    barangay: "",
    city: "",
    email: "",
    phoneNumber: "",
  });

  const skeletonPulse = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    if (!isLoading) {
      skeletonPulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(skeletonPulse, {
          toValue: 0.65,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isLoading, skeletonPulse]);

  const fetchProfile = useCallback(async () => {
    setLoadError(null);
    const token = await getAuthToken();
    if (!token) {
      clearProfileCache();
      clearScreeningCache();
      setUser(null);
      setIsLoading(false);
      resetToLanding(navigation);
      return;
    }

    const cachedFresh = isProfileCacheFresh() ? peekProfile() : null;
    if (cachedFresh) {
      setUser(cachedFresh);
      setIsLoading(false);
      return;
    }

    const stale = peekProfile();
    if (stale) {
      setUser(stale);
      setIsLoading(false);
      try {
        const { user: next } = await getMe();
        setUser(next);
        setCachedProfile(next);
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not refresh your profile.";
        setLoadError(message);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearProfileCache();
          clearScreeningCache();
          await clearAuthToken();
          setUser(null);
          resetToLanding(navigation);
        }
      }
      return;
    }

    setIsLoading(true);
    try {
      const { user: next } = await getMe();
      setUser(next);
      setCachedProfile(next);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not load your profile.";
      setLoadError(message);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearProfileCache();
        clearScreeningCache();
        await clearAuthToken();
        resetToLanding(navigation);
      }
    } finally {
      setIsLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const handleSignOut = () => {
    Alert.alert("Sign out", "You'll need to sign in again to access your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            clearProfileCache();
            clearScreeningCache();
            await clearAuthToken();
            resetToLanding(navigation);
          })();
        },
      },
    ]);
  };

  const handleComingSoon = (title: string, message: string) => {
    Alert.alert(title, message);
  };

  const openExternal = async (url: string, fallbackTitle: string) => {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert(fallbackTitle, "This action is currently unavailable on your device.");
      return;
    }
    await Linking.openURL(url);
  };

  const handleEditProfile = () => {
    const p = user?.profile;
    const parsedPhone = parsePhoneForCountry(user?.phoneNumber ?? "");
    setEditError(null);
    setSelectedEditCountry(parsedPhone.country);
    setEditForm({
      firstName: p?.firstName ?? "",
      lastName: p?.lastName ?? "",
      birthdate: p?.birthdate ? p.birthdate.slice(0, 10) : "",
      gender: p?.gender ?? "",
      street: p?.street ?? "",
      barangay: p?.barangay ?? "",
      city: p?.city ?? "",
      email: user?.email ?? "",
      phoneNumber: parsedPhone.localDigits,
    });
    setEditModalMounted(true);
    setShowEditModal(true);
  };

  const updateEditField = (key: keyof typeof editForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const openBirthdatePicker = () => {
    const initial = isoToLocalDate(editForm.birthdate) ?? new Date(1995, 0, 1);
    setEditBirthdateDraft(initial);
    setShowBirthdatePicker(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setShowGenderPicker(false);
    setShowBirthdatePicker(false);
    setShowCountryPicker(false);
  };

  useEffect(() => {
    if (showEditModal) {
      editSheetAnim.setValue(0);
      Animated.timing(editSheetAnim, {
        toValue: 1,
        duration: 230,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!editModalMounted) return;
    Animated.timing(editSheetAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setEditModalMounted(false);
    });
  }, [showEditModal, editModalMounted, editSheetAnim]);

  const onAndroidBirthdateChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowBirthdatePicker(false);
    if (event.type === "set" && date) {
      updateEditField("birthdate", dateToIsoLocal(date));
    }
  };

  const saveProfileEdits = async () => {
    if (!user) return;
    setEditError(null);
    const firstName = editForm.firstName.trim();
    const lastName = editForm.lastName.trim();
    const birthdate = editForm.birthdate.trim();
    const gender = editForm.gender.trim().toLowerCase();
    const street = editForm.street.trim();
    const barangay = editForm.barangay.trim();
    const city = editForm.city.trim();
    const email = editForm.email.trim();
    const phoneDigits = editForm.phoneNumber.replace(/\D/g, "");

    if (!firstName || !lastName || !birthdate || !gender) {
      setEditError("First name, last name, birthdate, and sex are required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
      setEditError("Birthdate must be in YYYY-MM-DD format.");
      return;
    }
    const emailError = signupEmailValidationError(email);
    if (emailError) {
      setEditError(emailError);
      return;
    }
    if (phoneDigits && !selectedEditCountry.validate(phoneDigits)) {
      setEditError(`Invalid phone number. ${selectedEditCountry.invalidMessage}`);
      return;
    }
    const phoneNumber = phoneDigits ? `${selectedEditCountry.dialCode}${phoneDigits}` : "";

    setIsSavingEdit(true);
    try {
      const contactChanged = email !== (user.email ?? "") || phoneNumber !== (user.phoneNumber ?? "");
      if (contactChanged) {
        await patchMe({
          email: email || null,
          phoneNumber: phoneNumber || null,
        });
      }

      await putMyProfile({
        firstName,
        lastName,
        birthdate,
        gender,
        street: street || null,
        barangay: barangay || null,
        city: city || null,
      });

      const { user: refreshedUser } = await getMe();
      setCachedProfile(refreshedUser);
      setUser(refreshedUser);
      closeEditModal();
      setShowGenderPicker(false);
      setShowBirthdatePicker(false);
      Alert.alert("Profile updated", "Your profile information has been saved.");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not update your profile.";
      setEditError(message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleChangePassword = () => {
    handleComingSoon("Change Password", "Password management will be available in an upcoming update.");
  };

  const handleTwoFactor = () => {
    handleComingSoon(
      "Two-Factor Authentication",
      "Two-factor settings will be available in an upcoming update.",
    );
  };

  const handleEmailVerification = () => {
    handleComingSoon("Email Verification", "Email verification controls will be available soon.");
  };

  const handleContactSupport = () => {
    void openExternal("mailto:tbhon.support@gmail.com", "Contact Support");
  };

  const handleRateApp = () => {
    void openExternal("https://play.google.com/store", "Rate the App");
  };

  const personalRows = user ? buildPersonalInfoRows(user) : null;
  const headerName = user ? displayFullName(user) : "…";
  const initials = user ? profileAvatarInitials(user) : "…";
  const subtitle = user ? profileSubtitleLine(user) : { age: "—", gender: "—", location: "—" };
  const showVerifiedBadge = Boolean(user?.profile);

  return (
    <View style={{ flex: 1, minHeight: 0, width: "100%", backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 28 }}
      >
        <View className="px-5 pb-3" style={{ paddingTop: insets.top + 22 }}>
          <View className="mb-4 flex-row items-center justify-between">
            <View>
              <Text style={{ color: colors.textSecondary }} className="mb-1 text-base">Account</Text>
              <Text style={{ color: colors.text }} className="text-3xl font-extrabold">Profile</Text>
            </View>
          </View>

          {loadError ? (
            <Text className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: colors.errorBg, color: colors.error }}>
              {loadError}
            </Text>
          ) : null}

          <View className="mb-4 items-center">
            {isLoading && !user ? (
              <Animated.View style={{ opacity: skeletonPulse }}>
                <View className="w-full items-center">
                  <View className="relative mb-2.5">
                    <View className="size-20 rounded-full border-2 border-[#efefef] bg-[#E8ECF0]" />
                    <View className="absolute bottom-0 right-0 size-7 rounded-full border-2 border-white bg-[#DCE3EA]" />
                  </View>
                  <View className="h-7 w-[58%] max-w-[220px] rounded-lg bg-[#E8ECF0]" />
                  <View className="mt-3 flex-row flex-wrap items-center justify-center gap-2 px-2">
                    <View className="h-3.5 w-[72px] rounded-md bg-[#E8ECF0]" />
                    <View className="size-1 rounded-full bg-[#ddd]" />
                    <View className="h-3.5 w-[52px] rounded-md bg-[#E8ECF0]" />
                    <View className="size-1 rounded-full bg-[#ddd]" />
                    <View className="h-3.5 w-[88px] rounded-md bg-[#E8ECF0]" />
                  </View>
                  <View className="mt-3.5 h-9 w-[148px] rounded-full bg-[#E8ECF0]" />
                </View>
              </Animated.View>
            ) : (
              <>
                <View className="mb-2.5">
                  <View className="size-20 items-center justify-center rounded-full border-2" style={{ borderColor: colors.cardBorder, backgroundColor: colors.primaryLight }}>
                    <Text className="text-2xl font-extrabold" style={{ color: colors.primary }}>{initials}</Text>
                  </View>
                </View>
                <View className="w-full max-w-full px-1">
                  <Text
                    className="text-center text-xl font-extrabold"
                    style={{ color: colors.text }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {headerName}
                  </Text>
                </View>
                <View className="mt-2.5 flex-row flex-wrap items-center justify-center gap-2 px-2">
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                    <Text className="text-sm" style={{ color: colors.textMuted }}>{subtitle.age}</Text>
                  </View>
                  <View className="size-1 rounded-full" style={{ backgroundColor: colors.textMuted }} />
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                    <Text className="text-sm" style={{ color: colors.textMuted }}>{subtitle.gender}</Text>
                  </View>
                  <View className="size-1 rounded-full" style={{ backgroundColor: colors.textMuted }} />
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                    <Text className="text-sm" style={{ color: colors.textMuted }}>{subtitle.location}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  className="mt-3.5 rounded-full border px-5 py-2"
                  style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
                  onPress={handleEditProfile}
                >
                  <Text className="text-sm font-bold" style={{ color: colors.text }}>Edit Profile</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <View className="gap-4 px-5">
          <SectionLabel>Personal Information</SectionLabel>
          <ProfileCard
            icon="person-outline"
            iconBackground="#E6F3FB"
            iconColor="#1D6FA4"
            title="My Details"
            subtitle="Basic info & contact"
            badge={!isLoading && showVerifiedBadge ? "Verified" : undefined}
            badgeStyle={
              !isLoading && showVerifiedBadge
                ? { backgroundColor: "#E6F3FB", color: "#0C447C" }
                : undefined
            }
          >
            {isLoading && !user ? (
              <Animated.View style={{ opacity: skeletonPulse }}>
                <View className="flex-row border-b border-[#efefef]">
                  <View className="min-w-0 flex-1 border-r border-[#efefef] py-3 pr-3">
                    <View className="mb-2 h-3 w-[72px] rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[95%] rounded-md bg-[#E8ECF0]" />
                  </View>
                  <View className="min-w-0 flex-1 py-3 pl-3">
                    <View className="mb-2 h-3 w-10 rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[80%] rounded-md bg-[#E8ECF0]" />
                  </View>
                </View>
                <View className="flex-row border-b border-[#efefef]">
                  <View className="min-w-0 flex-1 border-r border-[#efefef] py-3 pr-3">
                    <View className="mb-2 h-3 w-[100px] rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[90%] rounded-md bg-[#E8ECF0]" />
                  </View>
                  <View className="min-w-0 flex-1 py-3 pl-3">
                    <View className="mb-2 h-3 w-8 rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[55%] rounded-md bg-[#E8ECF0]" />
                  </View>
                </View>
                <View className="flex-row border-b border-[#efefef]">
                  <View className="min-w-0 flex-1 border-r border-[#efefef] py-3 pr-3">
                    <View className="mb-2 h-3 w-[88px] rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[85%] rounded-md bg-[#E8ECF0]" />
                  </View>
                  <View className="min-w-0 flex-1 py-3 pl-3">
                    <View className="mb-2 h-3 w-[92px] rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[92%] rounded-md bg-[#E8ECF0]" />
                  </View>
                </View>
                <View className="w-full shrink py-3">
                  <View className="mb-2 h-3 w-16 rounded bg-[#E8ECF0]" />
                  <View className="h-[18px] w-[78%] rounded-md bg-[#E8ECF0]" />
                </View>
              </Animated.View>
            ) : (
              <InfoGrid rows={personalRows ?? EMPTY_PERSONAL_ROWS} />
            )}
          </ProfileCard>

          <SectionLabel>Settings</SectionLabel>
          <ProfileCardHeaderOnly
            title="App Settings"
            subtitle="Theme"
          >
            <SettingRow
              icon="moon-outline"
              iconBg={isDark ? "#374151" : "#FEF5E7"}
              iconColor={isDark ? "#FBBF24" : "#E67E22"}
              title="Dark mode"
              subtitle={isDark ? "Currently enabled" : "Easy on the eyes at night"}
              isLast
              right={
                <Switch
                  value={isDark}
                  onValueChange={toggleDarkMode}
                  trackColor={{ false: '#CBD5E0', true: '#fdba74' }}
                  thumbColor={isDark ? '#E67E22' : '#f4f4f5'}
                />
              }
            />
          </ProfileCardHeaderOnly>

          <ProfileCardHeaderOnly
            title="Privacy & Security"
            subtitle="Account protection"
          >
            <TouchableOpacity activeOpacity={0.7} onPress={handleChangePassword}>
              <SettingRow
                icon="key-outline"
                iconBg="#EDE9FC"
                iconColor="#6C3FC9"
                title="Change password"
                subtitle="Last changed 30 days ago"
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={handleTwoFactor}>
              <SettingRow
                icon="shield-checkmark-outline"
                iconBg="#E9F7EF"
                iconColor="#1E8449"
                title="Two-factor authentication"
                subtitle="Extra login security"
                right={
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-full bg-[#E9F7EF] px-2.5 py-1">
                      <Text className="text-sm font-bold text-[#1A6035]">On</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#8FA3B1" />
                  </View>
                }
              />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={handleEmailVerification}>
              <SettingRow
                icon="mail-outline"
                iconBg="#E6F3FB"
                iconColor="#1E8449"
                title="Email Verification"
                subtitle="Verify your email address"
                isLast
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
          </ProfileCardHeaderOnly>

          <ProfileCardHeaderOnly
            title="About & Support"
            subtitle="Help, feedback & app info"
          >
            <TouchableOpacity activeOpacity={0.7} onPress={handleContactSupport}>
              <SettingRow
                icon="chatbubble-outline"
                iconBg="#E6F3FB"
                iconColor="#1D6FA4"
                title="Contact support"
                subtitle="Get help from our team"
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={handleRateApp}>
              <SettingRow
                icon="star-outline"
                iconBg="#FEF5E7"
                iconColor="#E67E22"
                title="Rate the app"
                subtitle="Tell us what you think"
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
            <SettingRow
              icon="phone-portrait-outline"
              iconBg="#ffffff"
              iconColor="#5D6D7E"
              title="App version"
              subtitle="TBhon Pre-screening App"
              isLast
              right={<Text className="text-sm font-semibold text-[#8FA3B1]">v1.4.2</Text>}
            />
          </ProfileCardHeaderOnly>

          <TouchableOpacity
            activeOpacity={0.85}
            className="flex-row items-center justify-center gap-2.5 rounded-2xl border py-3.5"
            style={{
              borderColor: isDark ? "#7F1D1D" : "#F1A9A0",
              backgroundColor: isDark ? "rgba(127,29,29,0.28)" : "#FDEDEC",
            }}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={18} color={isDark ? "#FCA5A5" : "#C0392B"} />
            <Text className="text-base font-extrabold" style={{ color: isDark ? "#FCA5A5" : "#C0392B" }}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={editModalMounted} animationType="none" transparent onRequestClose={closeEditModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Animated.View
              pointerEvents="box-none"
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: "rgba(2, 6, 23, 0.24)",
                  opacity: editSheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                },
              ]}
            >
              <Pressable style={StyleSheet.absoluteFillObject} onPress={closeEditModal} />
            </Animated.View>

            <Animated.View
              style={{
                width: "100%",
                minHeight: "58%",
                maxHeight: "92%",
                backgroundColor: colors.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: Math.max(insets.bottom, 12) + 12,
                zIndex: 10,
                elevation: 10,
                flexDirection: "column",
                opacity: editSheetAnim,
                transform: [
                  {
                    translateY: editSheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [34, 0],
                    }),
                  },
                ],
              }}
            >
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-[22px] font-extrabold" style={{ color: colors.text }}>Edit Profile</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.surfaceAlt }}
                  onPress={closeEditModal}
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {editError ? (
                <Text className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: colors.errorBg, color: colors.error }}>
                  {editError}
                </Text>
              ) : null}

              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 10 }}
              >
                <View className="gap-3">
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>First Name</Text>
                    <TextInput
                      value={editForm.firstName}
                      onChangeText={(text) => updateEditField("firstName", text)}
                      placeholder="First name"
                      className="rounded-xl border px-3.5 py-3 text-base"
                      style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>Last Name</Text>
                    <TextInput
                      value={editForm.lastName}
                      onChangeText={(text) => updateEditField("lastName", text)}
                      placeholder="Last name"
                      className="rounded-xl border px-3.5 py-3 text-base"
                      style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>Birthdate</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={openBirthdatePicker}
                      className="flex-row items-center justify-between rounded-xl border px-3.5 py-3"
                      style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg }}
                    >
                      <Text className="text-base" style={{ color: editForm.birthdate ? colors.text : colors.textMuted }}>
                        {formatBirthdateDisplay(editForm.birthdate)}
                      </Text>
                      <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>Sex</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowGenderPicker(true)}
                      className="flex-row items-center justify-between rounded-xl border px-3.5 py-3"
                      style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg }}
                    >
                      <Text className="text-base" style={{ color: editForm.gender ? colors.text : colors.textMuted }}>
                        {editForm.gender ? `${editForm.gender[0].toUpperCase()}${editForm.gender.slice(1)}` : "Select sex"}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                    {showGenderPicker ? (
                      <View className="mt-2 rounded-xl border p-2" style={{ borderColor: colors.inputBorder, backgroundColor: colors.card }}>
                        {EDIT_GENDER_OPTIONS.map((option) => {
                          const active = editForm.gender.trim().toLowerCase() === option;
                          return (
                            <TouchableOpacity
                              key={option}
                              activeOpacity={0.8}
                              onPress={() => {
                                updateEditField("gender", option);
                                setShowGenderPicker(false);
                              }}
                              className="mb-1.5 flex-row items-center justify-between rounded-lg px-3 py-2.5"
                              style={{ backgroundColor: active ? colors.primaryLight : colors.surfaceAlt }}
                            >
                              <Text className="text-base font-semibold" style={{ color: colors.text }}>
                                {`${option[0].toUpperCase()}${option.slice(1)}`}
                              </Text>
                              {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>Street</Text>
                    <TextInput
                      value={editForm.street}
                      onChangeText={(text) => updateEditField("street", text)}
                      placeholder="Street address"
                      className="rounded-xl border px-3.5 py-3 text-base"
                      style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>Barangay</Text>
                    <TextInput
                      value={editForm.barangay}
                      onChangeText={(text) => updateEditField("barangay", text)}
                      placeholder="Barangay"
                      className="rounded-xl border px-3.5 py-3 text-base"
                      style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>City</Text>
                    <TextInput
                      value={editForm.city}
                      onChangeText={(text) => updateEditField("city", text)}
                      placeholder="City"
                      className="rounded-xl border px-3.5 py-3 text-base"
                      style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>Email</Text>
                    <TextInput
                      value={editForm.email}
                      onChangeText={(text) => updateEditField("email", text)}
                      placeholder="you@email.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className="rounded-xl border px-3.5 py-3 text-base"
                      style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }}
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View>
                    <Text className="mb-1 text-sm font-semibold" style={{ color: colors.textSecondary }}>Phone Number</Text>
                    <View className="flex-row items-center gap-2">
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setShowCountryPicker((v) => !v)}
                        className="flex-row items-center rounded-xl border px-3 py-3"
                        style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg }}
                      >
                        <Text className="mr-1 text-base">{selectedEditCountry.flag}</Text>
                        <Text className="mr-1 text-sm font-bold" style={{ color: colors.text }}>{selectedEditCountry.dialCode}</Text>
                        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                      <View className="flex-1 rounded-xl border px-3.5 py-0.5" style={{ borderColor: colors.inputBorder, backgroundColor: colors.inputBg }}>
                        <TextInput
                          value={editForm.phoneNumber}
                          onChangeText={(text) => updateEditField("phoneNumber", text.replace(/\D/g, ""))}
                          placeholder={selectedEditCountry.placeholder}
                          keyboardType="phone-pad"
                          className="py-2.5 text-base"
                          style={{ color: colors.text }}
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>
                    </View>
                    <Text className="mt-1 text-xs" style={{ color: colors.textMuted }}>
                      Expected: {selectedEditCountry.dialCode} {selectedEditCountry.placeholder}
                    </Text>
                    {showCountryPicker ? (
                      <View className="mt-2 rounded-xl border p-2" style={{ borderColor: colors.inputBorder, backgroundColor: colors.card }}>
                        <ScrollView
                          nestedScrollEnabled
                          showsVerticalScrollIndicator
                          style={{ maxHeight: 220 }}
                          contentContainerStyle={{ paddingBottom: 2 }}
                        >
                          {EDIT_COUNTRIES.map((country) => (
                            <TouchableOpacity
                              key={country.code}
                              activeOpacity={0.85}
                              onPress={() => {
                                setSelectedEditCountry(country);
                                setShowCountryPicker(false);
                              }}
                              className="mb-1.5 flex-row items-center justify-between rounded-lg px-3 py-2.5"
                              style={{ backgroundColor: colors.surfaceAlt }}
                            >
                              <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                                {country.flag} {country.name} ({country.dialCode})
                              </Text>
                              {selectedEditCountry.code === country.code ? (
                                <Ionicons name="checkmark" size={17} color={colors.primary} />
                              ) : null}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    className="mt-3 items-center rounded-2xl py-3.5"
                    style={{ backgroundColor: isSavingEdit ? "#A7B0C0" : "#5B4FC4" }}
                    onPress={() => {
                      void saveProfileEdits();
                    }}
                    disabled={isSavingEdit}
                  >
                    <Text className="text-base font-extrabold text-white">
                      {isSavingEdit ? "Saving..." : "Save Changes"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showBirthdatePicker && Platform.OS === "android" ? (
        <DateTimePicker
          value={editBirthdateDraft}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onAndroidBirthdateChange}
        />
      ) : null}

      <Modal
        visible={showBirthdatePicker && Platform.OS === "ios"}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBirthdatePicker(false)}
      >
        <View className="flex-1 justify-end bg-black/30">
          <View
            className="rounded-t-3xl px-5 pb-6 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom, 14), backgroundColor: colors.card }}
          >
            <View className="mb-3 flex-row items-center justify-between">
              <TouchableOpacity activeOpacity={0.8} onPress={() => setShowBirthdatePicker(false)}>
                <Text className="text-base" style={{ color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <Text className="text-base font-bold" style={{ color: colors.text }}>Birthdate</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  updateEditField("birthdate", dateToIsoLocal(editBirthdateDraft));
                  setShowBirthdatePicker(false);
                }}
              >
                <Text className="text-base font-bold" style={{ color: colors.primary }}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={editBirthdateDraft}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              themeVariant="light"
              onChange={(_, date) => {
                if (date) setEditBirthdateDraft(date);
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default ProfilePage;
