import React, { useState } from 'react';
import { View, Text, SafeAreaView, Pressable, TextInput } from 'react-native';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';

export default function SignUpPersonal() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [location, setLocation] = useState('');

  const handleContinue = () => {
    router.push('/signUp/signUpEmail');
  };

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: '#FFFFFF',}}>
      <View style={{flex: 1, paddingHorizontal: '7%', paddingTop: '7%', paddingBottom: '8%', justifyContent: 'space-between',}}>
        <View style={{alignItems: 'center', marginTop: '2%', marginBottom: '3%',}}>
          <CachedImage
            source={require('../../assets/images/Tbhon assets/Tbhon Logo.png')}
            style={{width: '75%', height: undefined, aspectRatio: 1,}}
            resizeMode="contain"
          />
        </View>

        <Text 
          style={{fontSize: 28, fontWeight: '700', color: '#111111', marginBottom: '7%', textAlign: 'center',}}>
          Create your account
        </Text>

        <View style={{flex: 1, justifyContent: 'flex-start',}}>
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
              height: '13%',}}
            placeholder="First Name"
            placeholderTextColor="#999999"
            value={firstName}
            onChangeText={setFirstName}
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
              height: '13%',}}
            placeholder="Last Name"
            placeholderTextColor="#999999"
            value={lastName}
            onChangeText={setLastName}
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
              height: '13%',}}
            placeholder="Birthdate"
            placeholderTextColor="#999999"
            value={birthdate}
            onChangeText={setBirthdate}
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
              height: '13%',}}
            placeholder="Location"
            placeholderTextColor="#999999"
            value={location}
            onChangeText={setLocation}
          />

          <Pressable 
            style={{
              backgroundColor: '#1a1a4d', 
              borderRadius: 12, 
              paddingVertical: '5%', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginTop: '6%',}} 
            onPress={handleContinue}>
            <Text style={{fontSize: 16,fontWeight: '700',color: '#FFFFFF',letterSpacing: 0.5,}}>
              CONTINUE
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

