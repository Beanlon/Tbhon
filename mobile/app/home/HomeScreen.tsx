import { View, Text, ScrollView, TextInput, TouchableOpacity, Image } from "react-native";
import { useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import InstructionsScreen from "../screening/InstructionsScreen";
import { LearnContent } from "../learn/LearnContent";
import BottomNav, { BottomNavTab } from "../components/BottomNav";

/* ─── Gauge (proper semicircle speedometer) ─────────────────── */
const GaugeChart = () => {
  const S = 150;   // diameter
  const T = 26;    // ring thickness
  const needleL = 64;
  const needleTh = 5;

  return (
    <View style={{ width: S, height: S / 2 + 22, alignItems: "center" }}>
      {/* Semicircle ring — clipped to top half */}
      <View style={{ width: S, height: S / 2, overflow: "hidden" }}>
        {/* Base: RED (rightmost) */}
        <View style={{
          position: "absolute", width: S, height: S, borderRadius: S / 2,
          borderWidth: T,
          borderTopColor: "#EF4444", borderRightColor: "#EF4444",
          borderBottomColor: "#EF4444", borderLeftColor: "#EF4444",
        }} />
        {/* YELLOW overlay — top + left covers center + left of visible arc */}
        <View style={{
          position: "absolute", width: S, height: S, borderRadius: S / 2,
          borderWidth: T,
          borderTopColor: "#FDB913", borderLeftColor: "#FDB913",
          borderRightColor: "transparent", borderBottomColor: "transparent",
        }} />
        {/* GREEN overlay — left side only, covers leftmost arc */}
        <View style={{
          position: "absolute", width: S, height: S, borderRadius: S / 2,
          borderWidth: T,
          borderTopColor: "transparent", borderRightColor: "transparent",
          borderBottomColor: "transparent", borderLeftColor: "#22C55E",
        }} />
      </View>

      {/* Needle — thin diagonal line from center dot */}
      <View
        style={{
          position: "absolute",
          left: S / 2 - needleL / 2,
          bottom: 21 - needleTh / 2, // center of the dot (bottom 13 + radius 8)
          width: needleL,
          height: needleTh,
          backgroundColor: "#1E293B",
          borderRadius: needleTh / 2,
          transform: [{ translateX: -needleL / 2 }, { rotate: "-35deg" }, { translateX: needleL / 2 }],
        }}
      />
      {/* Center dot */}
      <View style={{
        position: "absolute",
        bottom: 13,
        left: S / 2 - 8,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: "#1E293B",
      }} />
    </View>
  );
};

/* ─── Lung illustration ────────────────────────────────────────
   Two rounded-rect lung shapes, sky-blue top + green field bottom,
   a small tree trunk in the middle, a leaf on the right.          */
const LungIllustration = () => (
  <View style={{ width: 160, height: 96, alignItems: "center", justifyContent: "center" }}>
    {/* Left lung */}
    <View
      style={{
        position: "absolute",
        left: 0,
        width: 70,
        height: 90,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "#3A5FA0",
        overflow: "hidden",
        backgroundColor: "#C6E2F5",
      }}
    >
      <View style={{ flex: 1, backgroundColor: "#BFD8F0" }} />
      <View style={{ height: 40, backgroundColor: "#8DC86A" }} />
      {/* Lighter hill */}
      <View
        style={{
          position: "absolute",
          bottom: 14,
          left: 6,
          width: 56,
          height: 28,
          borderRadius: 14,
          backgroundColor: "#A8D875",
        }}
      />
    </View>

    {/* Right lung */}
    <View
      style={{
        position: "absolute",
        right: 0,
        width: 70,
        height: 90,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "#3A5FA0",
        overflow: "hidden",
        backgroundColor: "#C6E2F5",
      }}
    >
      <View style={{ flex: 1, backgroundColor: "#BFD8F0" }} />
      <View style={{ height: 40, backgroundColor: "#8DC86A" }} />
      <View
        style={{
          position: "absolute",
          bottom: 14,
          left: 6,
          width: 56,
          height: 28,
          borderRadius: 14,
          backgroundColor: "#A8D875",
        }}
      />
      {/* Small leaf / vine top-right */}
      <View
        style={{
          position: "absolute",
          top: 12,
          right: 8,
          width: 18,
          height: 26,
          borderRadius: 10,
          backgroundColor: "#6BBF59",
          transform: [{ rotate: "20deg" }],
        }}
      />
    </View>

    {/* Bronchi connector (horizontal bar) */}
    <View
      style={{
        position: "absolute",
        top: 36,
        width: 44,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: "#3A5FA0",
        backgroundColor: "#FFFFFF",
      }}
    />
    {/* Trachea (vertical stem) */}
    <View
      style={{
        position: "absolute",
        top: 2,
        width: 14,
        height: 40,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: "#3A5FA0",
        backgroundColor: "#FFFFFF",
      }}
    />
    {/* Leaf on top-right of right lung */}
    <Ionicons
      name="leaf"
      size={16}
      color="#6BBF59"
      style={{ position: "absolute", right: 8, top: 16 }}
    />
  </View>
);

/* ─── TBHON brand mark — uses the real logo asset ─────────────── */
const BrandMark = () => (
  <Image
    source={require("../../assets/images/Tbhon assets/Tbhon Logo.png")}
    style={{ width: 110, height: 90 }}
    resizeMode="contain"
  />
);

/* ─── Dots grid ─────────────────────────────────────────────── */
const DotsGrid = () => (
  <View
    style={{
      position: "absolute",
      top: 8,
      right: 8,
      width: 44,
      height: 44,
      opacity: 0.18,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
    }}
  >
    {Array.from({ length: 16 }).map((_, i) => (
      <View
        key={i}
        style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#888" }}
      />
    ))}
  </View>
);

/* ─── Main screen ──────────────────────────────────────────── */
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
          <BrandMark />
        </View>

        {/* Search Bar */}
        <View style={{ paddingHorizontal: '5.5%', marginBottom: '7%' }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#F8F8F8",
              borderRadius: 14,
              paddingHorizontal: '4%',
              height: 50,
              borderWidth: 1,
              borderColor: "#EDEDED",
            }}
          >
            <Ionicons name="search" size={18} color="#BBBBBB" />
            <TextInput
              placeholder="Search"
              placeholderTextColor="#BBBBBB"
              style={{ flex: 1, marginLeft: 10, fontSize: 15, color: "#333" }}
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
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#EEEEEE",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.07,
              shadowRadius: 14,
              elevation: 3,
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
                  marginVertical: '3%',

                }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Get Checked Now</Text>
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
            {/* Right illustration */}
            <LungIllustration />
          </View>
        </View>

        {/* Offered Services */}
        <View style={{ paddingHorizontal: '5.5%', marginBottom: '8%' }}>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: '4%', color: "#000" }}>Offered Services</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {[
              { icon: "mic-outline",          iconLib: "ion",  label: "Record Cough" },
              { icon: "camera-outline",        iconLib: "ion",  label: "Capture Phlegm" },
              { icon: "clipboard-list-outline",iconLib: "mci",  label: "View Result" },
            ].map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => idx === 0 && setShowInstructions(true)}
                style={{
                  backgroundColor: "#fafafa",
                  borderRadius: 12,
                  padding: '4%',
                  alignItems: "center",
                  width: "31%",
                  backgroundColor: "#FFFFFF",
                  borderRadius: 16,
                  paddingTop: 14,
                  paddingBottom: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#EEEEEE",
                  overflow: "hidden",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 2,
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
                    borderColor: "#EEEEEE",
                    marginBottom: 10,
                  }}
                >
                  {item.iconLib === "ion" ? (
                    <Ionicons name={item.icon as any} size={24} color="#222" />
                  ) : (
                    <MaterialCommunityIcons name={item.icon as any} size={24} color="#222" />
                  )}
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
              borderColor: "#E8E8E8",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.07,
              shadowRadius: 14,
              elevation: 3,
              flexDirection: "row",
              alignItems: "center",
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
            {/* Right: gauge */}
            <GaugeChart />
          </View>
        </View>

        <View style={{ height: '5%' }} />
      </ScrollView>

      <BottomNav activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
}


