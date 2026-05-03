import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function InstructionsScreen({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  // Instructions data
  const instructions = [
    "Find a quiet environment",
    "You will record 3 separate coughs, one at a time",
    "Have your phlegm sample ready",
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: "#000" }}>Instructions</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Instructions List */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          {instructions.map((instruction, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 18,
                backgroundColor: "#f8f8f8",
                borderRadius: 14,
                padding: 18,
                borderWidth: 1,
                borderColor: "#efefef",
              }}
            >
              {/* Step number circle */}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "#0a1428",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 16,
                  minWidth: 44,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: "bold", color: "#fff" }}>{idx + 1}</Text>
              </View>

              {/* Instruction text */}
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#333",
                  flex: 1,
                  lineHeight: 20,
                }}
              >
                {instruction}
              </Text>
            </View>
          ))}
        </View>

        {/* Start Button */}
        <View style={{ paddingHorizontal: 20, marginTop: 40, marginBottom: 40 }}>
          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push({ pathname: "/screening/recording" as any });
            }}
            style={{
              backgroundColor: "#0a1428",
              paddingVertical: 16,
              paddingHorizontal: 20,
              borderRadius: 12,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Start Recording</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
