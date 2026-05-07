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

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.1,
        color: '#8FA3B1',
        textTransform: 'uppercase',
        marginBottom: '-2%',
      }}
    >
      {children}
    </Text>
  );
}

const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: 16,
  padding: '5%',
  borderWidth: 1,
  borderColor: '#efefef',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 4,
} as const;

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
    <View style={cardStyle}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '4%',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: iconBackground,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={icon} size={20} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111111' }}>{title}</Text>
            <Text style={{ fontSize: 11, color: '#8FA3B1', marginTop: 2 }}>{subtitle}</Text>
          </View>
        </View>
        {badge != null && badgeStyle != null && (
          <View
            style={{
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: badgeStyle.backgroundColor,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: badgeStyle.color }}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={{ height: 1, backgroundColor: '#efefef', marginBottom: '4%' }} />
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
    <View style={cardStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: '4%' }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: iconBackground,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111111' }}>{title}</Text>
          <Text style={{ fontSize: 11, color: '#8FA3B1', marginTop: 2 }}>{subtitle}</Text>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: '#efefef', marginBottom: '4%' }} />
      {children}
    </View>
  );
}

function InfoGrid({ rows }: { rows: { label: string; value: string; valueAccent?: boolean }[][] }) {
  return (
    <View>
      {rows.map((pair, rowIdx) => (
        <View
          key={rowIdx}
          style={{
            flexDirection: 'row',
            borderBottomWidth: rowIdx < rows.length - 1 ? 1 : 0,
            borderBottomColor: '#efefef',
          }}
        >
          {pair.map((cell, cellIdx) => (
            <View
              key={cell.label}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingRight: cellIdx === 0 ? 12 : 0,
                paddingLeft: cellIdx === 1 ? 12 : 0,
                borderRightWidth: cellIdx === 0 && pair.length > 1 ? 1 : 0,
                borderRightColor: '#efefef',
              }}
            >
              <Text style={{ fontSize: 11, color: '#8FA3B1', fontWeight: '600' }}>{cell.label}</Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: cell.valueAccent ? '#1D6FA4' : '#111111',
                  marginTop: 3,
                }}
              >
                {cell.value}
              </Text>
            </View>
          ))}
        </View>
      ))}
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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 11,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: '#efefef',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, paddingRight: 8 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#111111' }}>{title}</Text>
          <Text style={{ fontSize: 11, color: '#8FA3B1', marginTop: 2 }}>{subtitle}</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

function ProgressRow({
  label,
  pct,
  fillColor,
  trackPct,
}: {
  label?: string;
  pct: string;
  fillColor: string;
  trackPct: number;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label != null && label !== '' && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#5D6D7E' }}>{label}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 6, backgroundColor: '#f8f8f8', borderRadius: 99, overflow: 'hidden' }}>
          <View style={{ width: `${trackPct}%`, height: '100%', borderRadius: 99, backgroundColor: fillColor }} />
        </View>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#5D6D7E', minWidth: 36, textAlign: 'right' }}>{pct}</Text>
      </View>
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
    { label: 'Location', value: 'Quezon City, PH' },
    { label: 'Blood type', value: 'O+' },
  ],
  [
    { label: 'Phone number', value: '+63 917 xxx xxxx' },
    { label: 'Email address', value: 'maria.a@email.com' },
  ],
];

const providerRows: { label: string; value: string; valueAccent?: boolean }[][] = [
  [
    { label: 'Doctor', value: 'Dr. R. Santos' },
    { label: 'Facility', value: 'QC General Hospital' },
  ],
  [
    { label: 'Next check-up', value: 'May 12, 2026', valueAccent: true },
    { label: 'DOT worker', value: 'Nurse Reyes' },
  ],
];

