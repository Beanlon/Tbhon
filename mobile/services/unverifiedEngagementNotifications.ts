import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiUserPayload } from "./backendApi";
import { celebrateFirstEmailVerification } from "./accountActivityNotifications";
import { addInboxNotification } from "../utils/notificationInbox";
import { setPendingHomeTab } from "../utils/pendingHomeTab";
import { setPendingAppRoute } from "../utils/pendingAppRoute";
import {
  cancelNativeNotificationsWithPrefix,
  configureNativeNotificationPresentation,
  ensureNativeNotificationPermission,
  incrementNativeAppBadge,
  isNativeNotificationsAvailable,
  scheduleNativeNotification,
  setNativeAppBadgeCount,
  type NotificationResponsePayload,
} from "../utils/nativeNotifications";

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

export function configureNotificationPresentation(): void {
  void configureNativeNotificationPresentation();
}

function isUnverified(user: ApiUserPayload | null | undefined): boolean {
  return Boolean(user && user.emailVerified !== true);
}

async function scheduleOneShot(args: {
  identifier: string;
  title: string;
  body: string;
  seconds: number;
  data: UnverifiedNotificationData;
}): Promise<void> {
  if (!(await ensureNativeNotificationPermission())) return;

  await scheduleNativeNotification({
    identifier: args.identifier,
    title: args.title,
    body: args.body,
    data: args.data,
    seconds: args.seconds,
    channelId: ANDROID_CHANNEL_ID,
  });
}

async function markAccountEngagementStarted(): Promise<boolean> {
  const seen = await AsyncStorage.getItem(ACCOUNT_SEEN_KEY);
  if (seen) return false;
  await AsyncStorage.setItem(ACCOUNT_SEEN_KEY, new Date().toISOString());
  return true;
}

export async function clearUnverifiedEngagementState(): Promise<void> {
  await cancelNativeNotificationsWithPrefix(PREFIX);
  await AsyncStorage.removeItem(ACCOUNT_SEEN_KEY);
  await setNativeAppBadgeCount(0);
}

/** Cancel scheduled nudges when the user is verified. Does not show success UI. */
export async function onUserBecameVerified(): Promise<void> {
  await clearUnverifiedEngagementState();
}

/** Call once right after POST verify-email succeeds — not on login or app open. */
export async function onEmailVerificationSucceeded(userId: string): Promise<boolean> {
  await onUserBecameVerified();
  return celebrateFirstEmailVerification(userId);
}

async function scheduleOccasionalReminders(): Promise<void> {
  await scheduleOneShot({
    identifier: ID_VERIFY_REMINDER,
    title: "Verify your TBhon email",
    body: "Verify your email to export screening reports as PDF.",
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

  const granted = isNativeNotificationsAvailable()
    ? await ensureNativeNotificationPermission()
    : false;
  const isFirst = await markAccountEngagementStarted();

  if (isFirst) {
    await addInboxNotification({
      id: "verify-email-nudge",
      type: "verify_email",
      title: "Verify your email",
      body: "Verify your email to unlock screening PDF export.",
    });
  }

  if (granted && isFirst) {
    await scheduleOneShot({
      identifier: ID_VERIFY_INITIAL,
      title: "Welcome to TBhon",
      body: "Verify your email when you have a moment — it unlocks PDF export for screening reports.",
      seconds: VERIFY_INITIAL_SECONDS,
      data: { type: "verify_email", route: "verifyEmail" },
    });
  }

  if (granted) {
    await scheduleOccasionalReminders();
  }
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
  if (!(await ensureNativeNotificationPermission())) return;
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
    "Your screening is saved. Verify your email to export a PDF report. Not a medical diagnosis.";

  await addInboxNotification({
    id: args?.sessionId ? `screening-${args.sessionId}` : undefined,
    type: "screening_complete",
    title,
    body,
  });

  const scheduled = await scheduleNativeNotification({
    identifier: args?.sessionId
      ? `${PREFIX}screening-${args.sessionId}`
      : `${PREFIX}screening-${Date.now()}`,
    title: `${title}${risk}`,
    body,
    data: { type: "screening_complete", route: "verifyEmail" },
    seconds: null,
    channelId: ANDROID_CHANNEL_ID,
  });

  if (scheduled) {
    await incrementNativeAppBadge();
  }
}

export async function handleNotificationResponse(response: NotificationResponsePayload): Promise<void> {
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
