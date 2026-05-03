import { Stack } from "expo-router";
import React, { useEffect } from 'react';
import { Asset } from 'expo-asset';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

export default function RootLayout() {
  useEffect(() => {
    // Warm up the logo asset so it is available immediately when screens mount
    Asset.loadAsync(require('../assets/images/Tbhon assets/Tbhon Logo.png')).catch(() => {});
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="home/HomeScreen" options={{ headerShown: false }} />
      <Stack.Screen name="learn/learn" options={{ headerShown: false }} />
      <Stack.Screen name="landingpage/landingpage" options={{ headerShown: false }} />
      <Stack.Screen name="acountOptions/accountOptions" options={{ headerShown: false }} />
      <Stack.Screen name="login/login" options={{ headerShown: false }} />
      <Stack.Screen name="signUp/signUpPersonal" options={{ headerShown: false }} />
      <Stack.Screen name="signUp/signUpEmail" options={{ headerShown: false }} />
    </Stack>
  );
}
