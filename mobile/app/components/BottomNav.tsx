import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export type BottomNavTab = 'home' | 'history' | 'screening' | 'learn' | 'profile';

export type BottomNavMode = 'operator' | 'patient';

type BottomNavProps = {
  activeTab: BottomNavTab;
  onTabPress: (tab: BottomNavTab) => void;
  badgeCounts?: Partial<Record<BottomNavTab, number>>;
  /** Patient portal — no booth screening tab. */
  mode?: BottomNavMode;
};

const operatorTabs: Array<{ tab: BottomNavTab; label: string; icon: string }> = [
  { tab: 'home', label: 'Home', icon: 'home' },
  { tab: 'history', label: 'Sessions', icon: 'time' },
  { tab: 'screening', label: 'Screening', icon: 'qrcode' },
  { tab: 'learn', label: 'Learn', icon: 'document' },
  { tab: 'profile', label: 'Profile', icon: 'person' },
];

const patientTabs: Array<{ tab: BottomNavTab; label: string; icon: string }> = [
  { tab: 'home', label: 'Home', icon: 'home' },
  { tab: 'history', label: 'Results', icon: 'time' },
  { tab: 'learn', label: 'Learn', icon: 'document' },
  { tab: 'profile', label: 'Profile', icon: 'person' },
];

export default function BottomNav({ activeTab, onTabPress, badgeCounts = {}, mode = 'operator' }: BottomNavProps) {
  const { isDark, colors } = useTheme();
  const tabs = mode === 'patient' ? patientTabs : operatorTabs;

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 8,
        paddingBottom: 10,
      }}
    >
      {tabs.map((item) => {
        const isActive = item.tab === activeTab;
        const isScreeningFab = mode === 'operator' && item.tab === 'screening';
        const badgeCount = badgeCounts[item.tab] ?? 0;

        return (
          <TouchableOpacity
            key={item.tab}
            onPress={() => onTabPress(item.tab)}
            activeOpacity={0.75}
            style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
          >
            {isScreeningFab ? (
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: isDark ? colors.accent : '#0a1428',
                  borderRadius: 30,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <MaterialCommunityIcons name="qrcode-scan" size={28} color="#fff" />
              </View>
            ) : (
              <View style={{ position: 'relative', marginBottom: 4 }}>
                <Ionicons
                  name={item.icon as any}
                  size={28}
                  color={isActive ? colors.navActive : colors.navInactive}
                />
                {badgeCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -10,
                      minWidth: 17,
                      height: 17,
                      borderRadius: 9,
                      backgroundColor: '#EF4444',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>
                      {badgeCount > 9 ? '9+' : String(badgeCount)}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: isActive ? colors.navActive : colors.navInactive,
              }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
