import React, { useCallback } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import type { AuthAccountIntent } from "../../constants/patientAccess";
import { PasswordResetForm } from "../components/PasswordResetForm";
import { resetToLanding } from "../../utils/authNavigation";
import { clearAuthToken } from "../../utils/authStorage";
import { clearProfileCache } from "../../utils/profileCache";
import { clearScreeningCache } from "../../utils/screeningHistoryCache";

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const accountIntent: AuthAccountIntent = intent === "patient" ? "patient" : "staff";

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    resetToLanding(navigation);
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
      mode="forgot"
      accountIntent={accountIntent}
      backLabel="Log in"
      onBack={handleBack}
      onSuccess={handleSuccess}
    />
  );
}
