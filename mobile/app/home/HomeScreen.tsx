import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import InstructionsScreen from "../screening/InstructionsScreen";
import { LearnContent } from "../learn/LearnContent";
import HistoryScreen from "../history/HistoryScreen";
import { ProfilePage } from "../profile/profilepage";
import BottomNav, { BottomNavTab } from "../components/BottomNav";
import CachedImage from "../components/CachedImage";

/** iOS/Android shadows — Tailwind shadows don’t match 1:1 on native. */
const homeCardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 3,
};

const serviceTileShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

/* ─── Gauge (proper semicircle speedometer) ─────────────────── */
const GaugeChart = ({ size = 150 }: { size?: number }) => {
  const S = size;
  const scale = S / 150;
  const T = 26 * scale;
  const needleL = 64 * scale;
  const needleTh = 5 * scale;

  return (
    <View style={{ width: S, height: S / 2 + 22 * scale, alignItems: "center" }}>
      <View style={{ width: S, height: S / 2, overflow: "hidden" }}>
        <View
          style={{
            position: "absolute",
            width: S,
            height: S,
            borderRadius: S / 2,
            borderWidth: T,
            borderTopColor: "#EF4444",
            borderRightColor: "#EF4444",
            borderBottomColor: "#EF4444",
            borderLeftColor: "#EF4444",
          }}
        />
        <View
          style={{
            position: "absolute",
            width: S,
            height: S,
            borderRadius: S / 2,
            borderWidth: T,
            borderTopColor: "#FDB913",
            borderLeftColor: "#FDB913",
            borderRightColor: "transparent",
            borderBottomColor: "transparent",
          }}
        />
        <View
          style={{
            position: "absolute",
            width: S,
            height: S,
            borderRadius: S / 2,
            borderWidth: T,
            borderTopColor: "transparent",
            borderRightColor: "transparent",
            borderBottomColor: "transparent",
            borderLeftColor: "#22C55E",
          }}
        />
      </View>

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
      <View
        style={{
          position: "absolute",
          bottom: 13 * scale,
          left: S / 2 - 8 * scale,
          width: 16 * scale,
          height: 16 * scale,
          borderRadius: 8 * scale,
          backgroundColor: "#1E293B",
        }}
      />
    </View>
  );
};

const BrandMark = () => (
  <CachedImage
    source={require("../../assets/images/Tbhon assets/TBhon icon.png")}
    className="size-12"
    resizeMode="contain"
  />
);

