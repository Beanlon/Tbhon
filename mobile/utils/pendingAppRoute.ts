import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@tbhon/pending-app-route";

export type PendingAppRoute = "verifyEmail";

export async function setPendingAppRoute(route: PendingAppRoute): Promise<void> {
  await AsyncStorage.setItem(KEY, route);
}

export async function consumePendingAppRoute(): Promise<PendingAppRoute | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(KEY);
  if (raw === "verifyEmail") return raw;
  return null;
}
