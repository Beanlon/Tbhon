import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Type exports
export type BottomNavTab = 'home' | 'history' | 'screening' | 'learn' | 'profile';

type BottomNavProps = {
  activeTab: BottomNavTab;
  onTabPress: (tab: BottomNavTab) => void;
};

// Tab configuration
const tabs: Array<{ tab: BottomNavTab; label: string; icon: string }> = [
  { tab: 'home', label: 'Home', icon: 'home' },
  { tab: 'history', label: 'History', icon: 'time' },
  { tab: 'screening', label: 'Screening', icon: 'qrcode' },
  { tab: 'learn', label: 'Learn', icon: 'document' },
  { tab: 'profile', label: 'Profile', icon: 'person' },
];

export default function BottomNav({ activeTab, onTabPress }: BottomNavProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#efefef',
        paddingVertical: '3%',
        paddingBottom: '5%',
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
            {/* Special screening button */}
            {item.tab === 'screening' ? (
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: '#0a1428',
                  borderRadius: 30,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <MaterialCommunityIcons name="qrcode-scan" size={28} color="#fff" />
              </View>
            ) : (
              // Standard tab icon
              <Ionicons
                name={item.icon as any}
                size={28}
                color={isActive ? '#0a1428' : '#999'}
                style={{ marginBottom: 4 }}
              />
            )}

            {/* Tab label */}
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: isActive ? '#000' : '#333',
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