import {
  Alert,
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
  type NativeEventSubscription,
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
import { canRunScreenings, isBoothOperator, isPatientRole, parseUserRole } from "../../constants/userRole";
import {
  PATIENT_HISTORY_TITLE,
  PATIENT_QUICK_PREVIEW_EMPTY,
  PATIENT_QUICK_PREVIEW_TITLE,
  STAFF_HISTORY_TITLE,
  STAFF_HOME_CTA,
  STAFF_HOME_GREETING_FALLBACK,
  STAFF_HOME_HERO,
  STAFF_HOME_HERO_BADGE,
  STAFF_HOME_SECTION,
  STAFF_HOME_TILE_COACHING,
  STAFF_HOME_TILE_HISTORY,
  STAFF_HOME_TILE_SCREENING,
  STAFF_QUICK_PREVIEW_EMPTY,
  STAFF_QUICK_PREVIEW_TITLE,
} from "../../constants/accountModel";
import { APP_TAGLINE } from "../../constants/branding";
import { PATIENT_HOME_HERO, PATIENT_NOTIFICATION_EMPTY, STAFF_NOTIFICATION_EMPTY } from "../../constants/patientAccess";
import { profileFirstName } from "../../utils/profileDisplay";
import {
  clearNotificationInbox,
  loadNotificationInbox,
  markAllInboxRead,
  markInboxNotificationRead,
  subscribeNotificationInbox,
  unreadInboxCount,
  type InboxNotification,
} from "../../utils/notificationInbox";
import { consumePendingHomeTab } from "../../utils/pendingHomeTab";
import {
  onUserBecameVerified,
  syncUnverifiedEngagementNotifications,
} from "../../services/unverifiedEngagementNotifications";
import { setNativeAppBadgeCount } from "../../utils/nativeNotifications";
import { palette } from "../../constants/palette";
import { useTheme } from "../../contexts/ThemeContext";
import { syncPatientScreeningNotificationsFromServer } from "../../utils/screeningNotificationSync";

const NAVY = "#0B1530";
const PURPLE = palette.violet;
const TEXT_NAVY = palette.deepNavy;
const MUTED = "#6B7280";
/** Body height of bottom nav row (excluding safe-area inset). */
const BOTTOM_NAV_HEIGHT = 84;
const PATIENT_SCREENING_NOTIFICATION_POLL_MS = 30_000;

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
  const [notificationModalMounted, setNotificationModalMounted] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<BottomNavTab>("home");
  const [firstName, setFirstName] = useState<string | null>(() => profileFirstName(peekProfile()));
  const [userRole, setUserRole] = useState(() => parseUserRole(peekProfile()?.role));
  const isPatientPortal = isPatientRole(userRole);
  const isOperator = isBoothOperator(userRole);

  // Screening modal state (slide-up like Edit Profile)
  const [screeningModalVisible, setScreeningModalVisible] = useState(false);
  const [screeningModalMounted, setScreeningModalMounted] = useState(false);
  const screeningSlideAnim = useRef(new Animated.Value(0)).current;
  const notificationSheetAnim = useRef(new Animated.Value(0)).current;

  const openScreening = useCallback(() => {
    const profile = peekProfile();
    const role = parseUserRole(profile?.role);
    if (profile && !canRunScreenings(role)) {
      Alert.alert(
        "Staff access required",
        "This account cannot start screenings. Sign in with a facility staff account.",
      );
      return;
    }
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
    if (cached?.role) {
      setUserRole(parseUserRole(cached.role));
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
      setUserRole(parseUserRole(user.role));
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
    await setNativeAppBadgeCount(unread);
  }, []);

  const syncPatientScreeningNotifications = useCallback(async () => {
    if (!isPatientPortal) return;
    try {
      await syncPatientScreeningNotificationsFromServer();
      await refreshInbox();
    } catch {
      // Best effort: patient history still loads normally if this background sync fails.
    }
  }, [isPatientPortal, refreshInbox]);

  useEffect(() => {
    const sub = subscribeNotificationInbox(() => {
      void refreshInbox();
    });
    return () => sub.remove();
  }, [refreshInbox]);

  useEffect(() => {
    if (activeTab === "home") {
      void refreshInbox();
      void syncPatientScreeningNotifications();
    }
  }, [activeTab, refreshInbox, syncPatientScreeningNotifications]);

  useEffect(() => {
    if (!isPatientPortal || activeTab !== "home") return;
    const interval = setInterval(() => {
      void syncPatientScreeningNotifications();
    }, PATIENT_SCREENING_NOTIFICATION_POLL_MS);
    return () => clearInterval(interval);
  }, [activeTab, isPatientPortal, syncPatientScreeningNotifications]);

  const openNotifications = useCallback(() => {
    setNotificationModalMounted(true);
    setShowNotifications(true);
    setUnreadCount(0);
    setInboxItems((items) => items.map((item) => ({ ...item, read: true })));
    void setNativeAppBadgeCount(0);
    void markAllInboxRead().then(() => refreshInbox());
  }, [refreshInbox]);

  const closeNotifications = useCallback(() => {
    setShowNotifications(false);
  }, []);

  useEffect(() => {
    if (showNotifications) {
      notificationSheetAnim.setValue(0);
      Animated.timing(notificationSheetAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!notificationModalMounted) return;
    Animated.timing(notificationSheetAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setNotificationModalMounted(false);
    });
  }, [showNotifications, notificationModalMounted, notificationSheetAnim]);

  const handleClearAllNotifications = useCallback(() => {
    if (inboxItems.length === 0) return;
    Alert.alert(
      "Clear notifications",
      "Remove all notifications from this device? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: () => {
            void clearNotificationInbox().then(() => refreshInbox());
          },
        },
      ],
    );
  }, [inboxItems.length, refreshInbox]);

  useFocusEffect(
    useCallback(() => {
      applyHomeSystemChrome();
      void refreshInbox();
      void syncPatientScreeningNotifications();
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
    }, [navigation, applyHomeSystemChrome, refreshInbox, syncPatientScreeningNotifications]),
  );

  useEffect(() => {
    const sub: NativeEventSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
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
      if (item.type === "profile_updated") {
        setActiveTab("profile");
        return;
      }
      if (item.type === "verify_email") {
        router.push("/verifyEmail/verifyEmail" as never);
      }
    },
    [refreshInbox, router],
  );

  const serviceTiles: ServiceTile[] = isPatientPortal
    ? [
        {
          key: "results",
          icon: "clipboard-outline",
          title: "My results",
          subtitle: "Screening reports",
          onPress: () => handleTabPress("history"),
        },
        {
          key: "learn",
          icon: "book-outline",
          title: "Learn",
          subtitle: "TB information",
          onPress: () => handleTabPress("learn"),
        },
        {
          key: "support",
          icon: "chatbubble-ellipses-outline",
          title: "Questions?",
          subtitle: "Contact your RHU",
          onPress: () => handleTabPress("learn"),
        },
      ]
    : [
        {
          key: "screening",
          icon: "scan-outline",
          title: STAFF_HOME_TILE_SCREENING.title,
          subtitle: STAFF_HOME_TILE_SCREENING.subtitle,
          onPress: openScreening,
        },
        {
          key: "coaching",
          icon: "book-outline",
          title: STAFF_HOME_TILE_COACHING.title,
          subtitle: STAFF_HOME_TILE_COACHING.subtitle,
          onPress: () => handleTabPress("learn"),
        },
        {
          key: "results",
          icon: "clipboard-outline",
          title: STAFF_HOME_TILE_HISTORY.title,
          subtitle: STAFF_HOME_TILE_HISTORY.subtitle,
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
                  {firstName
                    ? `${firstName}!`
                    : isPatientPortal
                      ? "Welcome!"
                      : `${STAFF_HOME_GREETING_FALLBACK}!`}
                </Text>
                {isOperator ? (
                  <Text style={[styles.greetingRole, { color: colors.textMuted }]} numberOfLines={2}>
                    {APP_TAGLINE}
                  </Text>
                ) : null}
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
                <Text style={[styles.heroBadgeText, { color: colors.heroText }]}>
                  {isPatientPortal ? "MY RESULTS" : STAFF_HOME_HERO_BADGE}
                </Text>
              </View>
              <Text style={[styles.heroBody, { color: colors.heroText }]}>
                {isPatientPortal ? PATIENT_HOME_HERO : STAFF_HOME_HERO}
              </Text>
              <View style={styles.heroActionsRow}>
                {isOperator ? (
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
                          {STAFF_HOME_CTA}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => handleTabPress("history")}
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
                          View my results
                        </Text>
                      </View>
                    )}
                  </Pressable>
                )}
                <Pressable style={styles.heroLearnRow} onPress={() => handleTabPress("learn")} hitSlop={8}>
                  <Text style={[styles.heroLearnText, { color: colors.heroTextMuted }]}>Learn More</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.heroTextMuted} />
                </Pressable>
              </View>
              <View style={styles.heroArt} pointerEvents="none">
                <Ionicons
                  name={isPatientPortal ? "clipboard-outline" : "medkit-outline"}
                  size={96}
                  color="rgba(255,255,255,0.18)"
                />
              </View>
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {isPatientPortal ? "Your visit" : STAFF_HOME_SECTION}
            </Text>
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
            mode={isPatientPortal ? "patient" : "operator"}
          />
        </ScrollView>
      );
    }

    if (tab === "learn") {
      return <LearnContent mode={isPatientPortal ? "patient" : "operator"} />;
    }

    if (tab === "history") {
      return <HistoryScreen onTabChange={() => handleTabPress("home")} />;
    }

    if (tab === "profile") {
      return <ProfilePage onNotificationChange={refreshInbox} />;
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
          <BottomNav
            activeTab={activeTab}
            onTabPress={handleTabPress}
            mode={isPatientPortal ? "patient" : "operator"}
          />
        </View>
      </View>

      <Modal
        visible={notificationModalMounted}
        animationType="none"
        transparent
        onRequestClose={closeNotifications}
      >
        <View style={styles.notificationBackdrop}>
          <Pressable style={styles.notificationBackdropTap} onPress={closeNotifications} />
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: colors.modalOverlay,
                opacity: notificationSheetAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.notificationSheet,
              {
                paddingTop: insets.top + 12,
                backgroundColor: colors.card,
                borderTopColor: colors.cardBorder,
                transform: [
                  {
                    translateY: notificationSheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [screenHeight, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.notificationHeaderRow}>
              <Text style={[styles.notificationTitle, { color: colors.text }]}>Notifications</Text>
              <View style={styles.notificationHeaderActions}>
                {inboxItems.length > 0 ? (
                  <Pressable
                    onPress={handleClearAllNotifications}
                    style={[styles.notificationClearBtn, { backgroundColor: colors.surfaceAlt }]}
                    accessibilityRole="button"
                    accessibilityLabel="Clear all notifications"
                  >
                    <Text style={[styles.notificationClearText, { color: colors.textSecondary }]}>
                      Clear all
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={closeNotifications}
                  style={[styles.notificationCloseBtn, { backgroundColor: colors.surfaceAlt }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close notifications"
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </Pressable>
              </View>
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
                    {isPatientPortal ? PATIENT_NOTIFICATION_EMPTY : STAFF_NOTIFICATION_EMPTY}
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
                            : item.type === "email_verified"
                              ? "checkmark-circle-outline"
                              : item.type === "password_changed"
                                ? "lock-closed-outline"
                                : item.type === "profile_updated"
                                  ? "person-outline"
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
          </Animated.View>
        </View>
      </Modal>

      {/* Screening Device Setup - absolutely positioned overlay (no Modal to avoid layout shifts) */}
      {isOperator && screeningModalMounted && (
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
  greetingRole: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
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
    flex: 1,
  },
  notificationHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  notificationClearText: {
    fontSize: 13,
    fontWeight: "600",
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
    flexWrap: "wrap",
    gap: 16,
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
