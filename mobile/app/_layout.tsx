import "../global.css";
import { Stack, useRouter } from "expo-router";
import React, { useEffect } from 'react';
import { Asset } from 'expo-asset';
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import { TBHON_ICON, TBHON_LOGO } from "../constants/branding";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { getMe } from "../services/backendApi";
import { getAuthToken } from "../utils/authStorage";
import { setCachedProfile, peekProfile } from "../utils/profileCache";
import { consumePendingAppRoute } from "../utils/pendingAppRoute";
import { parsePatientClaimToken } from "../constants/patientAccess";
import {
  configureNotificationPresentation,
  handleNotificationResponse,
  syncUnverifiedEngagementNotifications,
} from "../services/unverifiedEngagementNotifications";
import { subscribeToNotificationResponses } from "../utils/nativeNotifications";

void SplashScreen.preventAutoHideAsync().catch(() => {});

if (__DEV__) {
  LogBox.ignoreLogs([
    "Unable to activate keep awake",
    /Unable to activate keep awake/i,
  ]);
}

function RootNavigator() {
  const { colors } = useTheme();
  const router = useRouter();

  useEffect(() => {
    Asset.loadAsync([TBHON_LOGO, TBHON_ICON]).catch(() => {});
  }, []);

  useEffect(() => {
    const routePatientClaim = (url: string | null) => {
      if (!url) return;
      const token = parsePatientClaimToken(url);
      if (!token) return;
      router.push({
        pathname: "/patient/access",
        params: { token, autoClaim: "1" },
      } as never);
    };

    void Linking.getInitialURL().then(routePatientClaim);
    const sub = Linking.addEventListener("url", ({ url }) => routePatientClaim(url));
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    configureNotificationPresentation();

    const sub = subscribeToNotificationResponses((response) => {
      void (async () => {
        await handleNotificationResponse(response);
        const route = await consumePendingAppRoute();
        if (route === "verifyEmail") {
          router.push("/verifyEmail/verifyEmail" as never);
        }
      })();
    });

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    void (async () => {
      const token = await getAuthToken();
      if (!token) return;
      try {
        const cached = peekProfile();
        if (cached) {
          await syncUnverifiedEngagementNotifications(cached);
        }
        const { user } = await getMe();
        setCachedProfile(user);
        await syncUnverifiedEngagementNotifications(user);
      } catch {
        // offline — skip sync
      }
    })();
  }, []);

  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as typeof globalThis & {
      onunhandledrejection?: (e: { reason?: unknown; preventDefault?: () => void }) => void;
    };
    const prev = g.onunhandledrejection;
    g.onunhandledrejection = (event) => {
      const r = event?.reason as { message?: string } | string | undefined;
      const msg = typeof r === "string" ? r : String(r?.message ?? r ?? "");
      if (/keep awake/i.test(msg)) {
        event?.preventDefault?.();
        return;
      }
      if (typeof prev === "function") prev(event);
    };
    return () => {
      g.onunhandledrejection = prev;
    };
  }, []);

  return (
    <>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          animation: "slide_from_right",
          animationDuration: 220,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ animation: "none" }} />
        <Stack.Screen
          name="home/HomeScreen"
          options={{ animation: "none", animationDuration: 0 }}
        />
        <Stack.Screen name="learn/learn" />
        <Stack.Screen name="landingpage/landingpage" />
        <Stack.Screen name="acountOptions/accountOptions" />
        <Stack.Screen name="login/login" />
        <Stack.Screen name="forgotPassword/forgotPassword" />
        <Stack.Screen name="signUp/signUp" />
        <Stack.Screen name="verifyEmail/verifyEmail" />
        <Stack.Screen name="changePassword/changePassword" />
        <Stack.Screen name="admin" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="patient" options={{ animation: "slide_from_right" }} />
        <Stack.Screen
          name="screening"
          options={{
            // Slide from right - device setup is now an in-tree overlay, not navigation.
            animation: "slide_from_right",
            animationDuration: 220,
            gestureEnabled: true,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );
}
