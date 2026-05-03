import React, { useState } from 'react';
import {View, Text, SafeAreaView, Pressable, TextInput} from 'react-native';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';


export default function SignUpEmail() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Navigation handler
  const handleSignUp = () => {
    console.log('Sign up:', email, password);
    router.push('/home/HomeScreen');
  };

  return (
    <SafeAreaView style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
        }}>
      <View style={{
          flex: 1,
          paddingHorizontal: '7%',
          paddingTop: '7%',
          paddingBottom: '8%',
          justifyContent: 'space-between',
        }}>
        {/* Logo */}
        <View style={{
            alignItems: 'center',
            marginTop: '2%',
            marginBottom: '3%',
          }}>
          <CachedImage
            source={require('../../assets/images/Tbhon assets/Tbhon Logo.png')}
            style={{ width: '75%',
              height: undefined,
              aspectRatio: 1,
            }}
            resizeMode="contain"
          />
        </View>

        {/* Title */}
        <Text style={{
            fontSize: 28,
            fontWeight: '700',
            color: '#111111',
            marginBottom: '7%',
            textAlign: 'left',
          }}>
            Create your account
        </Text>

        {/* Form */}
        <View style={{
                flex: 1,
                justifyContent: 'flex-start',
              }}>
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
              placeholder="Confirm Password"
              placeholderTextColor="#999999"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
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
            onPress={handleSignUp}
          >
            <Text style={{fontSize: 16,fontWeight: '700',color: '#FFFFFF',letterSpacing: 0.5,}}>
              SIGN UP
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}


