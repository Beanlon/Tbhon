import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function InstructionsScreen({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleClose = () => {
    if (onClose) onClose();
    else router.back();
  };

  const instructions = [
    "Find a quiet environment",
    "Answer a quick symptoms & exposure checklist",
    "You will record 3 separate coughs, one at a time",
    "Sputum / phlegm photo is optional — add one only if you can",
  ];

  return (
    <>
      <StatusBar style="dark" backgroundColor="#fff" translucent={false} />
      <View className="flex-1 bg-white">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 24 }}
        >
          <View className="flex-row items-center justify-between px-5 pb-5">
            <Text className="text-2xl font-bold text-black">Instructions</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <View className="mt-5 px-5">
            {instructions.map((instruction, idx) => (
              <View
                key={idx}
                className="mb-5 flex-row items-center rounded-2xl border border-neutral-200 bg-neutral-100 p-5"
              >
                <View className="mr-4 size-11 min-w-11 items-center justify-center rounded-full bg-navy">
                  <Text className="text-lg font-bold text-white">{idx + 1}</Text>
                </View>

                <Text className="flex-1 text-base font-semibold leading-5 text-neutral-800">
                  {instruction}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-10 mb-10 px-5">
            <TouchableOpacity
              onPress={() => {
                if (onClose) onClose();
                router.push({ pathname: "/screening/checklist" as any, params: { from: "instructions" } as any });
              }}
              className="items-center justify-center rounded-xl bg-navy px-5 py-4"
            >
              <Text className="text-base font-bold text-white">Start Screening</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </>
  );
}
