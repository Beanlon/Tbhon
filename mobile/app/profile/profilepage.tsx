import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from "expo-status-bar";
import { ApiError, getMe, type ApiUserPayload } from "../../services/backendApi";
import { clearAuthToken, getAuthToken } from "../../utils/authStorage";
import {
  clearProfileCache,
  isProfileCacheFresh,
  peekProfile,
  setCachedProfile,
} from "../../utils/profileCache";
import { clearScreeningCache } from "../../utils/screeningHistoryCache";
import {
  buildPersonalInfoRows,
  displayFullName,
  profileAvatarInitials,
  profileSubtitleLine,
  type PersonalGridRows,
} from "../../utils/profileDisplay";

const EMPTY_PERSONAL_ROWS: PersonalGridRows = [
  [
    { label: "Full name", value: "—", truncateValue: true },
    { label: "Age", value: "—" },
  ],
  [
    { label: "Date of birth", value: "—" },
    { label: "Sex", value: "—" },
  ],
  [
    { label: "Phone number", value: "—" },
    { label: "Email address", value: "—", truncateValue: true },
  ],
  [{ label: "Location", value: "—" }],
];

const profileCardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 4,
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="-mb-1 text-sm font-bold uppercase tracking-widest text-[#8FA3B1]">
      {children}
    </Text>
  );
}

