import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Metro / dev server host from Expo (same machine as LAN backend).
 */
function devPackagerLanHost(): string | null {
  const uri = Constants.expoConfig?.hostUri;
  if (!uri || typeof uri !== "string") return null;
  const host = uri.split(":")[0]?.trim();
  if (!host) return null;
  if (host === "localhost" || host === "127.0.0.1") return null;
  const lower = host.toLowerCase();
  if (lower.includes("exp.direct") || lower.includes("expo.dev")) return null;
  return host;
}

/** Default backend REST port for Tbhon-Backend Express. */
const DEFAULT_BACKEND_PORT = 4000;

/**
 * Base URL for REST API (no trailing slash).
 * 1) EXPO_PUBLIC_API_URL or app.json extra.apiBaseUrl
 * 2) Expo dev LAN host → http://<host>:4000
 * 3) Android emulator → http://10.0.2.2:4000
 * 4) http://127.0.0.1:4000
 */
export function resolveApiBaseUrl(): string {
  const fromEnv =
    (typeof process !== "undefined" && (process.env.EXPO_PUBLIC_API_URL as string | undefined)) ||
    ((Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl as
      | string
      | undefined);
  if (fromEnv && String(fromEnv).trim().length > 0) {
    return String(fromEnv).replace(/\/$/, "");
  }
  const lan = devPackagerLanHost();
  if (lan) {
    return `http://${lan}:${DEFAULT_BACKEND_PORT}`;
  }
  if (Platform.OS === "android" && Constants.isDevice === false) {
    return `http://10.0.2.2:${DEFAULT_BACKEND_PORT}`;
  }
  if (Constants.isDevice && __DEV__) {
    console.warn(
      "[API] Physical device needs EXPO_PUBLIC_API_URL=http://<PC_IP>:4000 or Expo LAN mode so hostUri is not tunnel."
    );
  }
  return `http://127.0.0.1:${DEFAULT_BACKEND_PORT}`;
}
