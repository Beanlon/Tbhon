import { View, Text, ScrollView, TextInput, TouchableOpacity } from "react-native";
import { useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import InstructionsScreen from "../screening/InstructionsScreen";
import { LearnContent } from "../learn/LearnContent";
import BottomNav, { BottomNavTab } from "../components/BottomNav";

const GaugeChart = () => (
  <View style={{ justifyContent: "center", alignItems: "center", position: "relative", width: 100, height: 100 }}>
    {/* Outer gauge ring - using border technique */}
    <View
      style={{
        width: 85,
        height: 85,
        borderRadius: 42.5,
        borderTopWidth: 12,
        borderRightWidth: 12,
        borderBottomWidth: 12,
        borderLeftWidth: 12,
        borderTopColor: "#FDB913",
        borderRightColor: "#E53935",
        borderBottomColor: "#66BB6A",
        borderLeftColor: "#66BB6A",
        backgroundColor: "transparent",
      }}
    />
    
    {/* Inner white circle (donut hole) */}
    <View
      style={{
        position: "absolute",
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#fff",
      }}
    />
    
    {/* Needle */}
    <View
      style={{
        position: "absolute",
        width: 2,
        height: 24,
        backgroundColor: "#1a2a3a",
        borderRadius: 1,
        transform: [{ rotate: "215deg" }],
      }}
    />
    
    {/* Center dot */}
    <View
      style={{
        position: "absolute",
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: "#1a2a3a",
        zIndex: 100,
      }}
    />
  </View>
);

const LungIllustration = () => (
  <View style={{ justifyContent: "center", alignItems: "center", width: 100, height: 100 }}>
    <Text style={{ fontSize: 65, textAlign: "center" }}>🫁</Text>
  </View>
);

export default function HomeScreen() {
  const router = useRouter();
  const [showInstructions, setShowInstructions] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomNavTab>("home");

  const handleTabPress = (tab: BottomNavTab) => {
    if (tab === "home") {
      setActiveTab("home");
      return;
    }

    if (tab === "screening") {
      setShowInstructions(true);
      return;
    }

    if (tab === "learn") {
      setActiveTab("learn");
      return;
    }
    if (tab === "profile") {
      router.push("/acountOptions/accountOptions");
      return;
    }

    if (tab === "history") {
      return;
    }
  };

  if (showInstructions) {
    return <InstructionsScreen onClose={() => setShowInstructions(false)} />;
  }

  if (activeTab === "learn") {
    return (
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={{ flex: 1 }}>
          <LearnContent />
        </View>

        <BottomNav activeTab="learn" onTabPress={handleTabPress} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ paddingHorizontal: '5.5%', paddingTop: '15%', paddingBottom: '7%' }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ fontSize: 14, color: "#666", marginBottom: 4 }}>👋 Hello!</Text>
              <Text style={{ fontSize: 28, fontWeight: "800", color: "#000" }}>Martin Shah</Text>
            </View>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: "#d8d8d8",
              }}
            />
          </View>
        </View>

        {/* Search Bar */}
        <View style={{ paddingHorizontal: '5.5%', marginBottom: '7%' }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#f8f8f8",
              borderRadius: 14,
              paddingHorizontal: '4%',
              height: 50,
              borderWidth: 1,
              borderColor: "#e8e8e8",
            }}
          >
            <Ionicons name="search" size={20} color="#999" />
            <TextInput
              placeholder="Search"
              style={{
                flex: 1,
                marginLeft: 10,
                fontSize: 15,
                color: "#333",
              }}
              placeholderTextColor="#bbb"
            />
          </View>
        </View>

        {/* Health Card */}
        <View style={{ paddingHorizontal: '5.5%', marginBottom: '8%' }}>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: '5%',
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#efefef",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.08,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            <View style={{ flex: 1, marginRight: '4%' }}>
              <Text style={{ fontSize: 13, color: "#333", marginBottom: '3%', lineHeight: 18 }}>
                Maintain lung health to support overall well-being.
              </Text>
              <TouchableOpacity
                onPress={() => setShowInstructions(true)}
                style={{
                  backgroundColor: "#1a1a2e",
                  paddingVertical: '2.5%',
                  paddingHorizontal: '4%',
                  borderRadius: 6,
                  alignSelf: "flex-start",
                  marginBottom: '3%',
                }}
              >
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Get Checked Now</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: "#0066cc" }}>Learn More →</Text>
            </View>
            <View
              style={{
                width: 100,
                height: 100,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <LungIllustration />
            </View>
          </View>
        </View>

        {/* Offered Services */}
        <View style={{ paddingHorizontal: '5.5%', marginBottom: '8%' }}>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: '4%', color: "#000" }}>Offered Services</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {[
              { icon: "mic", label: "Record Cough" },
              { icon: "camera", label: "Capture Phlegm" },
              { icon: "clipboard", label: "View Result" },
            ].map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={{
                  backgroundColor: "#fafafa",
                  borderRadius: 12,
                  padding: '4%',
                  alignItems: "center",
                  width: "31%",
                  borderWidth: 1,
                  borderColor: "#efefef",
                  position: "relative",
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 40,
                    height: 40,
                    opacity: 0.15,
                  }}
                >
                  {[...Array(6)].map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 2,
                        height: 2,
                        backgroundColor: "#999",
                        borderRadius: 1,
                        margin: '1%',
                      }}
                    />
                  ))}
                </View>
                <View
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: "#f0f0f0",
                    borderRadius: 8,
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: '2%',
                    borderWidth: 1,
                    borderColor: "#e0e0e0",
                  }}
                >
                  {item.icon === "mic" && <Ionicons name="mic" size={24} color="#333" />}
                  {item.icon === "camera" && <Ionicons name="camera" size={24} color="#333" />}
                  {item.icon === "clipboard" && <MaterialCommunityIcons name="clipboard-list" size={24} color="#333" />}
                </View>
                <Text style={{ fontSize: 12, fontWeight: "600", textAlign: "center", color: "#000" }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick Result Preview */}
        <View style={{ paddingHorizontal: '5.5%', marginBottom: '8%' }}>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: '4%', color: "#000" }}>Quick Result Preview</Text>
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              padding: '4.5%',
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#efefef",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.08,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", marginBottom: 6, color: "#000" }}>
                Low TB Risk - Monitor symptoms.
              </Text>
              <Text style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>
                This is not a medical diagnosis
              </Text>
              <Text style={{ fontSize: 9, color: "#bbb" }}>5/2/2026 · 1:00 AM</Text>
            </View>
            <View
              style={{
                width: 95,
                height: 95,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <GaugeChart />
            </View>
          </View>
        </View>

        <View style={{ height: '5%' }} />
      </ScrollView>

      <BottomNav activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
}


