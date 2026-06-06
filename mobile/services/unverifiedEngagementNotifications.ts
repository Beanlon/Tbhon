import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import type { ApiUserPayload } from "./backendApi";
import { addInboxNotification, clearNotificationInbox } from "../utils/notificationInbox";
import { setPendingHomeTab } from "../utils/pendingHomeTab";
import { setPendingAppRoute } from "../utils/pendingAppRoute";

const ANDROID_CHANNEL_ID = "tbhon-unverified-engagement";
const ACCOUNT_SEEN_KEY = "@tbhon/unverified-notif/account-seen";
const PREFIX = "tbhon-unverified-";

const ID_VERIFY_INITIAL = `${PREFIX}verify-initial`;
const ID_VERIFY_REMINDER = `${PREFIX}verify-reminder`;
const ID_LEARN_REMINDER = `${PREFIX}learn-reminder`;

/** Soon after account creation. */
const VERIFY_INITIAL_SECONDS = 15 * 60;
/** Occasional verify nudge. */
const VERIFY_REPEAT_SECONDS = 7 * 24 * 60 * 60;
/** Occasional TB education. */
const LEARN_REPEAT_SECONDS = 14 * 24 * 60 * 60;

export type UnverifiedNotificationData = {
  type: "screening_complete" | "verify_email" | "learn_tb";
  route?: "verifyEmail" | "learn";
};

let handlerConfigured = false;

export function configureNotificationPresentation(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Account & screening reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  configureNotificationPresentation();
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function isUnverified(user: ApiUserPayload | null | undefined): boolean {
  return Boolean(user && user.emailVerified !== true);
}

async function cancelUnverifiedScheduled(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function hasScheduledId(id: string): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((n) => n.identifier === id);
}

async function scheduleOneShot(args: {
  identifier: string;
  title: string;
  body: string;
  seconds: number;
  data: UnverifiedNotificationData;
}): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  if (await hasScheduledId(args.identifier)) {
    await Notifications.cancelScheduledNotificationAsync(args.identifier);
  }

  await Notifications.scheduleNotificationAsync({
    identifier: args.identifier,
    content: {
      title: args.title,
      body: args.body,
      data: args.data,
      sound: true,
      ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(60, args.seconds),
    },
  });
}

async function markAccountEngagementStarted(): Promise<boolean> {
  const seen = await AsyncStorage.getItem(ACCOUNT_SEEN_KEY);
  if (seen) return false;
  await AsyncStorage.setItem(ACCOUNT_SEEN_KEY, new Date().toISOString());
  return true;
}

export async function clearUnverifiedEngagementState(): Promise<void> {
  await cancelUnverifiedScheduled();
  await AsyncStorage.removeItem(ACCOUNT_SEEN_KEY);
  await Notifications.setBadgeCountAsync(0).catch(() => {});
}

/** Cancel scheduled nudges when the user verifies email. */
export async function onUserBecameVerified(): Promise<void> {
  await clearUnverifiedEngagementState();
  await clearNotificationInbox();
}

async function scheduleOccasionalReminders(): Promise<void> {
  await scheduleOneShot({
    identifier: ID_VERIFY_REMINDER,
    title: "Verify your TBhon email",
    body: "Verify your email to download screening history and share results.",
    seconds: VERIFY_REPEAT_SECONDS,
    data: { type: "verify_email", route: "verifyEmail" },
  });

  await scheduleOneShot({
    identifier: ID_LEARN_REMINDER,
    title: "Learn more about TB",
    body: "Explore symptoms, prevention, and when to seek care in the Learn tab.",
    seconds: LEARN_REPEAT_SECONDS,
    data: { type: "learn_tb", route: "learn" },
  });
}

/**
 * After register/login for an unverified user: initial verify nudge + occasional schedules.
 */
export async function onUnverifiedAccountSession(user: ApiUserPayload): Promise<void> {
  if (!isUnverified(user)) {
    await onUserBecameVerified();
    return;
  }

  const granted = await ensureNotificationPermission();
  const isFirst = await markAccountEngagementStarted();

  await addInboxNotification({
    type: "verify_email",
    title: "Verify your email",
    body: "Verify your email to unlock history download and result sharing.",
  });

  if (granted && isFirst) {
    await scheduleOneShot({
      identifier: ID_VERIFY_INITIAL,
      title: "Welcome to TBhon",
      body: "Verify your email when you have a moment — it unlocks history download and sharing.",
      seconds: VERIFY_INITIAL_SECONDS,
      data: { type: "verify_email", route: "verifyEmail" },
    });
  }

  await scheduleOccasionalReminders();
}

/**
 * Keeps occasional reminders scheduled; clears them when verified.
 */
export async function syncUnverifiedEngagementNotifications(
  user: ApiUserPayload | null | undefined,
): Promise<void> {
  if (!user) return;
  if (!isUnverified(user)) {
    await onUserBecameVerified();
    return;
  }
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  await scheduleOccasionalReminders();
}

/** Every completed screening while email is unverified. */
export async function onUnverifiedScreeningCompleted(args?: {
  sessionId?: string;
  riskLabel?: string;
}): Promise<void> {
  const title = "Screening saved";
  const risk = args?.riskLabel ? ` (${args.riskLabel})` : "";
  const body =
    "Your screening is saved. Verify your email to download history and share results. Not a medical diagnosis.";

  await addInboxNotification({
    id: args?.sessionId ? `screening-${args.sessionId}` : undefined,
    type: "screening_complete",
    title,
    body,
  });

  const granted = await ensureNotificationPermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    identifier: args?.sessionId
      ? `${PREFIX}screening-${args.sessionId}`
      : `${PREFIX}screening-${Date.now()}`,
    content: {
      title: `${title}${risk}`,
      body,
      data: { type: "screening_complete", route: "verifyEmail" } satisfies UnverifiedNotificationData,
      sound: true,
      ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: null,
  });

  const count = await Notifications.getBadgeCountAsync();
  await Notifications.setBadgeCountAsync(count + 1).catch(() => {});
}

export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<void> {
  const data = response.notification.request.content.data as UnverifiedNotificationData | undefined;
  if (!data?.type) return;

  if (data.route === "learn" || data.type === "learn_tb") {
    await setPendingHomeTab("learn");
    return;
  }
  if (data.route === "verifyEmail" || data.type === "verify_email" || data.type === "screening_complete") {
    await setPendingAppRoute("verifyEmail");
  }
}
