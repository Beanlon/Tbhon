import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../contexts/ThemeContext";

const IOT_INSTRUCTIONS = [
  "Stay on the same Wi‑Fi network as the screening device",
  "Answer a quick symptoms & exposure checklist on this phone",
  "The device will record 3 separate coughs — follow the prompts on the hardware",
  "Sputum / phlegm capture is optional and is taken on the screening device",
];

const LEGACY_INSTRUCTIONS = [
  "Find a quiet environment",
  "Answer a quick symptoms & exposure checklist",
  "You will record 3 separate coughs, one at a time",
  "Sputum / phlegm photo is optional — add one only if you can",
];

type Props = {
  onClose?: () => void;
  /** When true, routes into IoT checklist flow (default for stack screening). */
  iotMode?: boolean;
};

export default function InstructionsScreen({ onClose, iotMode = false }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const instructions = iotMode ? IOT_INSTRUCTIONS : LEGACY_INSTRUCTIONS;

  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  const startScreening = () => {
    if (onClose) onClose();
    router.push({
      pathname: "/screening/checklist",
      params: { from: iotMode ? "iot-instructions" : "instructions" },
    } as any);
  };

  return (
    <>
      <StatusBar style={colors.statusBar} backgroundColor={colors.background} translucent={false} />
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 24 }}
        >
          <View className="flex-row items-center justify-between px-5 pb-5">
            <Text className="text-2xl font-bold" style={{ color: colors.text }}>Instructions</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color={colors.text} />
            </TouchableOpacity>
          </View>

          {iotMode ? (
            <View className="mx-5 mb-4 rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.primaryLight }}>
              <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
                Your phone shows progress only — recording and imaging happen on the connected
                hardware.
              </Text>
            </View>
          ) : null}

          <View className="mt-2 px-5">
            {instructions.map((instruction, idx) => (
              <View
                key={idx}
                className="mb-5 flex-row items-center rounded-2xl border p-5"
                style={{ borderColor: colors.cardBorder, backgroundColor: colors.surface }}
              >
                <View className="mr-4 size-11 min-w-11 items-center justify-center rounded-full" style={{ backgroundColor: colors.primary }}>
                  <Text className="text-lg font-bold text-white">{idx + 1}</Text>
                </View>

                <Text className="flex-1 text-base font-semibold leading-5" style={{ color: colors.text }}>
                  {instruction}
                </Text>
              </View>
            ))}
          </View>

          <View className="mb-10 mt-6 px-5">
            <TouchableOpacity
              onPress={startScreening}
              className="items-center justify-center rounded-xl px-5 py-4"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-base font-bold text-white">Start Screening</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </>
  );
}
