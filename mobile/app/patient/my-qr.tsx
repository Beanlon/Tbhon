import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../contexts/ThemeContext";
import { MyQrContent } from "./MyQrContent";

export default function MyQrScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />

      <View className="flex-row items-center border-b px-4 py-3" style={{ borderColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-lg font-black" style={{ color: colors.text }}>
          My TBhon QR
        </Text>
      </View>

      <MyQrContent />
    </SafeAreaView>
  );
}
