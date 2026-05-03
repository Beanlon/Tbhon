import React from 'react';
import {
 	View,
 	Text,
 	SafeAreaView,
 	Pressable,
} from 'react-native';
import CachedImage from '../components/CachedImage';
import { useRouter } from 'expo-router';
import GlobalStyles from '../../assets/styles/componentStyles';
import { Typography } from '../../assets/fonts/fonts';
import LogoStyles from '../../assets/logo/logoStyles';

export default function AccountOptions() {
	const router = useRouter();

	const handleExistingUser = () => {
		router.push('/login/login');
	};

	const handleNewUser = () => {
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

						<Text style={Typography.titleLarge}>Start with your account</Text>

		 			<View style={GlobalStyles.cardsContainer}>
					<Pressable style={GlobalStyles.card} android_ripple={{ color: '#E9E9E9' }} onPress={handleExistingUser}>
						<Text style={Typography.cardTitle}>Already an existing user</Text>
						<Text style={Typography.cardText}>
							Sign up to access your pre-existing account to access your scan history, and{' '}
							other data
						</Text>
					</Pressable>

					<Pressable style={GlobalStyles.card} android_ripple={{ color: '#E9E9E9' }} onPress={handleNewUser}>
							<Text style={Typography.cardTitle}>Don’t have an account</Text>
							<Text style={Typography.cardText}>
								Create your account by entering your personal information and also your email and
								password
							</Text>
						</Pressable>
					</View>
			</View>
		</SafeAreaView>
	);
}