export function ProfilePage() {
  const [remindersMed, setRemindersMed] = useState(true);
  const [remindersAppt, setRemindersAppt] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [dataSharing, setDataSharing] = useState(true);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
      <View
        style={{
          paddingHorizontal: '5.5%',
          paddingTop: Platform.select({ ios: 12, android: 10, default: 10 }),
          paddingBottom: '3%',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4%' }}>
          <View>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Account</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#000' }}>Profile</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.75}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#f0f0f0',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center', marginBottom: '4%' }}>
          <View style={{ position: 'relative', marginBottom: 10 }}>
            <View
              style={{
                width: 82,
                height: 82,
                borderRadius: 41,
                backgroundColor: '#E6F3FB',
                borderWidth: 2,
                borderColor: '#efefef',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#1D6FA4' }}>MA</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#fff',
                borderWidth: 2,
                borderColor: '#1D6FA4',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="pencil" size={12} color="#1D6FA4" />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#111111' }}>Maria Alcantara</Text>
          <Text style={{ fontSize: 13, color: '#666', marginTop: 4 }}>TB Patient · Under Treatment</Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
              paddingHorizontal: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={12} color="#5D6D7E" />
              <Text style={{ fontSize: 12, color: '#5D6D7E' }}>Quezon City, PH</Text>
            </View>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#ccc' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={12} color="#5D6D7E" />
              <Text style={{ fontSize: 12, color: '#5D6D7E' }}>28 years old</Text>
            </View>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#ccc' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="person-outline" size={12} color="#5D6D7E" />
              <Text style={{ fontSize: 12, color: '#5D6D7E' }}>Female</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{
              marginTop: 14,
              paddingVertical: 8,
              paddingHorizontal: 20,
              borderRadius: 20,
              backgroundColor: '#f8f8f8',
              borderWidth: 1,
              borderColor: '#efefef',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#111111' }}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: 'row',
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#efefef',
            paddingVertical: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            elevation: 4,
          }}
        >
          {[
            { val: 'Day 42', lbl: 'Treatment day' },
            { val: '89%', lbl: 'Adherence rate' },
            { val: '3', lbl: 'Months left' },
          ].map((s, i) => (
            <View
              key={s.lbl}
              style={{
                flex: 1,
                alignItems: 'center',
                borderLeftWidth: i > 0 ? 1 : 0,
                borderLeftColor: '#efefef',
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111111' }}>{s.val}</Text>
              <Text style={{ fontSize: 10, color: '#8FA3B1', marginTop: 2, textAlign: 'center' }}>{s.lbl}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: '5.5%', gap: 16 }}>
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

        <SectionLabel>Treatment Progress</SectionLabel>
        <ProfileCard
          icon="heart-outline"
          iconBackground="#E9F7EF"
          iconColor="#1E8449"
          title="Treatment Overview"
          subtitle="Current progress"
          badge="On Track"
          badgeStyle={{ backgroundColor: '#E9F7EF', color: '#1A6035' }}
        >
          <View style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#5D6D7E' }}>Overall completion</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1D6FA4' }}>42 / 180 days</Text>
            </View>
            <ProgressRow pct="23%" fillColor="#1D6FA4" trackPct={23} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
            <View style={{ flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E8449' }}>38</Text>
              <Text style={{ fontSize: 11, color: '#8FA3B1', marginTop: 3, textAlign: 'center', lineHeight: 14 }}>
                Doses taken on time
              </Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#E67E22' }}>4</Text>
              <Text style={{ fontSize: 11, color: '#8FA3B1', marginTop: 3, textAlign: 'center', lineHeight: 14 }}>
                Missed doses
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: '#5D6D7E', fontWeight: '700', marginBottom: 6 }}>Medication adherence</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, height: 6, backgroundColor: '#f8f8f8', borderRadius: 99, overflow: 'hidden' }}>
                <View style={{ width: '89%', height: '100%', borderRadius: 99, backgroundColor: '#1E8449' }} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E8449', minWidth: 36, textAlign: 'right' }}>89%</Text>
            </View>
          </View>
        </ProfileCard>

        <ProfileCard
          icon="home-outline"
          iconBackground="#E6F3FB"
          iconColor="#1D6FA4"
          title="Healthcare Provider"
          subtitle="Doctor & facility"
        >
          <InfoGrid rows={providerRows} />
        </ProfileCard>

        <SectionLabel>Settings</SectionLabel>
        <ProfileCardHeaderOnly
          icon="settings-outline"
          iconBackground="#E6F3FB"
          iconColor="#1D6FA4"
          title="App Settings"
          subtitle="Notifications & preferences"
        >
          <SettingRow
            icon="notifications-outline"
            iconBg="#E6F3FB"
            iconColor="#1D6FA4"
            title="Medication reminders"
            subtitle="Daily alerts for your dose"
            right={<Switch value={remindersMed} onValueChange={setRemindersMed} trackColor={{ false: '#CBD5E0', true: '#93c5e8' }} thumbColor={remindersMed ? '#1D6FA4' : '#f4f4f5'} />}
          />
          <SettingRow
            icon="calendar-outline"
            iconBg="#E9F7EF"
            iconColor="#1E8449"
            title="Appointment reminders"
            subtitle="Upcoming check-up alerts"
            right={<Switch value={remindersAppt} onValueChange={setRemindersAppt} trackColor={{ false: '#CBD5E0', true: '#86efac' }} thumbColor={remindersAppt ? '#1E8449' : '#f4f4f5'} />}
          />
          <SettingRow
            icon="bar-chart-outline"
            iconBg="#EDE9FC"
            iconColor="#6C3FC9"
            title="Weekly progress report"
            subtitle="Sent every Sunday"
            right={<Switch value={weeklyReport} onValueChange={setWeeklyReport} trackColor={{ false: '#CBD5E0', true: '#c4b5fd' }} thumbColor={weeklyReport ? '#6C3FC9' : '#f4f4f5'} />}
          />
          <SettingRow
            icon="moon-outline"
            iconBg="#FEF5E7"
            iconColor="#E67E22"
            title="Dark mode"
            subtitle="Easy on the eyes at night"
            right={<Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ false: '#CBD5E0', true: '#fdba74' }} thumbColor={darkMode ? '#E67E22' : '#f4f4f5'} />}
          />
          <SettingRow
            icon="globe-outline"
            iconBg="#f8f8f8"
            iconColor="#5D6D7E"
            title="Language"
            subtitle="App display language"
            isLast
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, backgroundColor: '#E6F3FB' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0C447C' }}>English</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8FA3B1" />
              </View>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 20, backgroundColor: '#E9F7EF' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A6035' }}>On</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#8FA3B1" />
                </View>
              }
            />
          </TouchableOpacity>
          <SettingRow
            icon="share-social-outline"
            iconBg="#f8f8f8"
            iconColor="#5D6D7E"
            title="Data sharing"
            subtitle="Share data with your doctor"
            right={<Switch value={dataSharing} onValueChange={setDataSharing} trackColor={{ false: '#CBD5E0', true: '#93c5e8' }} thumbColor={dataSharing ? '#1D6FA4' : '#f4f4f5'} />}
          />
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
            right={<Text style={{ fontSize: 12, color: '#8FA3B1', fontWeight: '600' }}>v1.4.2</Text>}
          />
        </ProfileCardHeaderOnly>

        <TouchableOpacity
          activeOpacity={0.85}
          style={{
            backgroundColor: '#FDEDEC',
            borderWidth: 1,
            borderColor: '#F1A9A0',
            borderRadius: 16,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <Ionicons name="log-out-outline" size={18} color="#C0392B" />
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#C0392B' }}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

export default ProfilePage;
