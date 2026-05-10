import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from "expo-status-bar";

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

function InfoGrid({ rows }: { rows: { label: string; value: string; valueAccent?: boolean }[][] }) {
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

const personalRows: { label: string; value: string; valueAccent?: boolean }[][] = [
  [
    { label: 'Full name', value: 'Maria Alcantara' },
    { label: 'Age', value: '28 years old' },
  ],
  [
    { label: 'Date of birth', value: 'March 14, 1997' },
    { label: 'Sex', value: 'Female' },
  ],
  [
    { label: 'Phone number', value: '+63 917 xxx xxxx' },
    { label: 'Email address', value: 'maria.a@email.com' },
  ],
  [{ label: 'Location', value: 'Quezon City, PH' }],
];

export function ProfilePage() {
  const [darkMode, setDarkMode] = useState(false);

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

          <View className="mb-4 items-center">
            <View className="relative mb-2.5">
              <View className="size-20 items-center justify-center rounded-full border-2 border-[#efefef] bg-[#E6F3FB]">
                <Text className="text-2xl font-extrabold text-[#1D6FA4]">MA</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                className="absolute bottom-0 right-0 size-7 items-center justify-center rounded-full border-2 border-[#1D6FA4] bg-white"
              >
                <Ionicons name="pencil" size={12} color="#1D6FA4" />
              </TouchableOpacity>
            </View>
            <Text className="text-xl font-extrabold text-[#111111]">Maria Alcantara</Text>
            <View className="mt-2.5 flex-row flex-wrap items-center justify-center gap-2 px-2">
              <View className="flex-row items-center gap-1">
                <Ionicons name="calendar-outline" size={12} color="#5D6D7E" />
                <Text className="text-sm text-[#5D6D7E]">28 years old</Text>
              </View>
              <View className="size-1 rounded-full bg-[#ccc]" />
              <View className="flex-row items-center gap-1">
                <Ionicons name="person-outline" size={12} color="#5D6D7E" />
                <Text className="text-sm text-[#5D6D7E]">Female</Text>
              </View>
              <View className="size-1 rounded-full bg-[#ccc]" />
              <View className="flex-row items-center gap-1">
                <Ionicons name="location-outline" size={12} color="#5D6D7E" />
                <Text className="text-sm text-[#5D6D7E]">Quezon City, PH</Text>
              </View>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              className="mt-3.5 rounded-full border border-[#efefef] bg-[#f8f8f8] px-5 py-2"
            >
              <Text className="text-sm font-bold text-[#111111]">Edit Profile</Text>
            </TouchableOpacity>
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
            badge="Verified"
            badgeStyle={{ backgroundColor: '#E6F3FB', color: '#0C447C' }}
          >
            <InfoGrid rows={personalRows} />
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
                icon="download-outline"
                iconBg="#E6F3FB"
                iconColor="#1D6FA4"
                title="Download my data"
                subtitle="Export your health records"
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
