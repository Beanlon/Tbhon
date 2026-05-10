import { Stack } from "expo-router";

/**
 * Per-screen `StatusBar` (see each route) matches home/login: dark icons on light
 * backgrounds, light icons on navy screens. Do not force one global style here.
 *
 * `contentStyle.backgroundColor` is set per-route below so the native transition
 * container matches each screen's own background. Without this, dark screens
 * (recording / phlegm / processing) briefly flash white on Android transitions
 * before their `SafeAreaView` with `bg-navy` paints over the stack container.
 */
const NAVY = "#0B1530";
const LIGHT = "#FFFFFF";
const SLATE_50 = "#F8FAFC";

export default function ScreeningLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        header: () => null,
        headerShadowVisible: false,
        headerTransparent: true,
        contentStyle: { backgroundColor: LIGHT },
      }}
    >
      <Stack.Screen
        name="recording"
        options={{ contentStyle: { backgroundColor: NAVY } }}
      />
      <Stack.Screen
        name="phlegm"
        options={{ contentStyle: { backgroundColor: NAVY } }}
      />
      <Stack.Screen
        name="processing"
        options={{ contentStyle: { backgroundColor: NAVY } }}
      />
      <Stack.Screen
        name="details"
        options={{ contentStyle: { backgroundColor: SLATE_50 } }}
      />
      <Stack.Screen
        name="result"
        options={{ contentStyle: { backgroundColor: LIGHT } }}
      />
      <Stack.Screen
        name="review"
        options={{ contentStyle: { backgroundColor: LIGHT } }}
      />
    </Stack>
  );
}
