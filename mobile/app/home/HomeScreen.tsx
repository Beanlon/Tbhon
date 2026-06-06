import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  BackHandler,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  useWindowDimensions,
  type EmitterSubscription,
} from "react-native";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { LearnContent } from "../learn/LearnContent";
import HistoryScreen from "../history/HistoryScreen";
import { ProfilePage } from "../profile/profilepage";
import BottomNav, { BottomNavTab } from "../components/BottomNav";
import { QuickResultPreviewCard } from "./quickResultPreview";
import { IotHardwareContent } from "../screening/iot-hardware";
import { getMe } from "../../services/backendApi";
import { resetToLanding } from "../../utils/authNavigation";
import { getAuthToken } from "../../utils/authStorage";
import { peekProfile, setCachedProfile } from "../../utils/profileCache";
import { profileFirstName } from "../../utils/profileDisplay";
import {
  loadNotificationInbox,
  markAllInboxRead,
  markInboxNotificationRead,
  unreadInboxCount,
  type InboxNotification,
} from "../../utils/notificationInbox";
import { consumePendingHomeTab } from "../../utils/pendingHomeTab";
import {
  onUserBecameVerified,
  syncUnverifiedEngagementNotifications,
} from "../../services/unverifiedEngagementNotifications";
import { palette } from "../../constants/palette";
import { useTheme } from "../../contexts/ThemeContext";

const NAVY = "#0B1530";
const PURPLE = palette.violet;
const TEXT_NAVY = palette.deepNavy;
const MUTED = "#6B7280";
/** Body height of bottom nav row (excluding safe-area inset). */
const BOTTOM_NAV_HEIGHT = 84;

const cardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 4,
};

const serviceTileShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type ServiceTile = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { isDark, colors } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<BottomNavTab>("home");
  const [firstName, setFirstName] = useState<string | null>(() => profileFirstName(peekProfile()));

  // Screening modal state (slide-up like Edit Profile)
  const [screeningModalVisible, setScreeningModalVisible] = useState(false);
  const [screeningModalMounted, setScreeningModalMounted] = useState(false);
  const screeningSlideAnim = useRef(new Animated.Value(0)).current;

  const openScreening = useCallback(() => {
    setScreeningModalMounted(true);
    setScreeningModalVisible(true);
  }, []);

  const closeScreening = useCallback(() => {
    setScreeningModalVisible(false);
  }, []);

  const continueScreening = useCallback(() => {
    // Close overlay first, then navigate after animation completes (220ms + buffer)
    setScreeningModalVisible(false);
    setTimeout(() => {
      router.push("/screening/iot-instructions" as any);
    }, 260);
  }, [router]);

  // Animate screening modal slide
  useEffect(() => {
    if (screeningModalVisible) {
      screeningSlideAnim.setValue(0);
      Animated.timing(screeningSlideAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (screeningModalMounted) {
      Animated.timing(screeningSlideAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setScreeningModalMounted(false);
      });
    }
  }, [screeningModalVisible, screeningModalMounted, screeningSlideAnim]);

  const scrollTopPad = insets.top + (Platform.OS === "ios" ? 24 : 20);

  const applyHomeSystemChrome = useCallback(() => {
    if (Platform.OS === "android") {
      void NavigationBar.setButtonStyleAsync(isDark ? "light" : "dark").catch(() => {});
      void NavigationBar.setBackgroundColorAsync(colors.background).catch(() => {});
    }
  }, [isDark, colors.background]);

  const refreshProfileHeader = useCallback(async () => {
    const cached = peekProfile();
    const cachedFirst = profileFirstName(cached);
    if (cachedFirst) {
      setFirstName(cachedFirst);
    }

    const token = await getAuthToken();
    if (!token) {
      setFirstName(null);
      return;
    }

    try {
      const { user } = await getMe();
      setCachedProfile(user);
      setFirstName(profileFirstName(user));
      if (user.emailVerified) void onUserBecameVerified();
      else void syncUnverifiedEngagementNotifications(user);
    } catch {
      if (!cachedFirst) {
        setFirstName(null);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTab === "home") {
      void refreshProfileHeader();
      applyHomeSystemChrome();
    }
  }, [activeTab, refreshProfileHeader, applyHomeSystemChrome]);

  const refreshInbox = useCallback(async () => {
    const items = await loadNotificationInbox();
    setInboxItems(items);
    const unread = await unreadInboxCount();
    setUnreadCount(unread);
    await Notifications.setBadgeCountAsync(unread).catch(() => {});
  }, []);

  const openNotifications = useCallback(() => {
    setShowNotifications(true);
    void refreshInbox();
  }, [refreshInbox]);

  const closeNotifications = useCallback(() => {
    setShowNotifications(false);
    void markAllInboxRead().then(() => refreshInbox());
  }, [refreshInbox]);

  useFocusEffect(
    useCallback(() => {
      applyHomeSystemChrome();
      void refreshInbox();
      let active = true;
      void (async () => {
        const token = await getAuthToken();
        if (!token && active) {
          resetToLanding(navigation);
          return;
        }
        const pendingTab = await consumePendingHomeTab();
        if (pendingTab && active) {
          setActiveTab(pendingTab);
        }
      })();
      return () => {
        active = false;
      };
    }, [navigation, applyHomeSystemChrome, refreshInbox]),
  );

  useEffect(() => {
    const sub: EmitterSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // Close screening overlay first if open
      if (screeningModalVisible) {
        closeScreening();
        return true;
      }
      if (activeTab !== "home") {
        setActiveTab("home");
        return true;
      }
      return true;
    });
    return () => sub.remove();
  }, [activeTab, screeningModalVisible, closeScreening]);

  const handleTabPress = (tab: BottomNavTab) => {
    const transitionTo = (next: BottomNavTab) => {
      if (next === activeTab) return;
      setActiveTab(next);
    };

    if (tab === "home") {
      transitionTo("home");
      return;
    }
    if (tab === "screening") {
      openScreening();
      return;
    }
    if (tab === "learn") {
      transitionTo("learn");
      return;
    }
    if (tab === "profile") {
      transitionTo("profile");
      return;
    }
    if (tab === "history") {
      transitionTo("history");
      return;
    }
  };

  const handleInboxPress = useCallback(
    (item: InboxNotification) => {
      void markInboxNotificationRead(item.id).then(() => refreshInbox());
      setShowNotifications(false);
      if (item.type === "learn_tb") {
        setActiveTab("learn");
        return;
      }
      router.push("/verifyEmail/verifyEmail" as never);
    },
    [refreshInbox, router],
  );

  const serviceTiles: ServiceTile[] = [
    {
      key: "cough",
      icon: "mic-outline",
      title: "Record Cough",
      subtitle: "Audio analysis",
      onPress: openScreening,
    },
    {
      key: "phlegm",
      icon: "camera-outline",
      title: "Capture Phlegm",
      subtitle: "Image analysis",
      onPress: openScreening,
    },
    {
      key: "results",
      icon: "clipboard-outline",
      title: "View Results",
      subtitle: "Full report",
      onPress: () => handleTabPress("history"),
    },
  ];

  const renderTabContent = (tab: BottomNavTab) => {
    if (tab === "home") {
      return (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={[styles.tabScroll, { backgroundColor: colors.background }]}
          contentContainerStyle={[styles.scrollContent, { paddingTop: scrollTopPad }]}
        >
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <View style={styles.headerTextCol}>
                <Text style={[styles.greetingSub, { color: colors.textMuted }]}>{`${timeGreeting()},`}</Text>
                <Text style={[styles.greetingName, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {firstName ? `${firstName}!` : "Welcome!"}
                </Text>
              </View>
              <Pressable
                style={[styles.notifyBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={openNotifications}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {unreadCount > 0 ? (
                  <View style={styles.notifyBadge}>
                    <Text style={styles.notifyBadgeText}>
                      {unreadCount > 9 ? "9+" : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          <View style={styles.heroWrap}>
            <View style={[styles.heroCard, { backgroundColor: colors.heroCard }]}>
              <View style={[styles.heroCircleLarge, { backgroundColor: colors.heroCardAccent }]} />
              <View style={[styles.heroCircleSmall, { backgroundColor: colors.heroCardAccent }]} />
              <View style={[styles.heroBadge, { backgroundColor: colors.heroBadgeBg }]}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.heroText} />
                <Text style={[styles.heroBadgeText, { color: colors.heroText }]}>LUNG HEALTH</Text>
              </View>
              <Text style={[styles.heroBody, { color: colors.heroText }]}>
                Maintain lung health to support overall well-being.
              </Text>
              <View style={styles.heroActionsRow}>
                <Pressable
                  onPress={openScreening}
                  style={styles.heroCtaPressable}
                  accessibilityRole="button"
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.heroCta,
                        {
                          backgroundColor: pressed
                            ? isDark
                              ? "#DBD8F8"
                              : "#4E43B7"
                            : isDark
                              ? palette.lavender
                              : palette.violet,
                          borderColor: isDark ? "rgba(12,30,74,0.18)" : "rgba(255,255,255,0.35)",
                        },
                      ]}
                    >
                      <Text style={[styles.heroCtaText, { color: isDark ? palette.deepNavy : "#FFFFFF" }]}>
                        Get Checked Now
                      </Text>
                    </View>
                  )}
                </Pressable>
                <Pressable style={styles.heroLearnRow} onPress={() => handleTabPress("learn")} hitSlop={8}>
                  <Text style={[styles.heroLearnText, { color: colors.heroTextMuted }]}>Learn More</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.heroTextMuted} />
                </Pressable>
              </View>
              <View style={styles.heroArt} pointerEvents="none">
                <MaterialCommunityIcons name="lungs" size={96} color="rgba(255,255,255,0.18)" />
              </View>
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Offered Services</Text>
            <View style={styles.serviceRow}>
              {serviceTiles.map((item) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.serviceTile,
                    { backgroundColor: colors.serviceTileBg, borderColor: colors.serviceTileBorder },
                  ]}
                  onPress={item.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  <View style={[styles.serviceIconWrap, { backgroundColor: isDark ? colors.surfaceAlt : "#F3F0FF" }]}>
                    <Ionicons name={item.icon} size={26} color={colors.serviceTileIcon} />
                  </View>
                  <Text style={[styles.serviceTitle, { color: colors.text }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={[styles.serviceSubtitle, { color: colors.textMuted }]}>{item.subtitle}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <QuickResultPreviewCard
            isActive={activeTab === "home"}
            onHistoryPress={() => handleTabPress("history")}
          />
        </ScrollView>
      );
    }

    if (tab === "learn") {
      return <LearnContent />;
    }

    if (tab === "history") {
      return <HistoryScreen onTabChange={() => handleTabPress("home")} />;
    }

    if (tab === "profile") {
      return <ProfilePage />;
    }

    return null;
  };

  return (
    <>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.tabStage,
            { paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom },
          ]}
        >
          <View style={styles.tabLayer}>{renderTabContent(activeTab)}</View>
        </View>

        <View
          style={[
            styles.bottomNavHost,
            {
              paddingBottom: insets.bottom,
              backgroundColor: colors.background,
            },
          ]}
        >
          <BottomNav activeTab={activeTab} onTabPress={handleTabPress} />
        </View>
      </View>

      <Modal
        visible={showNotifications}
        animationType="fade"
        transparent
        onRequestClose={closeNotifications}
      >
        <View style={[styles.notificationBackdrop, { backgroundColor: colors.modalOverlay }]}>
          <Pressable style={styles.notificationBackdropTap} onPress={closeNotifications} />
          <View
            style={[
              styles.notificationSheet,
              {
                paddingTop: insets.top + 12,
                backgroundColor: colors.card,
                borderTopColor: colors.cardBorder,
              },
            ]}
          >
            <View style={styles.notificationHeaderRow}>
              <Text style={[styles.notificationTitle, { color: colors.text }]}>Notifications</Text>
              <Pressable
                onPress={closeNotifications}
                style={[styles.notificationCloseBtn, { backgroundColor: colors.surfaceAlt }]}
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.notificationList}
              contentContainerStyle={styles.notificationListContent}
              showsVerticalScrollIndicator={false}
            >
              {inboxItems.length === 0 ? (
                <View
                  style={[
                    styles.notificationEmptyState,
                    { backgroundColor: colors.surface, borderColor: colors.cardBorder },
                  ]}
                >
                  <View style={[styles.notificationIconWrap, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="notifications-off-outline" size={28} color={colors.textSecondary} />
                  </View>
                  <Text style={[styles.notificationEmptyTitle, { color: colors.text }]}>No notifications</Text>
                  <Text style={[styles.notificationEmptyBody, { color: colors.textSecondary }]}>
                    Screening saves, email verification, and TB learning tips appear here when you are signed in.
                  </Text>
                </View>
              ) : (
                inboxItems.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => handleInboxPress(item)}
                    style={[
                      styles.notificationRow,
                      {
                        backgroundColor: item.read ? colors.surface : colors.primaryLight,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        item.type === "learn_tb"
                          ? "book-outline"
                          : item.type === "screening_complete"
                            ? "clipboard-outline"
                            : "mail-outline"
                      }
                      size={20}
                      color={colors.primary}
                    />
                    <View style={styles.notificationRowText}>
                      <Text style={[styles.notificationRowTitle, { color: colors.text }]}>{item.title}</Text>
                      <Text style={[styles.notificationRowBody, { color: colors.textSecondary }]} numberOfLines={3}>
                        {item.body}
                      </Text>
                      <Text style={[styles.notificationRowTime, { color: colors.textMuted }]}>
                        {new Date(item.createdAt).toLocaleString()}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Screening Device Setup - absolutely positioned overlay (no Modal to avoid layout shifts) */}
      {screeningModalMounted && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          {/* Backdrop that fades in */}
          <Animated.View
            pointerEvents={screeningModalVisible ? "auto" : "none"}
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: colors.modalOverlay,
                opacity: screeningSlideAnim,
              },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={closeScreening} />
          </Animated.View>

          {/* Sliding sheet */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: colors.background,
                transform: [
                  {
                    translateY: screeningSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [screenHeight, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <IotHardwareContent onClose={closeScreening} onContinue={continueScreening} />
          </Animated.View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
  },
  tabStage: {
    flex: 1,
    minHeight: 0,
  },
  tabLayer: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  bottomNavHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  headerBlock: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  greetingSub: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 4,
  },
  greetingName: {
    fontSize: 28,
    fontWeight: "800",
    color: TEXT_NAVY,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  notifyBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    ...cardShadow,
  },
  notifyBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notifyBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  notificationList: {
    flex: 1,
  },
  notificationListContent: {
    paddingBottom: 12,
    gap: 10,
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  notificationRowText: {
    flex: 1,
    minWidth: 0,
  },
  notificationRowTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  notificationRowBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  notificationRowTime: {
    fontSize: 12,
    marginTop: 8,
  },
  notificationBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.24)",
  },
  notificationBackdropTap: {
    flex: 1,
  },
  notificationSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: 28,
    minHeight: "58%",
  },
  notificationHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  notificationTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT_NAVY,
    letterSpacing: -0.3,
  },
  notificationCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  notificationEmptyState: {
    backgroundColor: "#F8FAFF",
    borderColor: "#E6E9F8",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  notificationIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF0FF",
    marginBottom: 12,
  },
  notificationEmptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT_NAVY,
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  notificationEmptyBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#374151",
    marginBottom: 8,
  },
  notificationHintText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
  },
  heroWrap: {
    paddingHorizontal: 20,
    marginTop: 22,
    marginBottom: 24,
  },
  heroCard: {
    backgroundColor: NAVY,
    borderRadius: 24,
    padding: 20,
    paddingBottom: 12,
    minHeight: 210,
    overflow: "hidden",
    ...cardShadow,
  },
  heroCircleLarge: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroCircleSmall: {
    position: "absolute",
    top: 24,
    right: 48,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(91, 79, 196, 0.25)",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginBottom: 18,
  },
  heroBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  heroBody: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    marginBottom: 24,
    maxWidth: "68%",
  },
  heroActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  heroCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: PURPLE,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: "#0B1530",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  heroCtaPressable: {
    alignSelf: "flex-start",
  },
  heroCtaText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  heroLearnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    marginRight: 6,
  },
  heroLearnText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    fontWeight: "600",
  },
  heroArt: {
    position: "absolute",
    top: 58,
    right: 14,
    opacity: 1,
  },
  sectionBlock: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT_NAVY,
    letterSpacing: -0.2,
    marginBottom: 14,
  },
  serviceRow: {
    flexDirection: "row",
    gap: 10,
  },
  serviceTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 12,
    alignItems: "center",
    ...serviceTileShadow,
  },
  serviceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: palette.lavender,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  serviceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_NAVY,
    textAlign: "center",
    marginBottom: 4,
  },
  serviceSubtitle: {
    fontSize: 11,
    color: MUTED,
    textAlign: "center",
  },
});