function ProfileCard({
  icon,
  iconBackground,
  iconColor,
  title,
  subtitle,
  badge,
  badgeStyle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBackground: string;
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeStyle?: { backgroundColor: string; color: string };
  children: React.ReactNode;
}) {
  return (
    <View
      className="rounded-3xl border border-[#efefef] bg-white p-5"
      style={profileCardShadow}
    >
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center gap-2.5">
          <View
            className="size-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: iconBackground }}
          >
            <Ionicons name={icon} size={20} color={iconColor} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-[#111111]">{title}</Text>
            <Text className="mt-0.5 text-sm text-[#8FA3B1]">{subtitle}</Text>
          </View>
        </View>
        {badge != null && badgeStyle != null && (
          <View
            className="rounded-full px-2.5 py-1"
            style={{ backgroundColor: badgeStyle.backgroundColor }}
          >
            <Text className="text-sm font-bold" style={{ color: badgeStyle.color }}>
              {badge}
            </Text>
          </View>
        )}
      </View>
      <View className="mb-4 h-px bg-[#efefef]" />
      {children}
    </View>
  );
}

function ProfileCardHeaderOnly({
  icon,
  iconBackground,
  iconColor,
  title,
  subtitle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBackground: string;
  iconColor: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className="rounded-3xl border border-[#efefef] bg-white p-5"
      style={profileCardShadow}
    >
      <View className="mb-4 flex-row items-center gap-2.5">
        <View
          className="size-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: iconBackground }}
        >
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-[#111111]">{title}</Text>
          <Text className="mt-0.5 text-sm text-[#8FA3B1]">{subtitle}</Text>
        </View>
      </View>
      <View className="mb-4 h-px bg-[#efefef]" />
      {children}
    </View>
  );
}

function InfoGrid({ rows }: { rows: PersonalGridRows }) {
  return (
    <View>
      {rows.map((pair, rowIdx) => {
        const isLastRow = rowIdx === rows.length - 1;
        const isSingle = pair.length === 1;
        return (
          <View
            key={rowIdx}
            className={`flex-row ${!isLastRow ? "border-b border-[#efefef]" : ""}`}
          >
            {pair.map((cell, cellIdx) => (
              <View
                key={cell.label}
                className={
                  isSingle
                    ? "w-full shrink py-3"
                    : `min-w-0 flex-1 py-3 ${cellIdx === 0 ? "pr-3" : "pl-3"} ${
                        cellIdx === 0 ? "border-r border-[#efefef]" : ""
                      }`
                }
              >
                <Text className="text-sm font-semibold text-[#8FA3B1]">{cell.label}</Text>
                <Text
                  className={`mt-1 text-base font-bold ${
                    cell.valueAccent ? "text-[#1D6FA4]" : "text-[#111111]"
                  }`}
                  numberOfLines={cell.truncateValue ? 1 : undefined}
                  ellipsizeMode={cell.truncateValue ? "tail" : undefined}
                >
                  {cell.value}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function SettingRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  right,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  right: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between py-3 ${
        isLast ? "" : "border-b border-[#efefef]"
      }`}
    >
      <View className="flex-1 flex-row items-center gap-3 pr-2">
        <View
          className="size-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: iconBg }}
        >
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-[#111111]">{title}</Text>
          <Text className="mt-0.5 text-sm text-[#8FA3B1]">{subtitle}</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

function initialUserFromCache(): ApiUserPayload | null {
  return peekProfile();
}

export function ProfilePage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const seeded = initialUserFromCache();
  const [user, setUser] = useState<ApiUserPayload | null>(seeded);
  const [isLoading, setIsLoading] = useState(() => seeded == null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const skeletonPulse = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    if (!isLoading) {
      skeletonPulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(skeletonPulse, {
          toValue: 0.65,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isLoading, skeletonPulse]);

  const fetchProfile = useCallback(async () => {
    setLoadError(null);
    const token = await getAuthToken();
    if (!token) {
      clearProfileCache();
      clearScreeningCache();
      setUser(null);
      setIsLoading(false);
      router.replace("/landingpage/landingpage");
      return;
    }

    const cachedFresh = isProfileCacheFresh() ? peekProfile() : null;
    if (cachedFresh) {
      setUser(cachedFresh);
      setIsLoading(false);
      return;
    }

    const stale = peekProfile();
    if (stale) {
      setUser(stale);
      setIsLoading(false);
      try {
        const { user: next } = await getMe();
        setUser(next);
        setCachedProfile(next);
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Could not refresh your profile.";
        setLoadError(message);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearProfileCache();
          clearScreeningCache();
          await clearAuthToken();
          setUser(null);
          router.replace("/landingpage/landingpage");
        }
      }
      return;
    }

    setIsLoading(true);
    try {
      const { user: next } = await getMe();
      setUser(next);
      setCachedProfile(next);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not load your profile.";
      setLoadError(message);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearProfileCache();
        clearScreeningCache();
        await clearAuthToken();
        router.replace("/landingpage/landingpage");
      }
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void fetchProfile();
    }, [fetchProfile]),
  );

  const handleSignOut = () => {
    Alert.alert("Sign out", "You'll need to sign in again to access your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            clearProfileCache();
            clearScreeningCache();
            await clearAuthToken();
            router.replace("/landingpage/landingpage");
          })();
        },
      },
    ]);
  };

  const personalRows = user ? buildPersonalInfoRows(user) : null;
  const headerName = user ? displayFullName(user) : "…";
  const initials = user ? profileAvatarInitials(user) : "…";
  const subtitle = user ? profileSubtitleLine(user) : { age: "—", gender: "—", location: "—" };
  const showVerifiedBadge = Boolean(user?.profile);

  return (
    <>
      <StatusBar style="dark" backgroundColor="#fff" translucent={false} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View
          className={`px-5 pb-3 ${Platform.OS === "ios" ? "pt-3" : "pt-2.5"}`}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <View>
              <Text className="mb-1 text-base text-[#666]">Account</Text>
              <Text className="text-3xl font-extrabold text-black">Profile</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.75}
              className="size-10 items-center justify-center rounded-full bg-[#f0f0f0]"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#333" />
            </TouchableOpacity>
          </View>

          {loadError ? (
            <Text className="mb-3 rounded-xl bg-[#FDEDEC] px-3 py-2 text-sm text-[#C0392B]">
              {loadError}
            </Text>
          ) : null}

          <View className="mb-4 items-center">
            {isLoading && !user ? (
              <Animated.View style={{ opacity: skeletonPulse }}>
                <View className="w-full items-center">
                  <View className="relative mb-2.5">
                    <View className="size-20 rounded-full border-2 border-[#efefef] bg-[#E8ECF0]" />
                    <View className="absolute bottom-0 right-0 size-7 rounded-full border-2 border-white bg-[#DCE3EA]" />
                  </View>
                  <View className="h-7 w-[58%] max-w-[220px] rounded-lg bg-[#E8ECF0]" />
                  <View className="mt-3 flex-row flex-wrap items-center justify-center gap-2 px-2">
                    <View className="h-3.5 w-[72px] rounded-md bg-[#E8ECF0]" />
                    <View className="size-1 rounded-full bg-[#ddd]" />
                    <View className="h-3.5 w-[52px] rounded-md bg-[#E8ECF0]" />
                    <View className="size-1 rounded-full bg-[#ddd]" />
                    <View className="h-3.5 w-[88px] rounded-md bg-[#E8ECF0]" />
                  </View>
                  <View className="mt-3.5 h-9 w-[148px] rounded-full bg-[#E8ECF0]" />
                </View>
              </Animated.View>
            ) : (
              <>
                <View className="relative mb-2.5">
                  <View className="size-20 items-center justify-center rounded-full border-2 border-[#efefef] bg-[#E6F3FB]">
                    <Text className="text-2xl font-extrabold text-[#1D6FA4]">{initials}</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    className="absolute bottom-0 right-0 size-7 items-center justify-center rounded-full border-2 border-[#1D6FA4] bg-white"
                  >
                    <Ionicons name="pencil" size={12} color="#1D6FA4" />
                  </TouchableOpacity>
                </View>
                <View className="w-full max-w-full px-1">
                  <Text
                    className="text-center text-xl font-extrabold text-[#111111]"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {headerName}
                  </Text>
                </View>
                <View className="mt-2.5 flex-row flex-wrap items-center justify-center gap-2 px-2">
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="calendar-outline" size={12} color="#5D6D7E" />
                    <Text className="text-sm text-[#5D6D7E]">{subtitle.age}</Text>
                  </View>
                  <View className="size-1 rounded-full bg-[#ccc]" />
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="person-outline" size={12} color="#5D6D7E" />
                    <Text className="text-sm text-[#5D6D7E]">{subtitle.gender}</Text>
                  </View>
                  <View className="size-1 rounded-full bg-[#ccc]" />
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="location-outline" size={12} color="#5D6D7E" />
                    <Text className="text-sm text-[#5D6D7E]">{subtitle.location}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  className="mt-3.5 rounded-full border border-[#efefef] bg-[#f8f8f8] px-5 py-2"
                >
                  <Text className="text-sm font-bold text-[#111111]">Edit Profile</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <View className="gap-4 px-5">
          <SectionLabel>Personal Information</SectionLabel>
          <ProfileCard
            icon="person-outline"
            iconBackground="#E6F3FB"
            iconColor="#1D6FA4"
            title="My Details"
            subtitle="Basic info & contact"
            badge={!isLoading && showVerifiedBadge ? "Verified" : undefined}
            badgeStyle={
              !isLoading && showVerifiedBadge
                ? { backgroundColor: "#E6F3FB", color: "#0C447C" }
                : undefined
            }
          >
            {isLoading && !user ? (
              <Animated.View style={{ opacity: skeletonPulse }}>
                <View className="flex-row border-b border-[#efefef]">
                  <View className="min-w-0 flex-1 border-r border-[#efefef] py-3 pr-3">
                    <View className="mb-2 h-3 w-[72px] rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[95%] rounded-md bg-[#E8ECF0]" />
                  </View>
                  <View className="min-w-0 flex-1 py-3 pl-3">
                    <View className="mb-2 h-3 w-10 rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[80%] rounded-md bg-[#E8ECF0]" />
                  </View>
                </View>
                <View className="flex-row border-b border-[#efefef]">
                  <View className="min-w-0 flex-1 border-r border-[#efefef] py-3 pr-3">
                    <View className="mb-2 h-3 w-[100px] rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[90%] rounded-md bg-[#E8ECF0]" />
                  </View>
                  <View className="min-w-0 flex-1 py-3 pl-3">
                    <View className="mb-2 h-3 w-8 rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[55%] rounded-md bg-[#E8ECF0]" />
                  </View>
                </View>
                <View className="flex-row border-b border-[#efefef]">
                  <View className="min-w-0 flex-1 border-r border-[#efefef] py-3 pr-3">
                    <View className="mb-2 h-3 w-[88px] rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[85%] rounded-md bg-[#E8ECF0]" />
                  </View>
                  <View className="min-w-0 flex-1 py-3 pl-3">
                    <View className="mb-2 h-3 w-[92px] rounded bg-[#E8ECF0]" />
                    <View className="h-[18px] w-[92%] rounded-md bg-[#E8ECF0]" />
                  </View>
                </View>
                <View className="w-full shrink py-3">
                  <View className="mb-2 h-3 w-16 rounded bg-[#E8ECF0]" />
                  <View className="h-[18px] w-[78%] rounded-md bg-[#E8ECF0]" />
                </View>
              </Animated.View>
            ) : (
              <InfoGrid rows={personalRows ?? EMPTY_PERSONAL_ROWS} />
            )}
          </ProfileCard>

          <SectionLabel>Settings</SectionLabel>
          <ProfileCardHeaderOnly
            icon="settings-outline"
            iconBackground="#E6F3FB"
            iconColor="#1D6FA4"
            title="App Settings"
            subtitle="Theme"
          >
            <SettingRow
              icon="moon-outline"
              iconBg="#FEF5E7"
              iconColor="#E67E22"
              title="Dark mode"
              subtitle="Easy on the eyes at night"
              isLast
              right={
                <Switch
                  value={darkMode}
                  onValueChange={setDarkMode}
                  trackColor={{ false: '#CBD5E0', true: '#fdba74' }}
                  thumbColor={darkMode ? '#E67E22' : '#f4f4f5'}
                />
              }
            />
          </ProfileCardHeaderOnly>

          <ProfileCardHeaderOnly
            icon="lock-closed-outline"
            iconBackground="#EDE9FC"
            iconColor="#6C3FC9"
            title="Privacy & Security"
            subtitle="Account protection"
          >
            <TouchableOpacity activeOpacity={0.7}>
              <SettingRow
                icon="key-outline"
                iconBg="#EDE9FC"
                iconColor="#6C3FC9"
                title="Change password"
                subtitle="Last changed 30 days ago"
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}>
              <SettingRow
                icon="shield-checkmark-outline"
                iconBg="#E9F7EF"
                iconColor="#1E8449"
                title="Two-factor authentication"
                subtitle="Extra login security"
                right={
                  <View className="flex-row items-center gap-2">
                    <View className="rounded-full bg-[#E9F7EF] px-2.5 py-1">
                      <Text className="text-sm font-bold text-[#1A6035]">On</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#8FA3B1" />
                  </View>
                }
              />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}>
              <SettingRow
                icon="mail-outline"
                iconBg="#E6F3FB"
                iconColor="#1E8449"
                title="Email Verification"
                subtitle="Verify your email address"
                isLast
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
          </ProfileCardHeaderOnly>

          <ProfileCardHeaderOnly
            icon="information-circle-outline"
            iconBackground="#f8f8f8"
            iconColor="#5D6D7E"
            title="About & Support"
            subtitle="Help, feedback & app info"
          >
            <TouchableOpacity activeOpacity={0.7}>
              <SettingRow
                icon="chatbubble-outline"
                iconBg="#E6F3FB"
                iconColor="#1D6FA4"
                title="Contact support"
                subtitle="Get help from our team"
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}>
              <SettingRow
                icon="star-outline"
                iconBg="#FEF5E7"
                iconColor="#E67E22"
                title="Rate the app"
                subtitle="Tell us what you think"
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}>
              <SettingRow
                icon="document-text-outline"
                iconBg="#f8f8f8"
                iconColor="#5D6D7E"
                title="Terms & Privacy Policy"
                subtitle="Legal information"
                right={<Ionicons name="chevron-forward" size={16} color="#8FA3B1" />}
              />
            </TouchableOpacity>
            <SettingRow
              icon="phone-portrait-outline"
              iconBg="#f8f8f8"
              iconColor="#5D6D7E"
              title="App version"
              subtitle="TB Care PH"
              isLast
              right={<Text className="text-sm font-semibold text-[#8FA3B1]">v1.4.2</Text>}
            />
          </ProfileCardHeaderOnly>

          <TouchableOpacity
            activeOpacity={0.85}
            className="flex-row items-center justify-center gap-2.5 rounded-2xl border border-[#F1A9A0] bg-[#FDEDEC] py-3.5"
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={18} color="#C0392B" />
            <Text className="text-base font-extrabold text-[#C0392B]">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

export default ProfilePage;
