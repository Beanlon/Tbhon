import { View, Text, ScrollView, TextInput, TouchableOpacity, Platform } from "react-native";
import { useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import InstructionsScreen from "../screening/InstructionsScreen";
import { LearnContent } from "../learn/LearnContent";
import BottomNav, { BottomNavTab } from "../components/BottomNav";
import CachedImage from "../components/CachedImage";

/* ─── Gauge (proper semicircle speedometer) ─────────────────── */
const GaugeChart = ({ size = 150 }: { size?: number }) => {
  const S = size; // diameter
  const scale = S / 150;
  const T = 26 * scale; // ring thickness
  const needleL = 64 * scale;
  const needleTh = 5 * scale;

  return (
    <View style={{ width: S, height: S / 2 + 22 * scale, alignItems: "center" }}>
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

      {/* Needle — pivots on hub (center of dot); outer end sweeps the arc */}
      <View
        style={{
          position: "absolute",
          left: S / 2,
          bottom: 21 * scale,
          width: 0,
          height: 0,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: -needleTh / 2,
            width: needleL,
            height: needleTh,
            backgroundColor: "#1E293B",
            borderRadius: needleTh / 2,
            transform: [{ rotate: "-35deg" }],
            transformOrigin: "left center",
          }}
        />
      </View>
      {/* Center dot */}
      <View style={{
        position: "absolute",
        bottom: 13 * scale,
        left: S / 2 - 8 * scale,
        width: 16 * scale,
        height: 16 * scale,
        borderRadius: 8 * scale,
        backgroundColor: "#1E293B",
      }} />
    </View>
  );
};

/* ─── Lung illustration ────────────────────────────────────────
   Two rounded-rect lung shapes, sky-blue top + green field bottom,
   a small tree trunk in the middle, a leaf on the right.          */
const LungIllustration = ({ width = 160 }: { width?: number }) => {
  const scale = width / 160;
  const H = 96 * scale;

  return (
  <View style={{ width, height: H, alignItems: "center", justifyContent: "center" }}>
    {/* Left lung */}
    <View
      style={{
        position: "absolute",
        left: 0,
        width: 70 * scale,
        height: 90 * scale,
        borderRadius: 20 * scale,
        borderWidth: 2 * scale,
        borderColor: "#3A5FA0",
        overflow: "hidden",
        backgroundColor: "#C6E2F5",
      }}
    >
      <View style={{ flex: 1, backgroundColor: "#BFD8F0" }} />
      <View style={{ height: 40 * scale, backgroundColor: "#8DC86A" }} />
      {/* Lighter hill */}
      <View
        style={{
          position: "absolute",
          bottom: 14 * scale,
          left: 6 * scale,
          width: 56 * scale,
          height: 28 * scale,
          borderRadius: 14 * scale,
          backgroundColor: "#A8D875",
        }}
      />
    </View>

    {/* Right lung */}
    <View
      style={{
        position: "absolute",
        right: 0,
        width: 70 * scale,
        height: 90 * scale,
        borderRadius: 20 * scale,
        borderWidth: 2 * scale,
        borderColor: "#3A5FA0",
        overflow: "hidden",
        backgroundColor: "#C6E2F5",
      }}
    >
      <View style={{ flex: 1, backgroundColor: "#BFD8F0" }} />
      <View style={{ height: 40 * scale, backgroundColor: "#8DC86A" }} />
      <View
        style={{
          position: "absolute",
          bottom: 14 * scale,
          left: 6 * scale,
          width: 56 * scale,
          height: 28 * scale,
          borderRadius: 14 * scale,
          backgroundColor: "#A8D875",
        }}
      />
      {/* Small leaf / vine top-right */}
      <View
        style={{
          position: "absolute",
          top: 12 * scale,
          right: 8 * scale,
          width: 18 * scale,
          height: 26 * scale,
          borderRadius: 10 * scale,
          backgroundColor: "#6BBF59",
          transform: [{ rotate: "20deg" }],
        }}
      />
    </View>

    {/* Bronchi connector (horizontal bar) */}
    <View
      style={{
        position: "absolute",
        top: 36 * scale,
        width: 44 * scale,
        height: 14 * scale,
        borderRadius: 7 * scale,
        borderWidth: 2 * scale,
        borderColor: "#3A5FA0",
        backgroundColor: "#FFFFFF",
      }}
    />
    {/* Trachea (vertical stem) */}
    <View
      style={{
        position: "absolute",
        top: 2 * scale,
        width: 14 * scale,
        height: 40 * scale,
        borderRadius: 7 * scale,
        borderWidth: 2 * scale,
        borderColor: "#3A5FA0",
        backgroundColor: "#FFFFFF",
      }}
    />
    {/* Leaf on top-right of right lung */}
    <Ionicons
      name="leaf"
      size={16 * scale}
      color="#6BBF59"
      style={{ position: "absolute", right: 8 * scale, top: 16 * scale }}
    />
  </View>
  );
};

/* ─── TBHON brand mark — uses the real logo asset ─────────────── */
const BrandMark = () => (
  <CachedImage
    source={require("../../assets/images/Tbhon assets/TBhon icon.png")}
    style={{ width: 50, height: 50 }}
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
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "left", "right"]}>
        <View style={{ flex: 1 }}>
          <LearnContent />
        </View>

        <BottomNav activeTab="learn" onTabPress={handleTabPress} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View
          style={{
            paddingHorizontal: "5.5%",
            paddingTop: Platform.select({ ios: 12, android: 10, default: 10 }),
            paddingBottom: 20,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ fontSize: 14, color: "#666", marginBottom: 4, lineHeight: 18 }}>👋 Hello!</Text>
              <Text style={{ fontSize: 28, fontWeight: "800", color: "#000", lineHeight: 34 }}>Martin Shah</Text>
            </View>
            <BrandMark />
          </View>
        </View>

        {/* Search Bar */}
        <View style={{ paddingHorizontal: "5.5%", marginBottom: 24 }}>
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
        <View style={{ paddingHorizontal: "5.5%", marginBottom: 26 }}>
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
              <Text style={{ fontSize: 13, color: "#333", marginBottom: 8, lineHeight: 18 }}>
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
                  marginVertical: 8,

                }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Get Checked Now</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: "#0066cc" }}>Learn More →</Text>
            </View>
            <View
              style={{
                width: 120,
                height: 78,
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              <LungIllustration width={120} />
            </View>
          </View>
        </View>

        {/* Offered Services */}
        <View style={{ paddingHorizontal: "5.5%", marginBottom: 26 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 14, color: "#000", lineHeight: 22 }}>Offered Services</Text>
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
                  padding: '4%',
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
        <View style={{ paddingHorizontal: "5.5%", marginBottom: 26 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 14, color: "#000", lineHeight: 22 }}>Quick Result Preview</Text>
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
            }}
          >
            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", marginBottom: 6, color: "#000" }}>
                Low TB Risk - Monitor symptoms.
              </Text>
              <Text style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>
                {"“This is not a medical diagnosis”"}
              </Text>
              <Text style={{ fontSize: 9, color: "#bbb" }}>5/2/2026 · 1:00 AM</Text>
            </View>
            <View
              style={{
                width: 95,
                height: 64,
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              <GaugeChart size={95} />
            </View>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <BottomNav activeTab={activeTab} onTabPress={handleTabPress} />
    </SafeAreaView>
  );
}


