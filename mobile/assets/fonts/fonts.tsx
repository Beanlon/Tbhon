import { StyleSheet } from 'react-native';

export const Typography = StyleSheet.create({
  welcomeTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#000000',
    marginBottom: '6%',
    marginTop: '5%',
  },
  titleLarge: {
    fontSize: 30,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
    marginTop: '2%',
    marginBottom: '3%'
  },
    titleMedium: {
      fontSize: 28,
      fontWeight: '700',
      color: '#111111',
      marginBottom: '7%',
      textAlign: 'left',
    },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333333',
    marginBottom: '15%',
    fontWeight: '400',
  },
  body: {
    fontSize: 16,
    color: '#444444',
  },
  bodySmall: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '400',
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: '#111111',
    marginBottom: '2%',
  },
  cardText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#2F2F2F',
    fontWeight: '400',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  inputText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '400',
  },
  link: {
    fontSize: 14,
    color: '#5B5BFF',
    fontWeight: '600',
  }
});

export default Typography;
