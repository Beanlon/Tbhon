import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export type BottomNavTab = 'home' | 'history' | 'screening' | 'learn' | 'profile';

type BottomNavProps = {
  activeTab: BottomNavTab;
  onTabPress: (tab: BottomNavTab) => void;
};

const tabs: Array<{ tab: BottomNavTab; label: string; icon: string }> = [
  { tab: 'home', label: 'Home', icon: 'home' },
  { tab: 'history', label: 'History', icon: 'time' },
  { tab: 'screening', label: 'Screening', icon: 'qrcode' },
  { tab: 'learn', label: 'Learn', icon: 'document' },
  { tab: 'profile', label: 'Profile', icon: 'person' },
];

export default function BottomNav({ activeTab, onTabPress }: BottomNavProps) {
  const { isDark, colors } = useTheme();

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

        return (
          <TouchableOpacity
            key={item.tab}
            onPress={() => onTabPress(item.tab)}
            activeOpacity={0.75}
            style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
          >
            {item.tab === 'screening' ? (
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
              <Ionicons
                name={item.icon as any}
                size={28}
                color={isActive ? colors.navActive : colors.navInactive}
                style={{ marginBottom: 4 }}
              />
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