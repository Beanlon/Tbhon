import { Alert } from "react-native";
import type { Router } from "expo-router";
import { PATIENT_ACCESS_EXPIRED_MESSAGE } from "../constants/patientAccess";
import { ApiError, getPatientClaimPreview, getPatientClaimStatus } from "../services/backendApi";
import { patientAlreadyClaimedMessage } from "../utils/emailMask";

export function showPatientAlreadyClaimedAlert(router: Router, maskedEmail?: string | null) {
  Alert.alert("Already set up", patientAlreadyClaimedMessage(maskedEmail), [
    { text: "Cancel", style: "cancel" },
    {
      text: "Forgot password?",
      onPress: () => router.push("/forgotPassword/forgotPassword?intent=patient" as never),
    },
    {
      text: "Sign in",
      onPress: () => router.push("/login/login?intent=patient" as never),
    },
  ]);
}

export function showPatientClaimManualChoiceAlert(router: Router, onContinueSetup: () => void) {
  Alert.alert(
    "Already set up?",
    "If you already created your result account from this slip, sign in (Forgot result account password? is on the login screen). Otherwise continue to set up access.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign in",
        onPress: () => router.push("/login/login?intent=patient" as never),
      },
      { text: "Continue setup", onPress: onContinueSetup },
    ],
  );
}

export function showPatientAccessExpiredAlert() {
  Alert.alert("Code expired", PATIENT_ACCESS_EXPIRED_MESSAGE);
}

export type PatientClaimAvailability =
  | {
      kind: "available";
      sessionId: string;
      profile: {
        firstName: string;
        lastName: string;
        birthdate: string;
        gender: string;
        street: string | null;
        barangay: string | null;
        city: string | null;
        phoneNumber: string;
      } | null;
      fromBoothIntake: boolean;
    }
  | { kind: "claimed"; maskedEmail?: string | null; message?: string }
  | { kind: "expired" }
  | { kind: "invalid"; message: string }
  | { kind: "needs_manual_choice" };

/** Resolve QR token — prefers status endpoint; falls back to legacy preview when needed. */
export async function resolvePatientClaimToken(token: string): Promise<PatientClaimAvailability> {
  try {
    const status = await getPatientClaimStatus(token);
    if (status.status === "claimed") {
      return {
        kind: "claimed",
        maskedEmail: status.maskedEmail,
        message: status.message,
      };
    }
    if (status.status === "expired") return { kind: "expired" };
    if (status.status === "invalid") {
      return { kind: "invalid", message: status.message || "Invalid or expired result access code" };
    }
    return {
      kind: "available",
      sessionId: status.sessionId,
      profile: status.profile,
      fromBoothIntake: status.fromBoothIntake,
    };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 409) return { kind: "claimed" };
      if (e.status === 410) return { kind: "expired" };
      if (e.status === 404) {
        try {
          const preview = await getPatientClaimPreview(token);
          return {
            kind: "available",
            sessionId: preview.sessionId,
            profile: preview.profile,
            fromBoothIntake: preview.fromBoothIntake,
          };
        } catch (previewError) {
          if (previewError instanceof ApiError) {
            if (previewError.status === 409) return { kind: "claimed" };
            if (previewError.status === 410) return { kind: "expired" };
            if (previewError.status === 404) return { kind: "needs_manual_choice" };
          }
          throw previewError;
        }
      }
    }
    throw e;
  }
}