export default function HomeScreen() {
  const [showInstructions, setShowInstructions] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomNavTab>("home");

  const headerPadTop = Platform.select({ ios: 12, android: 10, default: 10 });

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
      setActiveTab("profile");
      return;
    }

    if (tab === "history") {
      setActiveTab("history");
      return;
    }
  };

  if (showInstructions) {
    return <InstructionsScreen onClose={() => setShowInstructions(false)} />;
  }

  if (activeTab === "learn") {
    return (
      <>
        <StatusBar style="dark" backgroundColor="#fff" translucent={false} />
        <SafeAreaView
          className="flex-1 bg-white"
          style={{ flex: 1 }}
          edges={["top", "left", "right"]}
        >
          <View className="flex-1">
            <LearnContent />
          </View>
          <BottomNav activeTab="learn" onTabPress={handleTabPress} />
        </SafeAreaView>
      </>
    );
  }

  if (activeTab === "history") {
    return (
      <>
        <StatusBar style="dark" backgroundColor="#fff" translucent={false} />
        <SafeAreaView className="flex-1 bg-white" style={{ flex: 1 }} edges={["left", "right"]}>
          <View className="flex-1">
            <HistoryScreen onTabChange={() => setActiveTab("home")} />
          </View>
          <BottomNav activeTab="history" onTabPress={handleTabPress} />
        </SafeAreaView>
      </>
    );
  }

  if (activeTab === "profile") {
    return (
      <>
        <StatusBar style="dark" backgroundColor="#fff" translucent={false} />
        <SafeAreaView
          className="flex-1 bg-white"
          style={{ flex: 1 }}
          edges={["top", "left", "right"]}
        >
          <View className="flex-1">
            <ProfilePage />
          </View>
          <BottomNav activeTab="profile" onTabPress={handleTabPress} />
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor="#fff" translucent={false} />
      <SafeAreaView className="flex-1 bg-white" style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View className="px-5 pb-5" style={{ paddingTop: headerPadTop }}>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="mb-1 text-base leading-5 text-[#666]">👋 Hello!</Text>
                <Text className="text-3xl font-extrabold leading-9 text-black">
                  Martin Shah
                </Text>
              </View>
              <BrandMark />
            </View>
          </View>

          <View className="mb-6 px-5">
            <View className="h-12 flex-row items-center rounded-xl border border-[#EDEDED] bg-[#F8F8F8] px-3 py-3">
              <Ionicons name="search" size={18} color="#BBBBBB" />
              <TextInput
                placeholder="Search"
                placeholderTextColor="#BBBBBB"
                textAlignVertical="center"
                style={{ includeFontPadding: false }}
                className="ml-2.5 h-full flex-1 py-0 text-base leading-5 text-[#333]"
              />
            </View>
          </View>

          <View className="mb-6 px-5">
            <View
              className="flex-row items-center rounded-2xl border border-[#EEEEEE] bg-white p-5"
              style={homeCardShadow}
            >
              <View className="flex-1">
                <Text className="mb-2 text-base leading-5 text-[#333]">
                  Maintain lung health to support overall well-being.
                </Text>
                <TouchableOpacity
                  onPress={() => setShowInstructions(true)}
                  className="my-2 self-start rounded-md bg-[#1a1a2e] px-4 py-2"
                >
                  <Text className="text-base font-bold text-white">Get Checked Now</Text>
                </TouchableOpacity>
                <Text className="text-base text-[#0066cc]">Learn More →</Text>
              </View>
              <View className="h-28 w-32 items-center justify-center overflow-hidden">
                <CachedImage
                  source={require("../../assets/images/Tbhon assets/respiratory_11925119.png")}
                  className="h-full w-full"
                  resizeMode="contain"
                />
              </View>
            </View>
          </View>

          <View className="mb-6 px-5">
            <Text className="mb-3.5 text-base font-bold leading-6 text-black">
              Offered Services
            </Text>
            <View className="flex-row gap-3">
              {[
                { icon: "mic-outline", iconLib: "ion", label: "Record Cough" },
                { icon: "camera-outline", iconLib: "ion", label: "Capture Phlegm" },
                { icon: "clipboard-list-outline", iconLib: "mci", label: "View Results" },
              ].map((item, idx) => (
                <View
                  key={idx}
                  className="relative min-w-0 flex-1 items-center overflow-hidden rounded-2xl border border-[#EEEEEE] bg-white px-3 pb-3 pt-3.5"
                  style={serviceTileShadow}
                >
                  <View
                    className="absolute right-0 top-0 opacity-[0.15]"
                    style={{ width: 40, height: 40 }}
                  >
                    {[...Array(6)].map((_, i) => (
                      <View
                        key={i}
                        style={{
                          width: 2,
                          height: 2,
                          backgroundColor: "#999",
                          borderRadius: 1,
                          margin: 2,
                        }}
                      />
                    ))}
                  </View>
                  <View className="mb-2.5 h-12 w-12 items-center justify-center rounded-lg border border-[#EEEEEE] bg-[#f0f0f0]">
                    {item.iconLib === "ion" ? (
                      <Ionicons name={item.icon as any} size={24} color="#222" />
                    ) : (
                      <MaterialCommunityIcons name={item.icon as any} size={24} color="#222" />
                    )}
                  </View>
                  <Text className="text-center text-sm font-semibold text-black">{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="mb-6 px-5">
            <Text className="mb-3.5 text-base font-bold leading-6 text-black">
              Quick Result Preview
            </Text>
            <View
              className="flex-row items-center justify-between rounded-xl border border-[#E8E8E8] bg-white p-4"
              style={homeCardShadow}
            >
              <View>
                <Text className="mb-1.5 text-md font-bold text-black">
                  Low TB Risk - Monitor symptoms.
                </Text>
                <Text className="text-sm italic text-[#888]">
                  {"“This is not a medical diagnosis”"}
                </Text>
                <Text className="text-sm text-[#bbb]">5/2/2026 · 1:00 AM</Text>
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

          <View className="h-5" />
        </ScrollView>

        <BottomNav activeTab={activeTab} onTabPress={handleTabPress} />
      </SafeAreaView>
    </>
  );
}
