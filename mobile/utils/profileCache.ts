import type { ApiUserPayload } from "../services/backendApi";

/** How long a cached profile avoids refetching when revisiting the Profile tab (same app session). */
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedUser: ApiUserPayload | null = null;
let cachedAt = 0;

export function setCachedProfile(user: ApiUserPayload): void {
  cachedUser = user;
  cachedAt = Date.now();
}

/** Last cached user, or null if none (e.g. after logout). */
export function peekProfile(): ApiUserPayload | null {
  return cachedUser;
}

/** True if we have a cache entry still within TTL (tab revisits can skip network). */
export function isProfileCacheFresh(): boolean {
  if (!cachedUser) return false;
  return Date.now() - cachedAt < PROFILE_CACHE_TTL_MS;
}

export function clearProfileCache(): void {
  cachedUser = null;
  cachedAt = 0;
}
