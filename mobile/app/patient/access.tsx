import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import CachedImage from "../components/CachedImage";
import { QrScanOverlay } from "../components/QrScanOverlay";
import { TBHON_LOGO } from "../../constants/branding";
import {
  PATIENT_ACCESS_SUBTITLE,
  PATIENT_ACCESS_TITLE,
  PATIENT_LOGIN_HINT,
  PATIENT_QR_INSTRUCTION,
  parsePatientClaimToken,
} from "../../constants/patientAccess";
import { useTheme } from "../../contexts/ThemeContext";
import { ApiError, postPatientClaim } from "../../services/backendApi";
import { onUnverifiedAccountSession } from "../../services/unverifiedEngagementNotifications";
import { resetAfterAuth } from "../../utils/authNavigation";
import { saveAuthSession } from "../../utils/authStorage";
import {
  resolvePatientClaimToken,
  showPatientAccessExpiredAlert,
  showPatientAlreadyClaimedAlert,
  showPatientClaimManualChoiceAlert,
} from "../../utils/patientClaimAccess";
import { setCachedProfile } from "../../utils/profileCache";
import {
  formatSignupBirthdateInput,
  normalizeGenderForApi,
  signupBirthdateToIso,
} from "../../utils/signupHelpers";
import {
  SIGNUP_PASSWORD_REQUIREMENTS,
  signupPasswordValidationError,
} from "../../utils/passwordPolicy";

import {
  genderLabelFromApi,
  PROFILE_GENDER_OPTIONS,
  type ProfileGenderOption,
} from "../../constants/profileGender";

function isoBirthdateToDisplay(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return `${match[2]} / ${match[3]} / ${match[1]}`;
}

function FieldLabel({ children, colors }: { children: string; colors: { textMuted: string } }) {
  return (
    <Text className="mb-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
      {children}
    </Text>
  );
}

