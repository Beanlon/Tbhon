import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { useTheme } from "../../contexts/ThemeContext";
import { useRequireBoothOperator } from "../../utils/useRequireBoothOperator";

/**
 * Per-screen `StatusBar` (see each route) matches home/login: dark icons on light
 * backgrounds, light icons on navy screens. Do not force one global style here.
 *
 * `contentStyle.backgroundColor` is set per-route below so the native transition
 * container matches each screen's own background. Without this, dark screens
 * (recording / phlegm / processing) briefly flash white on Android transitions
 * before their `SafeAreaView` with `bg-navy` paints over the stack container.
 */
const RECORDING_BG = "#0B1530";

export default function ScreeningLayout() {
  const { colors } = useTheme();
  const lightBg = colors.background;
  const { checked, allowed } = useRequireBoothOperator();

  if (!checked || !allowed) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: lightBg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        gestureEnabled: true,
        headerShown: false,
        header: () => null,
        headerShadowVisible: false,
        headerTransparent: false,
        animation: "slide_from_right",
        animationDuration: 200,
        contentStyle: { backgroundColor: lightBg },
      }}
    >
      <Stack.Screen
        name="iot-hardware"
        options={{ contentStyle: { backgroundColor: lightBg }, gestureEnabled: false }}
      />
      <Stack.Screen
        name="iot-instructions"
        options={{ contentStyle: { backgroundColor: lightBg } }}
      />
      <Stack.Screen
        name="client-intake"
        options={{ contentStyle: { backgroundColor: lightBg } }}
      />
      <Stack.Screen
        name="checklist"
        options={{ contentStyle: { backgroundColor: lightBg } }}
      />
      <Stack.Screen
        name="iot-cough"
        options={{
          contentStyle: { backgroundColor: RECORDING_BG },
          animation: "fade",
          animationDuration: 150,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="iot-sputum"
        options={{
          contentStyle: { backgroundColor: RECORDING_BG },
          animation: "fade",
          animationDuration: 150,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="recording"
        options={{
          contentStyle: { backgroundColor: RECORDING_BG },
          animation: "fade",
          animationDuration: 150,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="phlegm"
        options={{
          contentStyle: { backgroundColor: RECORDING_BG },
          animation: "fade",
          animationDuration: 150,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="processing"
        options={{
          contentStyle: { backgroundColor: RECORDING_BG },
          animation: "fade",
          animationDuration: 150,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="details" options={{ contentStyle: { backgroundColor: lightBg } }} />
      <Stack.Screen name="staff-review" options={{ contentStyle: { backgroundColor: lightBg } }} />
      <Stack.Screen name="result" options={{ contentStyle: { backgroundColor: lightBg } }} />
      <Stack.Screen name="review" options={{ contentStyle: { backgroundColor: lightBg } }} />
    </Stack>
  );
}
