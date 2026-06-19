import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearUnverifiedEngagementState } from "../services/unverifiedEngagementNotifications";
import { clearProfileCache } from "./profileCache";

const ACCESS_TOKEN_KEY = "tbhon_auth_token";
const REFRESH_TOKEN_KEY = "tbhon_refresh_token";

export async function saveAuthSession(accessToken: string, refreshToken: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, accessToken],
    [REFRESH_TOKEN_KEY, refreshToken],
  ]);
}

/** Update access token only (after refresh). */
export async function saveAuthToken(accessToken: string): Promise<void> {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function clearAuthToken(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
  clearProfileCache();
  await clearUnverifiedEngagementState();
}
