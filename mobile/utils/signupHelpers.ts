/** Normalize Filipino mobile input (local digits after +63) to E.164-style +63... */
export function normalizePhilippineMobile(local: string): string | undefined {
  const digits = local.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("63") && digits.length >= 12) {
    return `+${digits.slice(0, 12)}`;
  }
  if (digits.startsWith("0") && digits.length >= 11) {
    return `+63${digits.slice(1, 11)}`;
  }
  if (digits.startsWith("9") && digits.length === 10) {
    return `+63${digits}`;
  }
  if (digits.length >= 10) {
    const tail = digits.slice(-10);
    return tail.startsWith("9") ? `+63${tail}` : `+63${digits}`;
  }
  return `+63${digits}`;
}

/** Map UI gender label to lowercase for API. */
export function normalizeGenderForApi(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Parse birthdate from sign-up UI: "YYYY-MM-DD" or "MM / DD / YYYY" style.
 * Returns ISO date string yyyy-mm-dd for Prisma/MySQL DATE, or null if invalid.
 */
export function signupBirthdateToIso(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return isValidCalendarDate(y, m, d) ? `${pad(iso[1], 4)}-${iso[2]}-${iso[3]}` : null;
  }

  const mdy = s.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/);
  if (!mdy) return null;

  const month = Number(mdy[1]);
  const day = Number(mdy[2]);
  const year = Number(mdy[3]);

  if (
    !(month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100)
  ) {
    return null;
  }
  if (!isValidCalendarDate(year, month, day)) return null;
  return `${year}-${pad(String(month), 2)}-${pad(String(day), 2)}`;
}

function pad(num: string, len: number) {
  return num.padStart(len, "0");
}

function isValidCalendarDate(year: number, month: number, day: number) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}
