import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../contexts/ThemeContext";

export default function PatientTypeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const goNewPatient = () => {
    router.push({
      pathname: "/screening/client-intake",
      params: { sessionId, from: "session-start" },
    } as any);
  };

  const goReturningPatient = () => {
    router.push({
      pathname: "/screening/returning-patient",
      params: { sessionId },
    } as any);
  };

  return (
    <>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: 32 }}
        >
          <View className="mb-6 flex-row items-center justify-between">
            <Pressable onPress={() => router.back()} hitSlop={12} className="p-1">
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
          </View>

          <Text className="mb-1 text-2xl font-bold" style={{ color: colors.text }}>
            Patient type
          </Text>
          <Text className="mb-8 text-sm leading-6" style={{ color: colors.textSecondary }}>
            Is this person new to the booth, or have they been screened here before and already have a TBhon account?
          </Text>

          <Pressable
            className="mb-4 rounded-3xl border p-5 active:opacity-80"
            style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
            onPress={goNewPatient}
            android_ripple={{ color: colors.primaryLight }}
          >
            <View className="mb-3 flex-row items-center gap-3">
              <View
                className="size-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: "#E8FAF5", borderWidth: 1, borderColor: "#C8EDE0" }}
              >
                <Ionicons name="person-add-outline" size={24} color="#0F766E" />
              </View>
              <Text className="text-lg font-bold" style={{ color: colors.text }}>
                New patient
              </Text>
            </View>
            <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
              First time being screened here. Enter their details to create a session record. They will receive a result slip QR after screening.
            </Text>
          </Pressable>

          <Pressable
            className="rounded-3xl border p-5 active:opacity-80"
            style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
            onPress={goReturningPatient}
            android_ripple={{ color: colors.primaryLight }}
          >
            <View className="mb-3 flex-row items-center gap-3">
              <View
                className="size-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: "#F3EEFF", borderWidth: 1, borderColor: "#E4D9FF" }}
              >
                <Ionicons name="person-outline" size={24} color="#5B5BFF" />
              </View>
              <Text className="text-lg font-bold" style={{ color: colors.text }}>
                Returning patient
              </Text>
            </View>
            <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
              Has a TBhon result account from a previous visit. Scan their TBhon QR or enter their email to link this session to their existing account.
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}
