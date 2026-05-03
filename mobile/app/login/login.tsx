import React, { useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  Pressable,
  TextInput,
} from 'react-native';
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
    // Add sign in logic here
    console.log('Sign in:', email, password);
  };

  const handleSignUp = () => {
    router.push('/signUp/signUpPersonal');
  };

  return (
    <SafeAreaView style={GlobalStyles.container}>
      <View style={GlobalStyles.content}>
          <View style={LogoStyles.logoContainer}>
            <CachedImage
              source={require('../../assets/images/Tbhon assets/Tbhon Logo.png')}
              style={LogoStyles.logo}
              resizeMode="contain"
            />
          </View>

          <Text style={Typography.titleMedium}>Login to your account</Text>

          <View style={GlobalStyles.formContainer}>
            <TextInput
              style={GlobalStyles.input}
              placeholder="Email"
              placeholderTextColor="#999999"
              keyboardType="email-address"
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
              <Text style={Typography.bodySmall}>Don't have an account? </Text>
              <Pressable onPress={handleSignUp}>
                <Text style={Typography.link}>Sign up</Text>
              </Pressable>
            </View>
          </View>
      </View>
    </SafeAreaView>
  );
}

