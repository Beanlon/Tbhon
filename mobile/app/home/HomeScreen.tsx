import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useCallback, useEffect, useState } from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import InstructionsScreen from "../screening/InstructionsScreen";
import { LearnContent } from "../learn/LearnContent";
import HistoryScreen from "../history/HistoryScreen";
import { ProfilePage } from "../profile/profilepage";
import BottomNav, { BottomNavTab } from "../components/BottomNav";
import CachedImage from "../components/CachedImage";
import { QuickResultPreviewCard } from "./quickResultPreview";
import { getMe } from "../../services/backendApi";
import { getAuthToken } from "../../utils/authStorage";
import { peekProfile, setCachedProfile } from "../../utils/profileCache";
import { profileFirstName } from "../../utils/profileDisplay";

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
  const [greetingFirstName, setGreetingFirstName] = useState<string | null>(() =>
    profileFirstName(peekProfile()),
  );

  const headerPadTop = Platform.select({ ios: 12, android: 10, default: 10 });

  const refreshGreetingName = useCallback(async () => {
    const cached = peekProfile();
    const cachedFirst = profileFirstName(cached);
    if (cachedFirst) {
      setGreetingFirstName(cachedFirst);
    }

    const token = await getAuthToken();
    if (!token) {
      setGreetingFirstName(null);
      return;
    }

    try {
      const { user } = await getMe();
      setCachedProfile(user);
      setGreetingFirstName(profileFirstName(user));
    } catch {
      if (!cachedFirst) {
        setGreetingFirstName(null);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === "home") {
      void refreshGreetingName();
    }
  }, [activeTab, refreshGreetingName]);

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
          <View className="px-5 pb-3" style={{ paddingTop: headerPadTop }}>
            <View className="flex-row items-center justify-between">
              <View className="min-w-0 flex-1 pr-3">
                {greetingFirstName ? (
                  <Text
                    className="text-2xl font-bold leading-9 text-black"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    <Text className="text-2xl font-normal leading-9 text-[#666]">
                      👋 Hello!{" "}
                    </Text>
                    {greetingFirstName}
                  </Text>
                ) : (
                  <Text className="text-3xl font-extrabold leading-9 text-black">
                    <Text className="text-base font-normal leading-9 text-[#666]">👋 </Text>
                    Hello!
                  </Text>
                )}
              </View>
              <BrandMark />
            </View>
          </View>

          <View className="mb-6 px-5">
            <View className="h-14 flex-row items-center rounded-3xl border border-[#EDEDED] bg-[#F8F8F8] px-4 py-3">
              <Ionicons name="search" size={20} color="#BBBBBB" />
              <TextInput
                placeholder="Search"
                placeholderTextColor="#BBBBBB"
                textAlignVertical="center"
                style={{ includeFontPadding: false }}
                className="ml-2.5 h-full flex-1 py-0 text-lg leading-6 text-[#333]"
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
                  className="my-2 self-start rounded-2xl bg-[#1a1a2e] px-4 py-2"
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

          <QuickResultPreviewCard isActive={activeTab === "home"} />

          <View className="h-5" />
        </ScrollView>

        <BottomNav activeTab={activeTab} onTabPress={handleTabPress} />
      </SafeAreaView>
    </>
  );
}
