import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { palette } from "../../constants/palette";
import { authFormTk as tk } from "../../constants/authFormTheme";
import { authFormButtonStyles } from "../../constants/authFormStyles";
import { ApiError, getMe, postSendEmailVerification, postVerifyEmail } from "../../services/backendApi";
import { resetToAuthenticatedHome, resetToLanding } from "../../utils/authNavigation";
import { onEmailVerificationSucceeded } from "../../services/unverifiedEngagementNotifications";
import { clearAuthToken, getAuthToken } from "../../utils/authStorage";
import { clearProfileCache, setCachedProfile } from "../../utils/profileCache";
import { parseUserRole, isPatientRole, type UserRole } from "../../constants/userRole";
import {
  PATIENT_VERIFY_EMAIL_BENEFIT,
  PATIENT_VERIFY_EMAIL_SUCCESS,
  STAFF_VERIFY_EMAIL_BENEFIT,
  STAFF_VERIFY_EMAIL_SUCCESS,
} from "../../constants/patientAccess";

const COLORS = {
  brand900: palette.deepNavy,
  brand800: palette.navy,
  brand700: palette.signupBg,
  brand600: palette.violet,
  brand500: palette.softViolet,
  brand400: palette.softViolet,
  brand300: "#B8B3E8",
  brand200: palette.lavender,
  brand100: "#F3F1FC",
  brand50: "#F8F7FD",
  slate900: "#0F172A",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748B",
  slate400: "#94A3B8",
  slate300: "#CBD5E1",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  white: "#FFFFFF",
  success: "#1D9E75",
  successBg: "#F0FDF4",
  successBorder: "#BBF7D0",
  error: "#EF4444",
  errorBg: "#FEF2F2",
} as const;

const FONT = {
  light: "300" as const,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
};

const OTP_LENGTH = 6;
/** Matches backend MIN_RESEND_SECONDS in emailVerification.ts */
const SEND_CODE_COOLDOWN = 60;

const MailOutlineSvg = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 7.75C3 6.7835 3.7835 6 4.75 6H19.25C20.2165 6 21 6.7835 21 7.75V16.25C21 17.2165 20.2165 18 19.25 18H4.75C3.7835 18 3 17.2165 3 16.25V7.75Z"
      stroke={COLORS.white}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <Path
      d="M4.5 8L10.95 12.3C11.5833 12.7222 12.4167 12.7222 13.05 12.3L19.5 8"
      stroke={COLORS.white}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const BlinkingCursor: React.FC = () => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, [opacity]);

  return <Animated.View style={[styles.cursor, { opacity }]} />;
};

interface OTPInputProps {
  value: string;
  onChange: (val: string) => void;
  hasError: boolean;
  isFocused: boolean;
  onFocus: () => void;
}

