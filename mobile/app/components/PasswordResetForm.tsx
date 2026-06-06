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
import { Ionicons } from "@expo/vector-icons";
import { AuthFormField, authFormFieldStyles } from "./AuthFormField";
import { authFormTk as tk } from "../../constants/authFormTheme";
import { authFormButtonStyles } from "../../constants/authFormStyles";
import {
  ApiError,
  postConfirmChangePassword,
  postForgotPassword,
  postResetPassword,
  postSendChangePasswordCode,
  postVerifyChangePasswordCode,
  postVerifyForgotPasswordCode,
} from "../../services/backendApi";
import {
  SIGNUP_PASSWORD_REQUIREMENTS,
  signupPasswordValidationError,
} from "../../utils/passwordPolicy";
import { signupEmailValidationError } from "../../utils/signupHelpers";
import { useIosPasswordSecureMaskSync } from "../../utils/useIosPasswordSecureMaskSync";
import { notifyPasswordChanged } from "../../services/accountActivityNotifications";

const OTP_LENGTH = 6;
const SEND_CODE_COOLDOWN = 60;

export type PasswordResetMode = "forgot" | "change";

type PasswordResetFormProps = {
  mode: PasswordResetMode;
  backLabel: string;
  onBack: () => void;
  onSuccess: () => void;
  accountEmail?: string | null;
  loadingAccount?: boolean;
};

const BlinkingCursor = () => {
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

type OtpInputProps = {
  value: string;
  onChange: (val: string) => void;
  hasError: boolean;
  isFocused: boolean;
  onFocus: () => void;
};

const OtpInput = ({ value, onChange, hasError, isFocused, onFocus }: OtpInputProps) => {
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
        accessibilityLabel="Enter 6-digit reset code"
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
        caretHidden
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        accessibilityLabel="Reset code input"
      />
    </Animated.View>
  );
};

function formatDisplayEmail(email: string | null | undefined): string {
  if (!email) return "your email";
  if (email.length <= 30) return email;
  return `${email.slice(0, 14)}…${email.slice(email.indexOf("@"))}`;
}

