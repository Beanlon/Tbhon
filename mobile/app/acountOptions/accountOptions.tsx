import React from 'react';
import {
  View,
  Text,
  SafeAreaView,
  Pressable,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';

export default function AccountOptions() {
  const router = useRouter();

  // Navigation handlers
  const handleExistingUser = () => {
    router.push('/login/login');
  };

  const handleNewUser = () => {
    router.push('/signUp/signUpPersonal');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flex: 1, paddingHorizontal: '7%', paddingTop: '7%', paddingBottom: '8%' }}>
        {/* Logo */}
        <View style={{ alignItems: 'center', marginTop: '2%', marginBottom: '3%' }}>
          <CachedImage
            source={require('../../assets/images/Tbhon assets/Tbhon Logo.png')}
            style={{ width: '75%', height: undefined, aspectRatio: 1 }}
            resizeMode="contain"
          />
        </View>

        {/* Title */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: '#111111',
            textAlign: 'center',
            marginBottom: '6%',
          }}
        >
          Start with your account
        </Text>

        {/* Cards */}
        <View style={{ gap: '5%' }}>
          <Pressable
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              paddingHorizontal: '5%',
              paddingVertical: '5%',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08,
              shadowRadius: 12,
              elevation: 4,
              borderWidth: 1,
              borderColor: '#F1F1F1',
            }}
            android_ripple={{ color: '#E9E9E9' }}
            onPress={handleExistingUser}
          >
            <Text
              style={{
                fontSize: 17,
                lineHeight: 22,
                fontWeight: '700',
                color: '#111111',
                marginBottom: '2%',
              }}
            >
              Already an existing user
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                color: '#2F2F2F',
                fontWeight: '400',
              }}
            >
              Sign up to access your pre-existing account to access your scan history, and{' '}
              other data
            </Text>
          </Pressable>

          <Pressable
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              paddingHorizontal: '5%',
              paddingVertical: '5%',
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.08,
              shadowRadius: 12,
              elevation: 4,
              borderWidth: 1,
              borderColor: '#F1F1F1',
            }}
            android_ripple={{ color: '#E9E9E9' }}
            onPress={handleNewUser}
          >
            <Text
              style={{
                fontSize: 17,
                lineHeight: 22,
                fontWeight: '700',
                color: '#111111',
                marginBottom: '2%',
              }}
            >
              Don’t have an account
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                color: '#2F2F2F',
                fontWeight: '400',
              }}
            >
              Create your account by entering your personal information and also your email and
              password
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

