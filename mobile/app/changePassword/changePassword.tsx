import React, { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { PasswordResetForm } from "../components/PasswordResetForm";
import { getMe } from "../../services/backendApi";
import { resetToLanding } from "../../utils/authNavigation";
import { clearAuthToken, getAuthToken } from "../../utils/authStorage";
import { clearProfileCache } from "../../utils/profileCache";
import { clearScreeningCache } from "../../utils/screeningHistoryCache";

export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);

  useEffect(() => {
    void (async () => {
      const token = await getAuthToken();
      if (!token) {
        resetToLanding(navigation);
        return;
      }
      try {
        const { user } = await getMe();
        setEmail(user.email ?? null);
      } catch {
        Alert.alert("Session expired", "Please log in again.", [
          {
            text: "OK",
            onPress: async () => {
              await clearAuthToken();
              clearProfileCache();
              resetToLanding(navigation);
            },
          },
        ]);
      } finally {
        setLoadingAccount(false);
      }
    })();
  }, [navigation]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    navigation.goBack();
  }, [navigation, router]);

  const handleSuccess = useCallback(() => {
    void (async () => {
      clearProfileCache();
      clearScreeningCache();
      await clearAuthToken({ clearInbox: false });
      resetToLanding(navigation);
    })();
  }, [navigation]);

  return (
    <PasswordResetForm
      mode="change"
      backLabel="Profile"
      onBack={handleBack}
      onSuccess={handleSuccess}
      accountEmail={email}
      loadingAccount={loadingAccount}
    />
  );
}
