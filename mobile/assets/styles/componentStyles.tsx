import { StyleSheet } from 'react-native';

export const GlobalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: '7%',
    paddingTop: '7%',
    paddingBottom: '8%',
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: '2%',
    marginBottom: '3%',
  },
  logo: {
    width: '75%',
    height: undefined,
    aspectRatio: 1,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: '8%',
    paddingVertical: '5%',
    marginBottom: '6%',
    fontSize: 17,
    color: '#111111',
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#1a1a4d',
    borderRadius: 12,
    paddingVertical: '5%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '6%',
    marginBottom: '6%',
  },
  primaryButtonNoMarginBottom: {
    backgroundColor: '#1a1a4d',
    borderRadius: 12,
    paddingVertical: '5%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '6%',
  },
  cardsContainer: {
    gap: '6%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: '5%',
    paddingVertical: '5%',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F1F1F1',
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default GlobalStyles;