function PasswordRequirements({
  password,
  colors,
}: {
  password: string;
  colors: { card: string; success: string; textMuted: string };
}) {
  return (
    <View style={[styles.passwordHintsContainer, { backgroundColor: colors.card }]}>
      <Text style={[styles.passwordHintLabel, { color: colors.textMuted }]}>
        Password requirements:
      </Text>
      {SIGNUP_PASSWORD_REQUIREMENTS.map((req) => {
        const met = req.test(password);
        return (
          <View key={req.id} style={styles.passwordHintRow}>
            <Text
              style={[
                styles.passwordHintIcon,
                { color: met ? colors.success : colors.textMuted },
              ]}
            >
              ✓
            </Text>
            <Text
              style={[
                styles.passwordHintText,
                { color: met ? colors.success : colors.textMuted },
              ]}
            >
              {req.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function GenderChips({
  value,
  onChange,
  colors,
}: {
  value: ProfileGenderOption | "";
  onChange: (value: ProfileGenderOption) => void;
  colors: { border: string; card: string; primary: string; text: string };
}) {
  return (
    <View className="mb-3 flex-row flex-wrap gap-2">
      {PROFILE_GENDER_OPTIONS.map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={option}
            className="rounded-full border px-4 py-2"
            style={{
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primary : colors.card,
            }}
            onPress={() => onChange(option)}
          >
            <Text className="text-sm font-semibold" style={{ color: selected ? "#FFFFFF" : colors.text }}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function PatientAccessScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const routeParams = useLocalSearchParams<{ token?: string; autoClaim?: string }>();
  const { colors, isDark } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [fromBoothIntake, setFromBoothIntake] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<ProfileGenderOption | "">("");
  const [street, setStreet] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [handling, setHandling] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const resolvingTokenRef = useRef<string | null>(null);

  const resetClaimForm = useCallback(() => {
    setClaimToken(null);
    setFromBoothIntake(false);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFirstName("");
    setLastName("");
    setBirthdate("");
    setGender("");
    setStreet("");
    setBarangay("");
    setCity("");
    setPhoneNumber("");
  }, []);

  const applyProfilePrefill = useCallback(
    (profile: {
      firstName: string;
      lastName: string;
      birthdate: string;
      gender: string;
      street: string | null;
      barangay: string | null;
      city: string | null;
      phoneNumber: string;
    }) => {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setBirthdate(isoBirthdateToDisplay(profile.birthdate));
      setGender(genderLabelFromApi(profile.gender));
      setStreet(profile.street ?? "");
      setBarangay(profile.barangay ?? "");
      setCity(profile.city ?? "");
      setPhoneNumber(profile.phoneNumber ?? "");
    },
    [],
  );

  const beginClaim = useCallback(
    async (raw: string) => {
      const token = parsePatientClaimToken(raw);
      if (!token) {
        Alert.alert("Invalid code", "Could not read a result access code from that QR.");
        return;
      }
      if (resolvingTokenRef.current === token) return;

      resolvingTokenRef.current = token;
      setLoadingPreview(true);
      setScanning(false);
      try {
        const result = await resolvePatientClaimToken(token);
        if (result.kind === "claimed") {
          showPatientAlreadyClaimedAlert(router, result.maskedEmail);
          return;
        }
        if (result.kind === "expired") {
          showPatientAccessExpiredAlert();
          return;
        }
        if (result.kind === "invalid") {
          Alert.alert("Invalid code", result.message);
          return;
        }
        if (result.kind === "needs_manual_choice") {
          showPatientClaimManualChoiceAlert(router, () => {
            setFirstName("");
            setLastName("");
            setBirthdate("");
            setGender("");
            setStreet("");
            setBarangay("");
            setCity("");
            setPhoneNumber("");
            setFromBoothIntake(false);
            setClaimToken(token);
          });
          return;
        }

        if (result.profile) {
          applyProfilePrefill(result.profile);
        } else {
          setFirstName("");
          setLastName("");
          setBirthdate("");
          setGender("");
          setStreet("");
          setBarangay("");
          setCity("");
          setPhoneNumber("");
        }
        setFromBoothIntake(result.fromBoothIntake);
        setClaimToken(token);
      } catch (e) {
        const message =
          e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not load result access.";
        Alert.alert("Result access", message);
      } finally {
        resolvingTokenRef.current = null;
        setLoadingPreview(false);
      }
    },
    [applyProfilePrefill, router],
  );

  useEffect(() => {
    const raw = typeof routeParams.token === "string" ? routeParams.token.trim() : "";
    if (raw.length === 0) return;
    void beginClaim(raw);
  }, [beginClaim, routeParams.token]);

  const submitClaim = useCallback(async () => {
    if (!claimToken) return;
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const birthdateIso = signupBirthdateToIso(birthdate);

    if (!trimmedFirst || !trimmedLast || !birthdateIso || !gender) {
      Alert.alert("Profile incomplete", "Enter your name, date of birth, and sex.");
      return;
    }
    if (!trimmedEmail || !password) {
      Alert.alert("Missing info", "Enter your email and a password.");
      return;
    }
    const passwordError = signupPasswordValidationError(password);
    if (passwordError) {
      Alert.alert("Password requirements", passwordError);
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Check your password and try again.");
      return;
    }

    setHandling(true);
    try {
      const { accessToken, refreshToken, token, user } = await postPatientClaim({
        token: claimToken,
        email: trimmedEmail,
        password,
        phoneNumber: phoneNumber.trim() || undefined,
        profile: {
          firstName: trimmedFirst,
          lastName: trimmedLast,
          birthdate: birthdateIso,
          gender: normalizeGenderForApi(gender),
          street: street.trim() || null,
          barangay: barangay.trim() || null,
          city: city.trim() || null,
        },
      });
      await saveAuthSession(accessToken ?? token, refreshToken);
      setCachedProfile(user);
      void onUnverifiedAccountSession(user);
      resetAfterAuth(navigation);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        showPatientAlreadyClaimedAlert(router);
        return;
      }
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not link your result.";
      Alert.alert("Result access", message);
    } finally {
      setHandling(false);
    }
  }, [
    barangay,
    birthdate,
    city,
    claimToken,
    confirmPassword,
    email,
    firstName,
    gender,
    lastName,
    navigation,
    password,
    phoneNumber,
    router,
    street,
  ]);

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (handling || loadingPreview) return;
      void beginClaim(data);
    },
    [beginClaim, handling, loadingPreview],
  );

  const startScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Camera needed", "Allow camera access to scan the QR on your result slip.");
        return;
      }
    }
    setScanning(true);
  };

  const inputStyle = {
    borderColor: colors.border,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  };
  const lockedNameInputStyle = {
    ...inputStyle,
    color: colors.textSecondary,
    backgroundColor: isDark ? "#111827" : "#F1F5F9",
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar style={colors.statusBar} />

      <View className="flex-row items-center border-b px-4 py-3" style={{ borderColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-lg font-black" style={{ color: colors.text }}>
          {PATIENT_ACCESS_TITLE}
        </Text>
      </View>

      {scanning && permission?.granted ? (
        <View className="flex-1">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handling || loadingPreview ? undefined : onBarcodeScanned}
          />
          <QrScanOverlay bottomReserved={160} hint="Align the QR code inside the frame" />
          <View className="absolute inset-x-0 bottom-0 px-5 pb-8 pt-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
            <Text className="mb-4 text-center text-sm text-white">{PATIENT_QR_INSTRUCTION}</Text>
            <Pressable
              className="items-center rounded-xl py-3.5"
              style={{ backgroundColor: colors.card }}
              onPress={() => setScanning(false)}
            >
              <Text className="font-semibold" style={{ color: colors.text }}>
                Cancel scan
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-6 items-center">
            <View className="h-24 w-24">
              <CachedImage source={TBHON_LOGO} className="size-full" resizeMode="contain" />
            </View>
          </View>

          <Text className="text-center text-base leading-6" style={{ color: colors.textSecondary }}>
            {PATIENT_ACCESS_SUBTITLE}
          </Text>

          {loadingPreview ? (
            <View className="mt-10 items-center py-8">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
                Loading your screening details…
              </Text>
            </View>
          ) : claimToken ? (
            <View
              className="mt-6 rounded-2xl border px-4 py-4"
              style={{ borderColor: colors.border, backgroundColor: colors.card }}
            >
              <Text className="mb-1 font-bold" style={{ color: colors.text }}>
                Set up your result account
              </Text>
              <Text className="mb-4 text-sm leading-6" style={{ color: colors.textSecondary }}>
                {fromBoothIntake
                  ? "We pre-filled your profile from booth intake. Your name and birthdate are locked to the result slip; review the remaining details before creating your account."
                  : "Add your profile details so your result account matches what appears on your Profile screen."}
              </Text>

              <Text className="mb-2 font-semibold" style={{ color: colors.text }}>
                Profile
              </Text>
              <FieldLabel colors={colors}>First name</FieldLabel>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                editable={!fromBoothIntake}
                className="mb-3 rounded-xl border px-3 py-3 text-base"
                style={fromBoothIntake ? lockedNameInputStyle : inputStyle}
              />
              <FieldLabel colors={colors}>Last name</FieldLabel>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                editable={!fromBoothIntake}
                className="mb-3 rounded-xl border px-3 py-3 text-base"
                style={fromBoothIntake ? lockedNameInputStyle : inputStyle}
              />
              <FieldLabel colors={colors}>Date of birth</FieldLabel>
              <TextInput
                value={birthdate}
                onChangeText={(text) => setBirthdate(formatSignupBirthdateInput(text))}
                placeholder="MM / DD / YYYY"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                editable={!fromBoothIntake}
                className="mb-3 rounded-xl border px-3 py-3 text-base"
                style={fromBoothIntake ? lockedNameInputStyle : inputStyle}
              />
              <FieldLabel colors={colors}>Sex</FieldLabel>
              <GenderChips value={gender} onChange={setGender} colors={colors} />

              <FieldLabel colors={colors}>Phone (optional)</FieldLabel>
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Mobile number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                className="mb-3 rounded-xl border px-3 py-3 text-base"
                style={inputStyle}
              />
              <FieldLabel colors={colors}>Street / house no. (optional)</FieldLabel>
              <TextInput
                value={street}
                onChangeText={setStreet}
                placeholder="Street, house or unit number"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                className="mb-3 rounded-xl border px-3 py-3 text-base"
                style={inputStyle}
              />
              <FieldLabel colors={colors}>Barangay (optional)</FieldLabel>
              <TextInput
                value={barangay}
                onChangeText={setBarangay}
                placeholder="Barangay"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                className="mb-3 rounded-xl border px-3 py-3 text-base"
                style={inputStyle}
              />
              <FieldLabel colors={colors}>City / municipality (optional)</FieldLabel>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="City or municipality"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                className="mb-4 rounded-xl border px-3 py-3 text-base"
                style={inputStyle}
              />

              <Text className="mb-2 font-semibold" style={{ color: colors.text }}>
                Sign-in
              </Text>
              <FieldLabel colors={colors}>Email</FieldLabel>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                className="mb-3 rounded-xl border px-3 py-3 text-base"
                style={inputStyle}
              />
              <FieldLabel colors={colors}>Password</FieldLabel>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password (min 8 characters)"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                className="mb-3 rounded-xl border px-3 py-3 text-base"
                style={inputStyle}
              />
              <PasswordRequirements password={password} colors={colors} />
              <FieldLabel colors={colors}>Confirm password</FieldLabel>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                className="mb-4 rounded-xl border px-3 py-3 text-base"
                style={inputStyle}
              />
              <Pressable
                className="items-center rounded-xl py-3.5"
                style={{ backgroundColor: colors.primary, opacity: handling ? 0.7 : 1 }}
                disabled={handling}
                onPress={() => void submitClaim()}
              >
                {handling ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="font-bold text-white">Open my result</Text>
                )}
              </Pressable>
              <Pressable className="mt-3 items-center py-2" onPress={resetClaimForm}>
                <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>
                  Scan a different code
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                className="mt-6 rounded-2xl border px-4 py-4"
                style={{ borderColor: colors.border, backgroundColor: colors.card }}
              >
                <View className="mb-2 flex-row items-center gap-2">
                  <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
                  <Text className="font-bold" style={{ color: colors.text }}>
                    Scan result slip
                  </Text>
                </View>
                <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
                  {PATIENT_QR_INSTRUCTION}
                </Text>
                <Pressable
                  className="mt-4 flex-row items-center justify-center gap-2 rounded-xl py-3.5"
                  style={{ backgroundColor: colors.primary }}
                  onPress={() => void startScan()}
                >
                  <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
                  <Text className="font-bold text-white">Scan QR code</Text>
                </Pressable>
              </View>

              <View
                className="mt-4 rounded-2xl border px-4 py-4"
                style={{ borderColor: colors.border, backgroundColor: isDark ? "#111827" : "#F8FAFC" }}
              >
                <Text className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                  Manual entry (if QR won&apos;t scan)
                </Text>
                <TextInput
                  value={manualToken}
                  onChangeText={setManualToken}
                  placeholder="Paste access code from slip"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="rounded-xl border px-3 py-3 text-base"
                  style={{
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.card,
                  }}
                />
                <Pressable
                  className="mt-3 items-center rounded-xl border py-3"
                  style={{ borderColor: colors.border, opacity: manualToken.trim() ? 1 : 0.5 }}
                  disabled={!manualToken.trim() || loadingPreview}
                  onPress={() => void beginClaim(manualToken)}
                >
                  <Text className="font-semibold" style={{ color: colors.text }}>
                    Continue
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          <View className="mt-8 items-center">
            <Text className="mb-3 text-center text-sm" style={{ color: colors.textSecondary }}>
              {PATIENT_LOGIN_HINT}
            </Text>
            <Pressable onPress={() => router.push("/login/login?intent=patient" as never)}>
              <Text className="text-base font-bold" style={{ color: colors.primary }}>
                Sign in to my result account
              </Text>
            </Pressable>
            <Pressable
              className="mt-3 py-2"
              onPress={() => router.push("/forgotPassword/forgotPassword?intent=patient" as never)}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>
                Forgot result account password?
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  passwordHintsContainer: {
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
});
