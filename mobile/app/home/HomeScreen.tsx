import { View, Text, ScrollView, TextInput, TouchableOpacity, Image } from "react-native";
import { useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import InstructionsScreen from "../screening/InstructionsScreen";
import HistoryScreen from "../history/HistoryScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const [showInstructions, setShowInstructions] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const insets = useSafeAreaInsets();

  if (showInstructions) {
    return <InstructionsScreen onClose={() => setShowInstructions(false)} />;
  }

  if (activeTab === 1) {
    return (
      <HistoryScreen onTabChange={(idx) => setActiveTab(idx)} />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>

        {/* ── Header ── */}
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: Math.max(insets.top, 16) + 16,
            paddingBottom: 20,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text style={{ fontSize: 15, color: "#666666", marginBottom: 2 }}>👋 Hello!</Text>
            <Text style={{ fontSize: 30, fontWeight: "900", color: "#0B1530" }}>Martin Shah</Text>
          </View>
          <BrandMark />
        </View>

        {/* ── Search ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#F8F8F8",
              borderRadius: 14,
              paddingHorizontal: 14,
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

        {/* ── Health Card ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 18,
              padding: 18,
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
            {/* Left */}
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ fontSize: 13, color: "#333", lineHeight: 18, marginBottom: 14 }}>
                Maintain lung health to support overall well-being.
              </Text>
              <TouchableOpacity
                onPress={() => setShowInstructions(true)}
                style={{
                  backgroundColor: "#0B1530",
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  alignSelf: "flex-start",
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>Get Checked Now</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: "#0066CC", fontWeight: "500" }}>Learn More →</Text>
            </View>
            {/* Right illustration */}
            <LungIllustration />
          </View>
        </View>

        {/* ── Offered Services ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: "#0B1530", marginBottom: 14 }}>
            Offered Services
          </Text>
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
                <DotsGrid />
                {/* Icon box */}
                <View
                  style={{
                    width: 52,
                    height: 52,
                    backgroundColor: "#F8F8F8",
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
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
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#111", textAlign: "center" }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Quick Result Preview ── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: "#0B1530", marginBottom: 6 }}>
            Quick Result Preview
          </Text>
          {/* Date right-aligned above card */}
          <Text style={{ fontSize: 12, color: "#888", textAlign: "right", marginBottom: 8 }}>
            5/3/2026 - 1:00 AM
          </Text>
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              paddingVertical: 18,
              paddingHorizontal: 20,
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
            {/* Left: text */}
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: "900", color: "#111", marginBottom: 6, lineHeight: 24 }}>
                Low TB Risk – Monitor{"\n"}symptoms.
              </Text>
              <Text style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>
                {"“This is not a medical diagnosis”"}
              </Text>
            </View>
            {/* Right: gauge */}
            <GaugeChart />
          </View>
        </View>

      </ScrollView>

      {/* ── Bottom Navigation ── */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "flex-end",
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E0E0E0",
          paddingBottom: Math.max(insets.bottom, 12) + 4,
          overflow: "visible",
        }}
      >
        {([
          { icon: "home-outline",          label: "Home"      },
          { icon: "time-outline",          label: "History"   },
          { icon: "scan-outline",          label: "Screening" },
          { icon: "reader-outline",        label: "Learn"     },
          { icon: "person-circle-outline", label: "Profile"   },
        ] as const).map((item, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => {
              if (idx === 2) { setShowInstructions(true); return; }
              setActiveTab(idx);
            }}
            style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingTop: 10 }}
          >
            {idx === 2 ? (
              /* Center screening button — elevated above the bar */
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  backgroundColor: "#0B1530",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: -28,
                  marginBottom: 4,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.2,
                  shadowRadius: 14,
                  elevation: 8,
                }}
              >
                <Ionicons name="scan-outline" size={32} color="#FFFFFF" />
              </View>
            ) : (
              <Ionicons
                name={item.icon}
                size={28}
                color={activeTab === idx ? "#0B1530" : "#AAAAAA"}
                style={{ marginBottom: 3 }}
              />
            )}
            <Text
              style={{
                fontSize: 11,
                fontWeight: activeTab === idx || idx === 2 ? "800" : "500",
                color: activeTab === idx || idx === 2 ? "#0B1530" : "#AAAAAA",
                marginBottom: 2,
              }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
