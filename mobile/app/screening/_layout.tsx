import { Stack } from "expo-router";

/**
 * Per-screen `StatusBar` (see each route) matches home/login: dark icons on light
 * backgrounds, light icons on navy screens. Do not force one global style here.
 */
export default function ScreeningLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        header: () => null,
        headerShadowVisible: false,
        headerTransparent: true,
        contentStyle: { backgroundColor: "#FFFFFF" },
      }}
    />
  );
}
