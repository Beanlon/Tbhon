/** Screened person — result access via QR on the printed/PDF slip (not open signup). */

export const PATIENT_ACCESS_TITLE = "View my screening result";
export const PATIENT_ACCESS_SUBTITLE =
  "Use the QR code on your result slip to set up access. Booth staff do not share app passwords.";

export const PATIENT_QR_INSTRUCTION =
  "After screening, staff give you a result slip with a QR code. Scan it here to open your personal result history.";

export const PATIENT_ACCESS_CODE_LABEL = "Access code (if QR won't scan)";
export const PATIENT_ACCESS_CODE_HINT =
  "Type or paste this code in TBhon under View my screening result → manual entry.";

export const PATIENT_LOGIN_HINT = "Already set up your result account? Sign in with the email you chose.";

export const PATIENT_ALREADY_CLAIMED_MESSAGE =
  "This result slip is already linked to an account. Sign in with the email and password you chose when you set it up.";

export const PATIENT_ACCESS_EXPIRED_MESSAGE =
  "This result access code has expired. Ask booth staff for help.";

export const PATIENT_HOME_HERO =
  "Review your TB screening result and visit history from your visit.";

export const STAFF_LANDING_SECTION = "Booth staff";
export const STAFF_EXISTING_DESC = "Sign in to run screenings at your health facility.";
export const STAFF_NEW_DESC = "Register with your RHU invite code to operate the booth.";

export type AuthAccountIntent = "patient" | "staff";

export const STAFF_SIGNUP_TITLE = "Staff sign up";
export const STAFF_SIGNUP_SUBTITLE = "Booth staff registration — RHU invite required";
export const STAFF_SIGNUP_CALLOUT = "Screened at a booth?";
export const STAFF_SIGNUP_PATIENT_CTA = "View my screening result";

export const PATIENT_FORGOT_PASSWORD_TITLE = "Reset result account password";
export const STAFF_FORGOT_PASSWORD_TITLE = "Forgot password";
export const PATIENT_FORGOT_PASSWORD_INTRO =
  "Enter the email you chose when you set up access from your result slip.";
export const STAFF_FORGOT_PASSWORD_INTRO = "Enter your booth staff account email.";
export const PATIENT_FORGOT_PASSWORD_EMAIL_LABEL = "Result account email";
export const STAFF_FORGOT_PASSWORD_EMAIL_LABEL = "Booth account email";

export const PATIENT_VERIFY_EMAIL_BENEFIT =
  "Helps secure your result account and sign-in.";
export const STAFF_VERIFY_EMAIL_BENEFIT = "Unlocks screening PDF export for booth sessions.";
export const PATIENT_VERIFY_EMAIL_SUCCESS = "Your result account email is confirmed.";
export const STAFF_VERIFY_EMAIL_SUCCESS = "You can now export screening reports as PDF.";
export const PATIENT_EMAIL_VERIFY_PROMPT = "Verify your email to secure your result account.";
export const STAFF_EMAIL_VERIFY_PROMPT = "Verify your email to unlock screening PDF export.";
export const PATIENT_PROFILE_VERIFY_SUBTITLE = "Confirm your result account email";
export const STAFF_PROFILE_VERIFY_SUBTITLE = "Unlock screening PDF export";
export const PATIENT_EMAIL_VERIFIED_DETAIL = "Your result account email is confirmed.";
export const STAFF_EMAIL_VERIFIED_DETAIL = "Screening PDF export is unlocked.";

export const PATIENT_NOTIFICATION_EMPTY =
  "Visit results, account updates, and TB learning tips appear here when you are signed in.";
export const STAFF_NOTIFICATION_EMPTY =
  "Booth session saves, email verification, and counseling tips appear here when signed in.";
export const PATIENT_SCREENING_SAVED_NUDGE =
  "Your visit result is saved. Verify your email to secure your result account.";
export const STAFF_SCREENING_SAVED_NUDGE =
  "This session is saved. Verify your email to export a PDF report. Not a medical diagnosis.";
export const PATIENT_VERIFY_INBOX_NUDGE = "Verify your email to secure your result account.";
export const STAFF_VERIFY_INBOX_NUDGE = "Verify your email to unlock screening PDF export.";
export const STAFF_VERIFY_INBOX_INITIAL_PUSH =
  "Verify your email when you have a moment — it helps secure booth PDF export.";
export const STAFF_VERIFY_INBOX_REPEAT = "Verify your email to export screening reports as PDF.";
export const PATIENT_VERIFY_INBOX_REPEAT = "Verify your email to secure your result account.";
export const STAFF_LEARN_HERO_SUBTITLE =
  "Use these talking points when counseling someone at the booth. General public-health guidance — not a diagnosis.";
export const PATIENT_LEARN_HERO_SUBTITLE =
  "A curable bacterial infection. This section is organized to make key facts easier to scan.";
export const STAFF_LEARN_COUNSELING_BANNER =
  "Booth counseling — share plain-language facts with the person screened and refer to a clinician for diagnosis.";

/** Deep link scheme for permanent patient identity QR (shown in Profile). */
export const PATIENT_ID_SCHEME = "tbhon://patient/id";

/** Build the permanent patient identity QR payload from patientPublicCode. */
export function buildPatientIdUrl(code: string): string {
  return `${PATIENT_ID_SCHEME}?code=${encodeURIComponent(code)}`;
}

/** Build a QR image URL for the permanent patient identity QR. */
export function buildPatientIdQrImageUrl(code: string, size = 220): string {
  const payload = buildPatientIdUrl(code);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

/** Deep link / QR payload for patient result access. */
export const PATIENT_CLAIM_SCHEME = "tbhon://patient/claim";

export type PatientAccessPayload = {
  token: string;
  claimUrl: string;
  expiresAt: string | null;
};

export function buildPatientClaimUrl(token: string): string {
  return `${PATIENT_CLAIM_SCHEME}?token=${encodeURIComponent(token)}`;
}

/** QR image for PDF / on-screen display (no native QR dependency). */
export function buildPatientClaimQrImageUrl(claimUrl: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(claimUrl)}`;
}

/** Human-readable token from claim URL / QR payload (for manual entry on slip). */
export function patientAccessCodeFromClaimUrl(claimUrl: string): string | null {
  return parsePatientClaimToken(claimUrl);
}

export function parsePatientClaimToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith("tbhon://")) {
      const url = new URL(trimmed.replace("tbhon://", "https://tbhon.local/"));
      const token = url.searchParams.get("token") ?? url.pathname.split("/").filter(Boolean).pop();
      return token?.trim() || null;
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const token = url.searchParams.get("token");
      return token?.trim() || null;
    }
  } catch {
    // fall through — treat as raw token
  }

  if (/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}
