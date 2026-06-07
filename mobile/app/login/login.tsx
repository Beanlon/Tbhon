import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import CachedImage from "../components/CachedImage";
import { AuthFormField, authFormFieldStyles } from "../components/AuthFormField";
import { TBHON_LOGO } from "../../constants/branding";
import { getBrandLogoLayout } from "../../utils/brandLogoLayout";
import { authFormTk as tk } from "../../constants/authFormTheme";
import { authFormButtonStyles } from "../../constants/authFormStyles";
import { palette } from "../../constants/palette";
import { useNavigation, useRouter, useLocalSearchParams } from "expo-router";
import { ApiError, getMe, postLogin } from "../../services/backendApi";
import { resetAfterAuth } from "../../utils/authNavigation";
import { onUnverifiedAccountSession } from "../../services/unverifiedEngagementNotifications";
import { getAuthToken, saveAuthSession } from "../../utils/authStorage";
import { setCachedProfile } from "../../utils/profileCache";
import { STAFF_EXISTING_DESC, PATIENT_LOGIN_HINT, PATIENT_ACCESS_TITLE } from "../../constants/patientAccess";
import { useIosPasswordSecureMaskSync } from "../../utils/useIosPasswordSecureMaskSync";

const SCROLL_FUDGE = 8;

export default function Login() {
  const router = useRouter();
  const navigation = useNavigation();
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const loginIntent = intent === "patient" ? "patient" : "staff";
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const loginPasswordRef = useRef<TextInput>(null);
  useIosPasswordSecureMaskSync(loginPasswordRef, passwordVisible, password);
  const [scrollViewportH, setScrollViewportH] = useState(0);
  const [innerContentH, setInnerContentH] = useState(0);

  const compactScreen = windowHeight < 760 || windowWidth < 390;
  const sheetPaddingHorizontal = compactScreen ? 16 : 18;
  const sheetPaddingTop = compactScreen ? 22 : 26;
  const sheetPaddingBottom = compactScreen ? 22 : 26;

  const scrollEnabled = useMemo(() => {
    if (scrollViewportH <= 0 || innerContentH <= 0) return true;
    return innerContentH > scrollViewportH + SCROLL_FUDGE;
  }, [scrollViewportH, innerContentH]);

  const centerInViewport = scrollViewportH > 0 && !scrollEnabled;

  const scrollMinHeight = useMemo(
    () => Math.max(0, windowHeight - insets.top - insets.bottom),
    [windowHeight, insets.top, insets.bottom],
  );

  const brandLogo = useMemo(() => {
    const layout = getBrandLogoLayout(windowHeight, windowWidth, 40);
    return {
      ...layout,
      topMargin: Math.max(12, layout.topMargin - 14),
    };
  }, [windowHeight, windowWidth]);

  const scrollContentStyle = useMemo((): StyleProp<ViewStyle> => {
    return {
      flexGrow: 1,
      minHeight: scrollMinHeight,
      justifyContent: centerInViewport ? "center" : "flex-start",
      paddingBottom: insets.bottom + 12,
    };
  }, [centerInViewport, insets.bottom, scrollMinHeight]);

  const onScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    setScrollViewportH(e.nativeEvent.layout.height);
  }, []);

  const onInnerLayout = useCallback((e: LayoutChangeEvent) => {
    setInnerContentH(e.nativeEvent.layout.height);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const token = await getAuthToken();
        if (token && active) {
          try {
            const { user } = await getMe();
            setCachedProfile(user);
            resetAfterAuth(navigation);
          } catch {
            resetAfterAuth(navigation);
          }
        }
      })();
      return () => {
        active = false;
      };
    }, [navigation]),
  );

  const handleLogIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert("Log in", "Please enter email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const { accessToken, refreshToken, token, user } = await postLogin(trimmedEmail, password);
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
      Alert.alert("Log in failed", message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = () => {
    router.push("/signUp/signUp");
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "right", "bottom", "left"]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          scrollEnabled={scrollEnabled}
          bounces={scrollEnabled}
          alwaysBounceVertical={false}
          onLayout={onScrollViewLayout}
          contentContainerStyle={scrollContentStyle}
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
              <CachedImage
                source={TBHON_LOGO}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View
            style={[
              styles.cardContainer,
              {
                paddingHorizontal: sheetPaddingHorizontal,
                paddingTop: sheetPaddingTop,
                paddingBottom: sheetPaddingBottom,
              },
            ]}
          >
            <Text style={styles.welcomeHeading}>
              Welcome{" "}
              <Text style={styles.welcomeHeadingAccent}>back!</Text>
            </Text>
            <Text style={styles.sectionSubtitle}>
              {loginIntent === "patient"
                ? PATIENT_LOGIN_HINT
                : STAFF_EXISTING_DESC}
            </Text>

            <AuthFormField
              label="Email Address"
              placeholder="you@email.com"
              value={email}
              onChange={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              icon={<Ionicons name="mail-outline" size={17} color={tk.icon} />}
            />

            <AuthFormField
              label="Password"
              placeholder="Your password"
              value={password}
              onChange={setPassword}
              inputRef={loginPasswordRef}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              spellCheck={false}
              icon={<Ionicons name="lock-closed-outline" size={17} color={tk.icon} />}
              suffix={
                <Pressable
                  onPress={() => setPasswordVisible((v) => !v)}
                  style={authFormFieldStyles.passwordToggle}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    passwordVisible ? "Hide password" : "Show password"
                  }
                >
                  <Ionicons
                    name={passwordVisible ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color={tk.icon}
                  />
                </Pressable>
              }
            />

            <Pressable
              onPress={() =>
                router.push(
                  `/forgotPassword/forgotPassword?intent=${loginIntent}` as never,
                )
              }
              style={styles.forgotRow}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                loginIntent === "patient"
                  ? "Reset result account password"
                  : "Forgot password"
              }
            >
              <Text style={styles.forgotLink}>
                {loginIntent === "patient" ? "Forgot result account password?" : "Forgot password?"}
              </Text>
            </Pressable>

            <Pressable
              style={authFormButtonStyles.primaryButton}
              onPress={handleLogIn}
              disabled={submitting}
              android_ripple={{ color: "rgba(12, 30, 74, 0.14)" }}
            >
              {submitting ? (
                <ActivityIndicator color={tk.primaryBtnText} />
              ) : (
                <Text style={authFormButtonStyles.primaryButtonText}>LOG IN</Text>
              )}
            </Pressable>

            {loginIntent === "patient" ? (
              <View style={styles.subtleRow}>
                <Pressable onPress={() => router.push("/patient/access" as never)} hitSlop={8}>
                  <Text style={styles.subtleLink}>{PATIENT_ACCESS_TITLE}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.subtleRow}>
                <Text style={styles.subtleText}>{"Don't have an account? "}</Text>
                <Pressable onPress={handleSignUp} hitSlop={8}>
                  <Text style={styles.subtleLink}>Sign up</Text>
                </Pressable>
              </View>
            )}
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  welcomeHeading: {
    fontSize: 22,
    fontWeight: "800",
    color: tk.textPrimary,
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  welcomeHeadingAccent: {
    fontWeight: "500",
    color: tk.textSub,
  },
  sectionSubtitle: {
    color: tk.textSub,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 22,
    lineHeight: 20,
  },
  subtleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 18,
  },
  forgotRow: {
    alignSelf: "flex-end",
    marginTop: -8,
    marginBottom: 4,
  },
  forgotLink: {
    color: tk.violetLight,
    fontSize: 13,
    fontWeight: "600",
  },
  subtleText: {
    color: tk.textSub,
    fontSize: 14,
  },
  subtleLink: {
    color: tk.violetLight,
    fontSize: 14,
    fontWeight: "700",
  },
});
