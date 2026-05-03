import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Navigation handlers
  const handleSignIn = () => {
    // Add sign in logic here
    console.log('Sign in:', email, password);
    router.push('/home/HomeScreen');
  };

  const handleSignUp = () => {
    router.push('/signUp/signUpPersonal');
  };

  return (
    <SafeAreaView style={{flex: 1,backgroundColor: '#FFFFFF',}}>
      <View style={{flex: 1, paddingHorizontal: '7%',paddingTop: '7%',paddingBottom: '8%', justifyContent: 'space-between'}}>
        {/* Logo */}
        <View style={{alignItems: 'center',marginTop: '2%', marginBottom: '3%',}}>
            <CachedImage
              source={require('../../assets/images/Tbhon assets/Tbhon Logo.png')}
              style={{width: '75%', height: undefined, aspectRatio: 1,}}
              resizeMode="contain"
            />
          </View>

        {/* Title */}
        <Text style={{fontSize: 28,fontWeight: '700',color: '#111111',marginBottom: '7%',textAlign: 'center',}}>
          Login to your account
        </Text>

        {/* Form */}
        <View style={{flex: 1, justifyContent: 'flex-start'}}>
            <TextInput
              style={{
                backgroundColor: '#f8f8f8',
                borderRadius: 14,
                paddingHorizontal: 15,
                paddingVertical: '4.5%',
                marginBottom: '6%',
                fontSize: 15,
                color: '#111111',
                fontWeight: '500',
                borderWidth: 1,
                borderColor: '#e8e8e8',
                height: '13%',
              }}
              placeholder="Email"
              placeholderTextColor="#999999"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <TextInput
              style={{
                backgroundColor: '#f8f8f8',
                borderRadius: 14,
                paddingHorizontal: 15,
                paddingVertical: '4.5%',
                marginBottom: '6%',
                fontSize: 15,
                color: '#111111',
                fontWeight: '500',
                borderWidth: 1,
                borderColor: '#e8e8e8',
                height: '13%',
              }}
              placeholder="Password"
              placeholderTextColor="#999999"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Pressable style={{
                backgroundColor: '#1a1a4d',
                borderRadius: 12,
                paddingVertical: '5%',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '6%',
                marginBottom: '6%',
              }} 
              onPress={handleSignIn}>
              <Text style={{fontSize: 16,fontWeight: '700',color: '#FFFFFF',letterSpacing: 0.5,}}>
                SIGN IN
              </Text>
            </Pressable>

            {/* Sign up link */}
            <View style={{
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
              <Text style={{
                fontSize: 14,
                color: '#666666',
                fontWeight: '400',
              }}>
                {"Don't have an account? "}
              </Text>
              <Pressable onPress={handleSignUp}>
                <Text style={{
                  fontSize: 14,
                  color: '#5B5BFF',
                  fontWeight: '600',
                }}>
                  Sign up
                </Text>
              </Pressable>
            </View>
          </View>
      </View>
    </SafeAreaView>
  );
}
