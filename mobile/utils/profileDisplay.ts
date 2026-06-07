import type { ApiUserPayload } from "../services/backendApi";

export type PersonalGridCell = {
  label: string;
  value: string;
  valueAccent?: boolean;
  /** Single-line tail ellipsis when value overflows (e.g. long email). */
  truncateValue?: boolean;
};
export type PersonalGridRows = PersonalGridCell[][];

function capitalizeWord(s: string): string {
  const t = s.trim();
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function ageFromIsoBirthdate(iso: string): number | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]) - 1;
  const d = Number(m[3]);
  const birth = new Date(y, month, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return age;
}

export function formatIsoBirthdateLong(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  const y = Number(m[1]);
  const month = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, month, d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function formatProfileLocation(
  street: string | null | undefined,
  barangay: string | null | undefined,
  city: string | null | undefined,
): string {
  const parts = [street, barangay, city].filter((x) => x && String(x).trim().length > 0) as string[];
  return parts.length > 0 ? parts.join(", ") : "—";
}

/**
 * E.164 prefix → short country label for the profile header (PH, US, KOR, …).
 * Longest prefix wins (e.g. +1 before +12…).
 */
const E164_PREFIX_TO_COUNTRY: { prefix: string; code: string }[] = [
  { prefix: "+1", code: "US" },
  { prefix: "+63", code: "PH" },
  { prefix: "+82", code: "KOR" },
  { prefix: "+44", code: "UK" },
  { prefix: "+61", code: "AUS" },
  { prefix: "+81", code: "JPN" },
  { prefix: "+86", code: "CN" },
  { prefix: "+33", code: "FR" },
  { prefix: "+49", code: "DE" },
].sort((a, b) => b.prefix.length - a.prefix.length);

function normalizeCountryDisplayCode(raw: string | null | undefined): string | null {
  const t = raw?.trim().toUpperCase();
  if (!t) return null;
  return t;
}

function inferCountryCodeFromE164Phone(phone: string | null | undefined): string | null {
  const s = phone?.replace(/\s/g, "") ?? "";
  if (!s.startsWith("+")) return null;
  for (const { prefix, code } of E164_PREFIX_TO_COUNTRY) {
    if (s.startsWith(prefix)) return code;
  }
  return null;
}

/** Header chip: "Quezon City, PH" — city + short country, no street/barangay. */
export function formatProfileSubtitleLocation(
  city: string | null | undefined,
  countryCode: string | null | undefined,
  phoneForInference: string | null | undefined,
): string {
  const cityPart = city?.trim() ?? "";
  const codePart =
    normalizeCountryDisplayCode(countryCode) ?? inferCountryCodeFromE164Phone(phoneForInference);
  if (!cityPart && !codePart) return "—";
  if (!cityPart) return codePart ?? "—";
  if (!codePart) return cityPart;
  return `${cityPart}, ${codePart}`;
}

export function profileAvatarInitials(user: ApiUserPayload): string {
  const p = user.profile;
  const first = p?.firstName?.trim() ?? "";
  const last = p?.lastName?.trim() ?? "";
  if (first && last) return (first[0] + last[0]).toUpperCase();
  if (first.length >= 2) return first.slice(0, 2).toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (user.role === "PATIENT") return "?";
  const em = user.email?.trim();
  if (em && em.length >= 2) return em.slice(0, 2).toUpperCase();
  if (em) return em[0].toUpperCase();
  return "?";
}

/** First name for greetings (e.g. home header). */
export function profileFirstName(user: ApiUserPayload | null | undefined): string | null {
  const first = user?.profile?.firstName?.trim();
  return first || null;
}

export function isProfileIdentityComplete(user: ApiUserPayload | null | undefined): boolean {
  const p = user?.profile;
  return Boolean(p?.firstName?.trim() && p?.lastName?.trim() && p?.birthdate && p?.gender?.trim());
}

export function displayFullName(user: ApiUserPayload): string {
  const p = user.profile;
  if (p && (p.firstName?.trim() || p.lastName?.trim())) {
    return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
  }
  if (user.role === "PATIENT") {
    return "Add your name";
  }
  return user.email?.trim() || "Your account";
}

export function buildPersonalInfoRows(user: ApiUserPayload): PersonalGridRows {
  const p = user.profile;
  const fullName =
    p && (p.firstName?.trim() || p.lastName?.trim())
      ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim()
      : "—";
  const birthIso = p?.birthdate ?? "";
  const age = birthIso ? ageFromIsoBirthdate(birthIso) : null;
  const ageStr = age !== null ? `${age} years old` : "—";
  const dobStr = birthIso ? formatIsoBirthdateLong(birthIso) : "—";
  const genderStr = p?.gender ? capitalizeWord(p.gender) : "—";
  const phoneStr = user.phoneNumber?.trim() || "—";
  const emailStr = user.email?.trim() || "—";
  const locStr = p ? formatProfileLocation(p.street, p.barangay, p.city) : "—";

  return [
    [
      { label: "Full name", value: fullName || "—", truncateValue: true },
      { label: "Age", value: ageStr },
    ],
    [
      { label: "Date of birth", value: dobStr },
      { label: "Sex", value: genderStr },
    ],
    [
      { label: "Phone number", value: phoneStr },
      { label: "Email address", value: emailStr, truncateValue: true },
    ],
    [{ label: "Location", value: locStr }],
  ];
}

export function profileSubtitleLine(user: ApiUserPayload): {
  age: string;
  gender: string;
  location: string;
} {
  const p = user.profile;
  const birthIso = p?.birthdate ?? "";
  const age = birthIso ? ageFromIsoBirthdate(birthIso) : null;
  return {
    age: age !== null ? `${age} years old` : "—",
    gender: p?.gender ? capitalizeWord(p.gender) : "—",
    location: p
      ? formatProfileSubtitleLocation(p.city, p.countryCode ?? null, user.phoneNumber)
      : "—",
  };
}
