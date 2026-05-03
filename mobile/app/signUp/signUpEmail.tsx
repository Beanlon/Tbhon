import React, { useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  Pressable,
  TextInput,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import GlobalStyles from '../../assets/styles/componentStyles';
import { Typography } from '../../assets/fonts/fonts';
import LogoStyles from '../../assets/logo/logoStyles';

export default function SignUpEmail() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSignUp = () => {
    // Add sign up logic here
    console.log('Sign up:', email, password);
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

          <Text style={Typography.titleMedium}>Create your account</Text>

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

            <TextInput
              style={GlobalStyles.input}
              placeholder="Confirm Password"
              placeholderTextColor="#999999"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <Pressable style={GlobalStyles.primaryButton} onPress={handleSignUp}>
              <Text style={Typography.buttonText}>SIGN UP</Text>
            </Pressable>
          </View>
      </View>
    </SafeAreaView>
  );
}


