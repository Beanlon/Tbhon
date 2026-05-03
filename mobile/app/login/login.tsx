import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';
import GlobalStyles from '../../assets/styles/componentStyles';
import { Typography } from '../../assets/fonts/fonts';
import LogoStyles from '../../assets/logo/logoStyles';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = () => {
    // TODO: wire real auth API
    router.replace({ pathname: '/home/HomeScreen' as any });
  };

  const handleSignUp = () => {
    router.push('/signUp/signUpPersonal');
  };

  const scroll = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: '7%',
        paddingTop: 24,
        paddingBottom: 32,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={LogoStyles.logoContainer}>
        <CachedImage
          source={require('../../assets/images/Tbhon assets/Tbhon Logo.png')}
          style={LogoStyles.logo}
          resizeMode="contain"
        />
      </View>

      <Text style={[Typography.titleMedium, { textAlign: 'center' }]}>
        Login to your account
      </Text>

      <View style={{ marginTop: 8 }}>
        <TextInput
          style={GlobalStyles.input}
          placeholder="Email"
          placeholderTextColor="#999999"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={GlobalStyles.input}
          placeholder="Password"
          placeholderTextColor="#999999"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Pressable style={GlobalStyles.primaryButton} onPress={handleSignIn}>
          <Text style={Typography.buttonText}>SIGN IN</Text>
        </Pressable>

        <View style={GlobalStyles.signUpContainer}>
          <Text style={Typography.bodySmall}>Don&apos;t have an account? </Text>
          <Pressable onPress={handleSignUp}>
            <Text style={Typography.link}>Sign up</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={GlobalStyles.container} edges={['top', 'bottom']}>
      {Platform.OS === 'web' ? (
        scroll
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {scroll}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
