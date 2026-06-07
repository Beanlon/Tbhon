/** Mask email for hints, e.g. leblaineresset@gmail.com → l***@gmail.com */
export function maskEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return null;

  const at = trimmed.indexOf("@");
  if (at <= 0) return null;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!domain) return null;

  return `${local[0]}***@${domain}`;
}

export function patientAlreadyClaimedMessage(maskedEmail?: string | null): string {
  if (maskedEmail) {
    return `This result slip is linked to ${maskedEmail}. Sign in with that email, or use Forgot password if you need a new password.`;
  }
  return "This result slip is already linked to an account. Sign in with the email and password you chose when you set it up.";
}
