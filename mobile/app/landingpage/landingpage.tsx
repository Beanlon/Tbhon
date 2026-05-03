import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';

export default function LandingPage() {
  const router = useRouter();

  // Navigation handler
  const handleContinue = () => {
    router.replace('/acountOptions/accountOptions');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flex: 1, paddingHorizontal: '5.5%', paddingTop: '15%', paddingBottom: '7%' }}>
        {/* Logo */}
        <View style={{ alignItems: 'center', marginTop: '2%', marginBottom: '4%' }}>
          <CachedImage
            source={require('../../assets/images/Tbhon assets/Tbhon Logo.png')}
            style={{ width: '75%', height: undefined, aspectRatio: 1 }}
            resizeMode="contain"
          />
        </View>

        {/* Welcome Text */}
        <Text style={{ fontSize: 40, fontWeight: '800', color: '#000000', textAlign: 'left', marginBottom: '10%' }}>
          Welcome
        </Text>

        {/* Description */}
        <Text style={{ fontSize: 17, lineHeight: 22, color: '#2F2F2F', textAlign: 'left', marginBottom: '10%' }}>
          Tbhon helps you take the first step toward better lung health with early tuberculosis detection powered by smart technology. Quick, accessible, and reliable monitor your symptoms anytime, anywhere.
        </Text>

        {/* Continue Button */}
        <TouchableOpacity
          style={{ backgroundColor: '#1a1a4d', borderRadius: 12, paddingVertical: '5%', alignItems: 'center', justifyContent: 'center', marginTop: '4%' }}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 }}>CONTINUE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