export function PasswordResetForm({
  mode,
  backLabel,
  onBack,
  onSuccess,
  accountEmail = null,
  loadingAccount = false,
}: PasswordResetFormProps) {
  const [email, setEmail] = useState(mode === "change" ? (accountEmail ?? "") : "");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasCodeError, setHasCodeError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [otpFocused, setOtpFocused] = useState(false);

  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  useIosPasswordSecureMaskSync(newRef, showNew, newPassword);
  useIosPasswordSecureMaskSync(confirmRef, showConfirm, confirmPassword);

  useEffect(() => {
    if (mode === "change" && accountEmail) {
      setEmail(accountEmail);
    }
  }, [accountEmail, mode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const effectiveEmail = mode === "change" ? (accountEmail ?? email) : email.trim();
  const displayEmail = formatDisplayEmail(effectiveEmail);

  const handleSendCode = useCallback(async () => {
    if (isSending || cooldown > 0 || loadingAccount) return;
    setErrorMsg("");

    if (mode === "forgot") {
      const emailError = signupEmailValidationError(email.trim());
      if (emailError) {
        setErrorMsg(emailError);
        return;
      }
    }

    setIsSending(true);
    try {
      if (mode === "forgot") {
        await postForgotPassword(email.trim());
      } else {
        await postSendChangePasswordCode();
      }
      setCodeSent(true);
      setCodeVerified(false);
      setNewPassword("");
      setConfirmPassword("");
      setCooldown(SEND_CODE_COOLDOWN);
      if (codeSent) setCode("");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to send code. Try again.";
      setErrorMsg(msg);
    } finally {
      setIsSending(false);
    }
  }, [codeSent, cooldown, email, isSending, loadingAccount, mode]);

  const handleVerifyCode = useCallback(async () => {
    setErrorMsg("");
    setHasCodeError(false);

    if (!codeSent) {
      setErrorMsg("Send a reset code to your email first.");
      return;
    }

    const digits = code.replace(/\D/g, "");
    if (digits.length < OTP_LENGTH) {
      setHasCodeError(true);
      setErrorMsg("Enter the 6-digit code from your email.");
      return;
    }

    setIsVerifyingCode(true);
    try {
      if (mode === "forgot") {
        await postVerifyForgotPasswordCode(effectiveEmail, digits);
      } else {
        await postVerifyChangePasswordCode(digits);
      }
      setCodeVerified(true);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Invalid code — please try again.";
      setHasCodeError(true);
      setErrorMsg(msg);
      setCode("");
    } finally {
      setIsVerifyingCode(false);
    }
  }, [code, codeSent, effectiveEmail, mode]);

  const handleSubmit = useCallback(async () => {
    setErrorMsg("");
    setHasCodeError(false);

    if (!codeVerified) {
      setErrorMsg("Verify the code from your email first.");
      return;
    }

    const digits = code.replace(/\D/g, "");
    if (digits.length < OTP_LENGTH) {
      setHasCodeError(true);
      setErrorMsg("Enter the 6-digit code from your email.");
      return;
    }

    const passwordError = signupPasswordValidationError(newPassword);
    if (passwordError) {
      setErrorMsg(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "forgot") {
        await postResetPassword(effectiveEmail, digits, newPassword);
      } else {
        await postConfirmChangePassword(digits, newPassword);
      }

      await notifyPasswordChanged();
      Alert.alert(
        "Password updated",
        "Your password has been changed. Please sign in again with your new password.",
        [{ text: "OK", onPress: onSuccess }],
      );
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not update password. Try again.";
      if (/invalid reset code/i.test(msg)) {
        setHasCodeError(true);
        setCode("");
      }
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  }, [code, codeVerified, confirmPassword, effectiveEmail, mode, newPassword, onSuccess]);

  const passwordToggle = (visible: boolean, onToggle: () => void, label: string) => (
    <Pressable
      onPress={onToggle}
      style={authFormFieldStyles.passwordToggle}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
    >
      <Ionicons name={visible ? "eye-outline" : "eye-off-outline"} size={20} color={tk.icon} />
    </Pressable>
  );

  const title = mode === "forgot" ? "Forgot password" : "Change password";
  const missingEmail = mode === "change" && !loadingAccount && !effectiveEmail;
  const subtitle = loadingAccount
    ? "Loading your account…"
    : missingEmail
      ? "This account has no email address. Password reset requires an email on file."
      : codeVerified
        ? "Code verified. Set your new password below."
        : codeSent
          ? `Code sent to ${displayEmail}. Enter it below and tap Verify code.`
          : mode === "forgot"
            ? "Enter your email, send a code, then verify it before setting a new password."
            : `Send a code to ${displayEmail}, then verify it before setting a new password.`;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "right", "bottom", "left"]}>
      <StatusBar style="dark" />
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
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <Pressable
            onPress={onBack}
            style={styles.backBtn}
            accessibilityLabel={`Go back to ${backLabel}`}
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={22} color={tk.heroTitle} />
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>

          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed-outline" size={28} color={tk.textPrimary} />
            </View>

            <Text style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroSubtitle}>{subtitle}</Text>

            {loadingAccount ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={tk.violetLight} />
              </View>
            ) : missingEmail ? null : (
              <>
                {mode === "forgot" && (
                  <AuthFormField
                    label="Email address"
                    placeholder="you@email.com"
                    value={email}
                    onChange={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    editable={!codeSent}
                    icon={<Ionicons name="mail-outline" size={17} color={tk.icon} />}
                  />
                )}

                <Text style={styles.otpLabel}>6-digit code</Text>
                <OtpInput
                  value={code}
                  onChange={(val) => {
                    setCode(val);
                    if (codeVerified) {
                      setCodeVerified(false);
                      setNewPassword("");
                      setConfirmPassword("");
                    }
                  }}
                  hasError={hasCodeError}
                  isFocused={otpFocused}
                  onFocus={() => setOtpFocused(true)}
                />

                {!!errorMsg && !codeVerified && <Text style={styles.errorText}>{errorMsg}</Text>}

                <View style={styles.resendRow}>
                  <Pressable
                    onPress={() => void handleSendCode()}
                    disabled={
                      isSending ||
                      cooldown > 0 ||
                      (mode === "forgot" && !email.trim()) ||
                      (mode === "change" && !effectiveEmail)
                    }
                    style={[
                      styles.resendBtn,
                      (isSending ||
                        cooldown > 0 ||
                        (mode === "forgot" && !email.trim()) ||
                        (mode === "change" && !effectiveEmail)) &&
                        styles.resendBtnDisabled,
                    ]}
                    accessibilityLabel={codeSent ? "Resend reset code" : "Send reset code"}
                    accessibilityRole="button"
                  >
                    {isSending ? (
                      <ActivityIndicator size="small" color={tk.textPrimary} />
                    ) : cooldown > 0 ? (
                      <Text style={styles.resendBtnTextDisabled}>
                        {codeSent ? "Resend code" : "Send code"} ({cooldown}s)
                      </Text>
                    ) : (
                      <Text style={styles.resendBtnText}>
                        {codeSent ? "Resend code" : "Send code"}
                      </Text>
                    )}
                  </Pressable>
                </View>

                {!codeVerified && (
                  <>
                    <View style={styles.divider} />
                    <Pressable
                      style={[
                        authFormButtonStyles.primaryButton,
                        styles.btnPrimary,
                        (code.replace(/\D/g, "").length < OTP_LENGTH || isVerifyingCode) &&
                          styles.submitBtnDisabled,
                      ]}
                      onPress={() => void handleVerifyCode()}
                      disabled={code.replace(/\D/g, "").length < OTP_LENGTH || isVerifyingCode}
                      accessibilityRole="button"
                      accessibilityLabel="Verify code"
                    >
                      {isVerifyingCode ? (
                        <ActivityIndicator color={tk.primaryBtnText} />
                      ) : (
                        <Text style={authFormButtonStyles.primaryButtonText}>VERIFY CODE</Text>
                      )}
                    </Pressable>
                  </>
                )}

                {codeVerified && (
                  <>
                    <View style={styles.divider} />

                    <AuthFormField
                      label="New password"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={setNewPassword}
                      inputRef={newRef}
                      secureTextEntry={!showNew}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      textContentType="newPassword"
                      spellCheck={false}
                      icon={<Ionicons name="lock-closed-outline" size={17} color={tk.icon} />}
                      suffix={passwordToggle(showNew, () => setShowNew((v) => !v), "new password")}
                    />

                    <View style={styles.passwordHintsContainer}>
                      <Text style={styles.passwordHintLabel}>Password requirements:</Text>
                      {SIGNUP_PASSWORD_REQUIREMENTS.map((req) => {
                        const met = req.test(newPassword);
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

                    <AuthFormField
                      label="Confirm new password"
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      inputRef={confirmRef}
                      secureTextEntry={!showConfirm}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      textContentType="newPassword"
                      spellCheck={false}
                      icon={<Ionicons name="lock-closed-outline" size={17} color={tk.icon} />}
                      suffix={passwordToggle(
                        showConfirm,
                        () => setShowConfirm((v) => !v),
                        "confirm password",
                      )}
                      containerStyle={styles.confirmField}
                    />

                    {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

                    <Pressable
                      style={[
                        authFormButtonStyles.primaryButton,
                        styles.btnPrimary,
                        submitting && styles.submitBtnDisabled,
                      ]}
                      onPress={() => void handleSubmit()}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel="Update password"
                      android_ripple={{ color: "rgba(12, 30, 74, 0.14)" }}
                    >
                      {submitting ? (
                        <ActivityIndicator color={tk.primaryBtnText} />
                      ) : (
                        <Text style={authFormButtonStyles.primaryButtonText}>UPDATE PASSWORD</Text>
                      )}
                    </Pressable>
                  </>
                )}
              </>
            )}
          </View>
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
    paddingTop: 8,
    paddingBottom: 24,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
    color: tk.heroTitle,
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
    fontWeight: "600",
    color: tk.textPrimary,
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    color: tk.textSub,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 18,
    lineHeight: 19,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  resendRow: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 4,
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
    fontWeight: "600",
    color: tk.textPrimary,
  },
  resendBtnTextDisabled: {
    fontSize: 13,
    fontWeight: "600",
    color: tk.textMuted,
  },
  otpLabel: {
    fontSize: 11,
    fontWeight: "600",
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
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    marginTop: 8,
    marginBottom: 20,
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
    fontWeight: "600",
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
  passwordHintsContainer: {
    marginTop: -4,
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
    color: tk.fieldLabel,
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
  confirmField: {
    marginBottom: 8,
  },
  errorText: {
    color: tk.error,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 6,
    marginBottom: 4,
    textAlign: "center",
  },
  btnPrimary: {
    marginTop: 4,
    marginBottom: 0,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
});
