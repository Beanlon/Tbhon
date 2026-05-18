import type { ScreeningHistoryRow } from "../services/backendApi";

/** Same session TTL as profile — avoids refetch when revisiting Home / History. */
const SCREENING_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedScreenings: ScreeningHistoryRow[] | null = null;
let cachedAt = 0;

export function setCachedScreenings(screenings: ScreeningHistoryRow[]): void {
  cachedScreenings = screenings;
  cachedAt = Date.now();
}

export function peekScreenings(): ScreeningHistoryRow[] | null {
  return cachedScreenings;
}

export function peekLatestScreening(): ScreeningHistoryRow | null {
  return cachedScreenings?.[0] ?? null;
}

export function isScreeningCacheFresh(): boolean {
  if (!cachedScreenings) return false;
  return Date.now() - cachedAt < SCREENING_CACHE_TTL_MS;
}

export function clearScreeningCache(): void {
  cachedScreenings = null;
  cachedAt = 0;
}
