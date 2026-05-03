import React, { useState } from 'react';
import { View, Text, SafeAreaView, Pressable, TextInput } from 'react-native';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';
import GlobalStyles from '../../assets/styles/componentStyles';
import { Typography } from '../../assets/fonts/fonts';
import LogoStyles from '../../assets/logo/logoStyles';

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
            placeholder="First Name"
            placeholderTextColor="#999999"
            value={firstName}
            onChangeText={setFirstName}
          />

          <TextInput
            style={GlobalStyles.input}
            placeholder="Last Name"
            placeholderTextColor="#999999"
            value={lastName}
            onChangeText={setLastName}
          />

          <TextInput
            style={GlobalStyles.input}
            placeholder="Birthdate"
            placeholderTextColor="#999999"
            value={birthdate}
            onChangeText={setBirthdate}
          />

          <TextInput
            style={GlobalStyles.input}
            placeholder="Location"
            placeholderTextColor="#999999"
            value={location}
            onChangeText={setLocation}
          />

          <Pressable style={GlobalStyles.primaryButtonNoMarginBottom} onPress={handleContinue}>
            <Text style={Typography.buttonText}>CONTINUE</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

