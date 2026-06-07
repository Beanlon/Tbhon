export type UserRole = "STAFF" | "ADMIN" | "PATIENT";

/** Strict role parse for guards — no default fallback. */
export function resolveUserRole(raw: unknown): UserRole | null {
  if (raw === "STAFF" || raw === "ADMIN" || raw === "PATIENT") return raw;
  return null;
}

export function parseUserRole(raw: unknown): UserRole {
  return resolveUserRole(raw) ?? "STAFF";
}

export function canRunScreenings(role: UserRole): boolean {
  return role === "STAFF" || role === "ADMIN";
}

export function isProgramAdmin(role: UserRole): boolean {
  return role === "ADMIN";
}

export function isPatientRole(role: UserRole): boolean {
  return role === "PATIENT";
}

/** Booth operator (staff or program admin) — can see screening UI. */
export function isBoothOperator(role: UserRole): boolean {
  return role === "STAFF" || role === "ADMIN";
}

export type ReferralStatus = "none" | "recommended" | "documented" | "completed";

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  none: "No referral needed",
  recommended: "Referral recommended",
  documented: "Referral documented",
  completed: "Referral completed",
};
