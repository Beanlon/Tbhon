import "../global.css";
import { Stack } from "expo-router";
import React, { useEffect } from 'react';
import { Asset } from 'expo-asset';
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";
import { TBHON_ICON, TBHON_LOGO } from "../constants/branding";

void SplashScreen.preventAutoHideAsync().catch(() => {});

// expo-keep-awake (splash / camera / recording) can reject on some Android + Expo Go
// builds; the app usually still works — avoid a blocking dev error overlay.
if (__DEV__) {
  LogBox.ignoreLogs([
    "Unable to activate keep awake",
    /Unable to activate keep awake/i,
  ]);
}

export default function RootLayout() {
  useEffect(() => {
    // Warm up the logo asset so it is available immediately when screens mount
    Asset.loadAsync([TBHON_LOGO, TBHON_ICON]).catch(() => {});
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
      <StatusBar style="dark" translucent={false} />
      <Stack screenOptions={{ gestureEnabled: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="home/HomeScreen" options={{ headerShown: false }} />
        <Stack.Screen name="learn/learn" options={{ headerShown: false }} />
        <Stack.Screen name="landingpage/landingpage" options={{ headerShown: false }} />
        <Stack.Screen name="acountOptions/accountOptions" options={{ headerShown: false }} />
        <Stack.Screen name="login/login" options={{ headerShown: false }} />
        <Stack.Screen name="signUp/signUp" options={{ headerShown: false }} />
        <Stack.Screen name="screening" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