const OTPInput: React.FC<OTPInputProps> = ({ value, onChange, hasError, isFocused, onFocus }) => {
  const inputRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasError) return;
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -5, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [hasError, shakeAnim]);

  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");
  const cursorIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
      <Pressable
        onPress={() => {
          inputRef.current?.focus();
          onFocus();
        }}
        style={styles.otpRow}
        accessibilityLabel="Enter 6-digit verification code"
        accessibilityRole="none"
      >
        {digits.map((digit, i) => {
          const isActive = isFocused && i === cursorIndex && value.length < OTP_LENGTH;
          const isFilled = i < value.length;
          return (
            <View
              key={i}
              style={[
                styles.otpBox,
                isActive && styles.otpBoxFocused,
                isFilled && !hasError && styles.otpBoxFilled,
                hasError && styles.otpBoxError,
              ]}
            >
              {isActive && !digit ? (
                <BlinkingCursor />
              ) : (
                <Text
                  style={[
                    styles.otpDigit,
                    isFilled && !hasError && styles.otpDigitFilled,
                    hasError && styles.otpDigitError,
                  ]}
                >
                  {digit || "·"}
                </Text>
              )}
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        onFocus={onFocus}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        style={styles.hiddenInput}
        autoFocus
        caretHidden
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        accessibilityLabel="Verification code input"
      />
    </Animated.View>
  );
};

export default function VerifyEmailScreen() {
  const navigation = useNavigation();
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("STAFF");
  const [loadingUser, setLoadingUser] = useState(true);
  const [code, setCode] = useState("");
  const [isVerifying, setVerifying] = useState(false);
  const [isResending, setResending] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const [otpFocused, setOtpFocused] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyOnceRef = useRef(false);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(28)).current;

  const loadUser = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      resetToLanding(navigation);
      return;
    }
    try {
      const { user } = await getMe();
      setCachedProfile(user);
      if (user.emailVerified) {
        resetToAuthenticatedHome(navigation);
        return;
      }
      setEmail(user.email ?? null);
      setUserRole(parseUserRole(user.role));
    } catch {
      Alert.alert("Session expired", "Please log in again.", [
        {
          text: "OK",
          onPress: async () => {
            await clearAuthToken();
            clearProfileCache();
            resetToLanding(navigation);
          },
        },
      ]);
    } finally {
      setLoadingUser(false);
    }
  }, [navigation]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 440, delay: 100, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 440, delay: 100, useNativeDriver: true }),
    ]).start();
  }, [fadeIn, slideUp]);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  const handleVerify = useCallback(async () => {
    const digits = code.replace(/\D/g, "");
    if (digits.length < OTP_LENGTH || isVerifying || verifyOnceRef.current) return;

    setHasError(false);
    setErrorMsg("");
    setVerifying(true);
    try {
      await postVerifyEmail(digits);
      verifyOnceRef.current = true;
      const { user } = await getMe();
      setCachedProfile(user);
      const firstCelebration = await onEmailVerificationSucceeded(user.userId);
      if (firstCelebration) {
        const successMessage = isPatientRole(parseUserRole(user.role))
          ? PATIENT_VERIFY_EMAIL_SUCCESS
          : STAFF_VERIFY_EMAIL_SUCCESS;
        Alert.alert(
          "Email verified",
          successMessage,
          [
            {
              text: "OK",
              onPress: () => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  resetToAuthenticatedHome(navigation);
                }
              },
            },
          ],
          { cancelable: false },
        );
        return;
      }
      if (router.canGoBack()) {
        router.back();
      } else {
        resetToAuthenticatedHome(navigation);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Invalid code — please try again.";
      setHasError(true);
      setErrorMsg(msg);
      setCode("");
      setTimeout(() => setHasError(false), 900);
    } finally {
      setVerifying(false);
    }
  }, [code, isVerifying, navigation, router]);

  useEffect(() => {
    if (code.length === OTP_LENGTH && !loadingUser) {
      void handleVerify();
    }
  }, [code, handleVerify, loadingUser]);

  const handleSendCode = useCallback(async () => {
    if (isResending || cooldown > 0) return;
    setResending(true);
    setErrorMsg("");
    try {
      await postSendEmailVerification();
      setCodeSent(true);
      setCooldown(SEND_CODE_COOLDOWN);
      if (codeSent) setCode("");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to send code. Try again.";
      setErrorMsg(msg);
    } finally {
      setResending(false);
    }
  }, [codeSent, cooldown, isResending]);

  const handleCancel = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    resetToAuthenticatedHome(navigation);
  }, [navigation, router]);

  const verifyBenefit = isPatientRole(userRole)
    ? PATIENT_VERIFY_EMAIL_BENEFIT
    : STAFF_VERIFY_EMAIL_BENEFIT;

  const displayEmail =
    email && email.length > 30
      ? `${email.slice(0, 14)}…${email.slice(email.indexOf("@"))}`
      : email ?? "your email";

  const isComplete = code.length === OTP_LENGTH;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View style={[styles.card, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            <View style={styles.iconWrap}>
              <MailOutlineSvg />
            </View>

            <Text style={styles.heroTitle}>Verify your email</Text>
            <Text style={styles.heroSubtitle}>
              {loadingUser ? (
                "Loading your account…"
              ) : codeSent ? (
                <>
                  Code sent to <Text style={styles.heroEmail}>{displayEmail}</Text>. {verifyBenefit}
                </>
              ) : (
                <>
                  We&apos;ll send a code to <Text style={styles.heroEmail}>{displayEmail}</Text>.{" "}
                  {verifyBenefit}
                </>
              )}
            </Text>

            {loadingUser ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={tk.violetLight} />
              </View>
            ) : (
              <>
                <View style={styles.optionalRow}>
                  <View style={styles.optionalBadge}>
                    <Text style={styles.optionalText}>Optional step</Text>
                  </View>
                </View>

                <Text style={styles.otpLabel}>6-digit code</Text>
                <OTPInput
                  value={code}
                  onChange={setCode}
                  hasError={hasError}
                  isFocused={otpFocused}
                  onFocus={() => setOtpFocused(true)}
                />

                {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

                <View style={styles.resendRow}>
                  <Pressable
                    onPress={() => void handleSendCode()}
                    disabled={isResending || cooldown > 0}
                    style={[
                      styles.resendBtn,
                      (isResending || cooldown > 0) && styles.resendBtnDisabled,
                    ]}
                    accessibilityLabel={codeSent ? "Resend verification code" : "Send verification code"}
                    accessibilityRole="button"
                  >
                    {isResending ? (
                      <ActivityIndicator size="small" color={tk.textPrimary} />
                    ) : cooldown > 0 ? (
                      <Text style={styles.resendBtnTextDisabled}>
                        {codeSent ? "Resend code" : "Send code"} ({cooldown}s)
                      </Text>
                    ) : (
                      <Text style={styles.resendBtnText}>{codeSent ? "Resend code" : "Send code"}</Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.divider} />

                <Pressable
                  style={[
                    authFormButtonStyles.primaryButton,
                    styles.btnPrimary,
                    (!isComplete || isVerifying) && styles.btnPrimaryDisabled,
                  ]}
                  onPress={() => void handleVerify()}
                  disabled={!isComplete || isVerifying}
                  accessibilityLabel="Verify email"
                  accessibilityRole="button"
                >
                  {isVerifying ? (
                    <ActivityIndicator color={tk.primaryBtnText} />
                  ) : (
                    <Text style={authFormButtonStyles.primaryButtonText}>VERIFY EMAIL</Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.btnCancel}
                  onPress={handleCancel}
                  accessibilityLabel="Cancel email verification"
                  accessibilityRole="button"
                >
                  <Text style={styles.btnCancelText}>Cancel verification</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tk.screenBg,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: "center",
  },
  card: {
    backgroundColor: tk.cardBg,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 22,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: tk.violetGlow,
    borderWidth: 1,
    borderColor: tk.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    alignSelf: "center",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: FONT.semibold,
    color: tk.textPrimary,
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 13,
    color: tk.textSub,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 18,
  },
  heroEmail: {
    color: tk.textPrimary,
    fontWeight: FONT.semibold,
  },

  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  optionalRow: {
    alignItems: "center",
    marginBottom: 18,
  },
  optionalBadge: {
    backgroundColor: tk.successBg,
    borderWidth: 1,
    borderColor: tk.successBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  optionalText: {
    fontSize: 11,
    fontWeight: FONT.semibold,
    color: tk.success,
    letterSpacing: 0.3,
  },
  otpLabel: {
    fontSize: 11,
    fontWeight: FONT.semibold,
    color: tk.textMuted,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  otpRow: {
    flexDirection: "row",
    gap: Platform.OS === "android" ? 7 : 8,
    marginBottom: 8,
  },
  otpBox: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: tk.surface,
    borderWidth: 1.5,
    borderColor: tk.border,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxFocused: {
    borderColor: tk.violetLight,
    backgroundColor: tk.fieldFocusedBg,
  },
  otpBoxFilled: {
    borderColor: tk.violetLight,
    backgroundColor: tk.fieldFocusedBg,
  },
  otpBoxError: {
    borderColor: tk.errorBorder,
    backgroundColor: tk.errorBg,
  },
  otpDigit: {
    fontSize: 20,
    fontWeight: FONT.semibold,
    color: tk.textMuted,
  },
  otpDigitFilled: {
    color: tk.textPrimary,
  },
  otpDigitError: {
    color: tk.error,
  },
  cursor: {
    width: 2,
    height: 22,
    backgroundColor: tk.violetLight,
    borderRadius: 1,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  errorText: {
    fontSize: 12,
    color: tk.error,
    marginTop: 6,
    textAlign: "center",
    fontWeight: FONT.medium,
  },

  resendRow: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 22,
    minHeight: 38,
    justifyContent: "center",
  },
  resendBtn: {
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: 10,
    backgroundColor: tk.secondaryBtnBg,
    borderWidth: 1,
    borderColor: tk.secondaryBtnBorder,
    minWidth: 130,
    alignItems: "center",
  },
  resendBtnDisabled: {
    opacity: 0.55,
  },
  resendBtnText: {
    fontSize: 13,
    fontWeight: FONT.semibold,
    color: tk.textPrimary,
  },
  resendBtnTextDisabled: {
    fontSize: 13,
    fontWeight: FONT.semibold,
    color: tk.textMuted,
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    marginBottom: 22,
  },
  btnPrimary: {
    marginTop: 0,
    marginBottom: 10,
  },
  btnPrimaryDisabled: {
    opacity: 0.55,
  },
  btnCancel: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: FONT.medium,
    color: tk.textMuted,
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
