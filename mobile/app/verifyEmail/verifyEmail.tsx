import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authFormTk as tk } from "../../constants/authFormTheme";
import { authFormButtonStyles } from "../../constants/authFormStyles";
import { ApiError, getMe, postSendEmailVerification, postVerifyEmail } from "../../services/backendApi";
import { resetToAuthenticatedHome, resetToLanding } from "../../utils/authNavigation";
import { onUserBecameVerified } from "../../services/unverifiedEngagementNotifications";
import { clearAuthToken, getAuthToken } from "../../utils/authStorage";
import { clearProfileCache, setCachedProfile } from "../../utils/profileCache";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;

export default function VerifyEmailScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

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
    }
  }, [navigation]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || sending) return;
    setSending(true);
    try {
      await postSendEmailVerification();
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SEC);
      Alert.alert("Email sent", "A verification code was sent to your inbox.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not resend code.";
      Alert.alert("Resend failed", msg);
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== CODE_LENGTH) {
      Alert.alert("Verification", `Enter the ${CODE_LENGTH}-digit code from your email.`);
      return;
    }
    setSubmitting(true);
    try {
      await postVerifyEmail(digits);
      const { user } = await getMe();
      setCachedProfile(user);
      await onUserBecameVerified();
      if (router.canGoBack()) {
        router.back();
      } else {
        resetToAuthenticatedHome(navigation);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Verification failed.";
      Alert.alert("Invalid code", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await clearAuthToken();
    clearProfileCache();
    resetToLanding(navigation);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "right", "bottom", "left"]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="mail-outline" size={36} color={tk.violetLight} />
          </View>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            {email
              ? `Optional but recommended. Verify ${email} to download screening history and share results.`
              : "Optional but recommended. Verify your email to download screening history and share results."}
          </Text>
          <Text style={styles.hint}>
            Tap &quot;Send code&quot; if you did not receive a code at signup.
          </Text>

          <Text style={styles.label}>Verification code</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
            maxLength={CODE_LENGTH}
            placeholder="000000"
            placeholderTextColor={tk.textMuted}
            selectionColor={tk.cursorColor}
          />

          <Pressable
            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
            onPress={() => void handleVerify()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={tk.primaryBtnText} />
            ) : (
              <Text style={styles.primaryBtnText}>VERIFY EMAIL</Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.secondaryBtn, (sending || cooldown > 0) && styles.btnDisabled]}
            onPress={() => void handleResend()}
            disabled={sending || cooldown > 0}
          >
            {sending ? (
              <ActivityIndicator color={tk.textPrimary} />
            ) : (
              <Text style={styles.secondaryBtnText}>
                {cooldown > 0
                  ? `Resend code (${cooldown}s)`
                  : codeSent
                    ? "Resend code"
                    : "Send code"}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={() => void handleSignOut()} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tk.screenBg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  card: {
    backgroundColor: tk.cardBg,
    borderRadius: 24,
    padding: 24,
  },
  iconWrap: {
    alignSelf: "center",
    marginBottom: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: tk.violetGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: tk.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: tk.textSub,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 12,
  },
  hint: {
    color: tk.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 24,
  },
  label: {
    color: tk.fieldLabel,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  codeInput: {
    backgroundColor: tk.surface,
    borderWidth: 1,
    borderColor: tk.border,
    borderRadius: 12,
    color: tk.textPrimary,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: "center",
    paddingVertical: 14,
    marginBottom: 20,
    fontVariant: ["tabular-nums"],
  },
  primaryBtn: {
    ...authFormButtonStyles.primaryButton,
    marginBottom: 12,
  },
  primaryBtnText: {
    ...authFormButtonStyles.primaryButtonText,
  },
  secondaryBtn: {
    alignSelf: "stretch",
    backgroundColor: tk.secondaryBtnBg,
    borderWidth: 1,
    borderColor: tk.secondaryBtnBorder,
    borderRadius: 24,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  secondaryBtnText: {
    color: tk.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  signOut: {
    alignItems: "center",
    paddingVertical: 8,
  },
  signOutText: {
    color: tk.textMuted,
    fontSize: 14,
  },
});
