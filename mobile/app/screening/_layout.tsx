import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function ScreeningLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: "#0B1530" },
          headerShadowVisible: false,
          headerTransparent: true,
          contentStyle: { backgroundColor: "#0B1530" },
        }}
      />
    </>
  );
}

