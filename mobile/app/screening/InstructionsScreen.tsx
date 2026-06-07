import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../contexts/ThemeContext";
import { ApiError } from "../../services/backendApi";
import { SPUTUM_SMEAR_STEP_INSTRUCTION } from "../../constants/iotScreening";
import { startWalkInSession } from "../../utils/startWalkInSession";

const IOT_INSTRUCTIONS = [
  "Confirm this phone and the booth device are on the same Wi‑Fi network",
  "Record patient details on this phone, then complete the symptoms checklist",
  "Guide the patient to record 3 separate coughs on the booth device, one at a time",
  SPUTUM_SMEAR_STEP_INSTRUCTION,
];

type Props = {
  onClose?: () => void;
};

export default function InstructionsScreen({ onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [starting, setStarting] = useState(false);

  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  const startSession = async () => {
    setStarting(true);
    try {
      const sessionId = await startWalkInSession();
      if (onClose) onClose();
      router.push({
        pathname: "/screening/client-intake",
        params: { sessionId, from: "session-start" },
      } as any);
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not start session.";
      Alert.alert("Start session", message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 24 }}
        >
          <View className="flex-row items-center justify-between px-5 pb-5">
            <Text className="text-2xl font-bold" style={{ color: colors.text }}>
              Staff instructions
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View className="mx-5 mb-4 rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.primaryLight }}>
            <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
              You run the booth session. Cough recording happens on the booth device; prepare a sputum smear when
              when they provide a sample.
            </Text>
          </View>

          <View className="mt-2 px-5">
            {IOT_INSTRUCTIONS.map((instruction, idx) => (
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
              onPress={() => void startSession()}
              disabled={starting}
              className="items-center justify-center rounded-xl px-5 py-4"
              style={{ backgroundColor: starting ? colors.surfaceAlt : colors.primary }}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-bold text-white">Start session</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </>
  );
}
