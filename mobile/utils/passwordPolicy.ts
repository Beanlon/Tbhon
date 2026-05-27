/** Minimum length for sign-up passwords. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Any character that is not A–Z, a–z, or 0–9 (space, punctuation, symbols, etc.).
 * Broader than a fixed list like !@#$%^&* so users are not surprised.
 */
export const PASSWORD_SYMBOL_RE = /[^A-Za-z0-9]/;

export type PasswordRequirement = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

export const SIGNUP_PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  {
    id: "minLength",
    label: `Minimum ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "uppercase",
    label: "1 uppercase letter",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lowercase",
    label: "1 lowercase letter",
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: "digit",
    label: "1 number",
    test: (p) => /\d/.test(p),
  },
  {
    id: "symbol",
    label: "1 symbol (e.g. ! @ # $ % &)",
    test: (p) => PASSWORD_SYMBOL_RE.test(p),
  },
] as const;

export function isSignupPasswordValid(password: string): boolean {
  return SIGNUP_PASSWORD_REQUIREMENTS.every((r) => r.test(password));
}

export function signupPasswordValidationError(password: string): string | undefined {
  if (!password) return "Password is required.";
  if (isSignupPasswordValid(password)) return undefined;
  return "Password does not meet all requirements below.";
}
