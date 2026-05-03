import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';
import GlobalStyles from '../../assets/styles/componentStyles';
import { Typography } from '../../assets/fonts/fonts';
import LogoStyles from '../../assets/logo/logoStyles';

export default function LandingPage() {
  const router = useRouter();

  const handleContinue = () => {
    router.replace('/acountOptions/accountOptions');
  };

  return (
    <SafeAreaView style={GlobalStyles.container}>
      <View style={GlobalStyles.content}>
          {/* Logo */}
          <View style={LogoStyles.logoContainer}>
            <CachedImage
              source={require('../../assets/images/Tbhon assets/Tbhon Logo.png')}
              style={LogoStyles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Welcome Text */}
          <Text style={Typography.welcomeTitle}>Welcome</Text>

          {/* Description */}
          <Text style={Typography.description}>
            Tbhon helps you take the first step toward better lung health with early tuberculosis detection powered by smart technology. Quick, accessible, and reliable monitor your symptoms anytime, anywhere.
          </Text>

          {/* Continue Button */}
          <TouchableOpacity
            style={GlobalStyles.primaryButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={Typography.buttonText}>CONTINUE</Text>
          </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

