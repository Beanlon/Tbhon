import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

/** Legacy route — forwards to the IoT device cough capture screen. */
export default function RecordingRedirectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    checklist?: string;
    sessionId?: string;
  }>();

  useEffect(() => {
    router.replace({
      pathname: "/screening/iot-cough",
      params: {
        iotMode: "1",
        checklist: typeof params.checklist === "string" ? params.checklist : "",
        ...(typeof params.sessionId === "string" && params.sessionId.trim().length > 0
          ? { sessionId: params.sessionId.trim() }
          : {}),
      },
    } as any);
  }, [params.checklist, params.sessionId, router]);

  return (
    <View className="flex-1 items-center justify-center bg-navy">
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
