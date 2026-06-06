import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BottomNavTab } from "../app/components/BottomNav";

const KEY = "@tbhon/pending-home-tab";

export async function setPendingHomeTab(tab: BottomNavTab): Promise<void> {
  await AsyncStorage.setItem(KEY, tab);
}

export async function consumePendingHomeTab(): Promise<BottomNavTab | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(KEY);
  if (raw === "home" || raw === "history" || raw === "screening" || raw === "learn" || raw === "profile") {
    return raw;
  }
  return null;
}
