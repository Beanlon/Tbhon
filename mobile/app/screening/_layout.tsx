import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function ScreeningLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#0B1530" translucent={false} />
      <Stack
        screenOptions={{
          // On web, React Navigation can still mount a header container (with a bottom border)
          // even when headerShown is false. Providing a null header removes it completely.
          headerShown: false,
          header: () => null,
          headerStyle: { backgroundColor: "#0B1530" },
          headerShadowVisible: false,
          headerTransparent: true,
          contentStyle: { backgroundColor: "#0B1530" },
        }}
      />
    </>
  );
}

