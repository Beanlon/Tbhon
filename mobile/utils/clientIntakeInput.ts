import { formatSignupBirthdateInput } from "./signupHelpers";

export type ClientIntakeInputKind = "name" | "address" | "phone" | "id" | "birthdate";

/** Block leading whitespace while typing. */
export function stripLeadingWhitespace(text: string): string {
  return text.replace(/^\s+/, "");
}

/** Person names: no leading space, single spaces between words. */
export function sanitizePersonNameInput(text: string): string {
  return stripLeadingWhitespace(text).replace(/\s{2,}/g, " ");
}

/** Address lines: no leading space, collapse repeated spaces. */
export function sanitizeAddressInput(text: string): string {
  return stripLeadingWhitespace(text).replace(/\s{2,}/g, " ");
}

/** Philippine mobile — digits only, sensible max length while typing. */
export function sanitizePhoneInput(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return digits.slice(0, 11);
  if (digits.startsWith("63")) return digits.slice(0, 12);
  return digits.slice(0, 10);
}

/** Government ID / passport number — no spaces, uppercase alphanumeric + hyphen. */
export function sanitizeIdNumberInput(text: string): string {
  return text
    .replace(/\s/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .toUpperCase();
}

export function sanitizeClientIntakeInput(kind: ClientIntakeInputKind, text: string): string {
  switch (kind) {
    case "name":
      return sanitizePersonNameInput(text);
    case "address":
      return sanitizeAddressInput(text);
    case "phone":
      return sanitizePhoneInput(text);
    case "id":
      return sanitizeIdNumberInput(text);
    case "birthdate":
      return formatSignupBirthdateInput(text);
    default:
      return stripLeadingWhitespace(text);
  }
}

export const CLIENT_INTAKE_MAX = {
  name: 100,
  address: 255,
  city: 100,
  barangay: 100,
  phone: 11,
  id: 100,
} as const;
