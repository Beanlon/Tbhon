import type { Router } from "expo-router";
import { Alert } from "react-native";
import type { ApiUserPayload } from "../services/backendApi";
import {
  PATIENT_EMAIL_VERIFY_PROMPT,
  STAFF_EMAIL_VERIFY_PROMPT,
} from "../constants/patientAccess";
import { isPatientRole, parseUserRole } from "../constants/userRole";

export const EMAIL_VERIFY_BENEFITS = STAFF_EMAIL_VERIFY_PROMPT;

export function emailVerifyBenefits(user: ApiUserPayload | null | undefined): string {
  return isPatientRole(parseUserRole(user?.role))
    ? PATIENT_EMAIL_VERIFY_PROMPT
    : STAFF_EMAIL_VERIFY_PROMPT;
}

export function isEmailVerified(user: ApiUserPayload | null | undefined): boolean {
  return Boolean(user?.emailVerified);
}

export function promptEmailVerification(
  router: Pick<Router, "push">,
  user?: ApiUserPayload | null,
): void {
  Alert.alert("Email verification required", emailVerifyBenefits(user), [
    { text: "Maybe later", style: "cancel" },
    {
      text: "Verify now",
      onPress: () => router.push("/verifyEmail/verifyEmail"),
    },
  ]);
}
