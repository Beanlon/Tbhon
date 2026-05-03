import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";

export default function ProcessingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ audioDone?: string; imageUri?: string }>();

  useEffect(() => {
    // TODO: replace timeout with real API call; pass actual risk from response
    const timer = setTimeout(() => {
      router.replace({
        pathname: "/screening/result",
        params: { risk: "low" },
      } as any);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0B1530",
        paddingTop: Math.max(insets.top, 16) + 8,
        paddingBottom: Math.max(insets.bottom, 16) + 18,
        paddingHorizontal: 18,
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <ActivityIndicator size="large" color="#FFFFFF" />
      <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900", textAlign: "center" }}>
        Analyzing data… Please wait
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, textAlign: "center" }}>
        This may take a few seconds
      </Text>
    </View>
  );
}
