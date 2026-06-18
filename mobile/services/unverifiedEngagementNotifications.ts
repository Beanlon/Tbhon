import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiUserPayload } from "./backendApi";
import { celebrateFirstEmailVerification } from "./accountActivityNotifications";
import { addInboxNotification, ensureNotificationInboxUser, loadNotificationInbox, unreadInboxCount } from "../utils/notificationInbox";
import { mirrorEngagementNotificationToInbox, syncPresentedNativeNotificationsToInbox } from "../utils/missedNotificationSync";
import { setPendingHomeTab } from "../utils/pendingHomeTab";
import { setPendingAppRoute } from "../utils/pendingAppRoute";
import {
  PATIENT_SCREENING_SAVED_NUDGE,
  PATIENT_VERIFY_INBOX_NUDGE,
  PATIENT_VERIFY_INBOX_REPEAT,
  STAFF_SCREENING_SAVED_NUDGE,
  STAFF_VERIFY_INBOX_INITIAL_PUSH,
  STAFF_VERIFY_INBOX_NUDGE,
  STAFF_VERIFY_INBOX_REPEAT,
} from "../constants/patientAccess";
import { isPatientRole, parseUserRole } from "../constants/userRole";
import { peekProfile } from "../utils/profileCache";
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

async function scheduleOccasionalReminders(isPatient: boolean): Promise<void> {
  await scheduleOneShot({
    identifier: ID_VERIFY_REMINDER,
    title: "Verify your TBhon email",
    body: isPatient ? PATIENT_VERIFY_INBOX_REPEAT : STAFF_VERIFY_INBOX_REPEAT,
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

async function ensureVerifyEmailInboxNudge(isPatient: boolean): Promise<void> {
  const inbox = await loadNotificationInbox();
  if (inbox.some((n) => n.id === "verify-email-nudge")) return;
  await addInboxNotification({
    id: "verify-email-nudge",
    type: "verify_email",
    title: "Verify your email",
    body: isPatient ? PATIENT_VERIFY_INBOX_NUDGE : STAFF_VERIFY_INBOX_NUDGE,
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
  const isPatient = isPatientRole(parseUserRole(user.role));
  const isFirst = await markAccountEngagementStarted();

  await ensureVerifyEmailInboxNudge(isPatient);

  if (granted && isFirst) {
    await scheduleOneShot({
      identifier: ID_VERIFY_INITIAL,
      title: "Welcome to TBhon",
      body: isPatient ? PATIENT_VERIFY_INBOX_NUDGE : STAFF_VERIFY_INBOX_INITIAL_PUSH,
      seconds: VERIFY_INITIAL_SECONDS,
      data: { type: "verify_email", route: "verifyEmail" },
    });
  }

  if (granted) {
    await scheduleOccasionalReminders(isPatient);
  }
}

/**
 * Keeps occasional reminders scheduled; clears them when verified.
 * Also mirrors any native notifications that arrived while the app was closed.
 */
export async function syncUnverifiedEngagementNotifications(
  user: ApiUserPayload | null | undefined,
): Promise<void> {
  await syncPresentedNativeNotificationsToInbox();
  if (!user) return;
  if (!isUnverified(user)) {
    await onUserBecameVerified();
    return;
  }
  const isPatient = isPatientRole(parseUserRole(user.role));
  await ensureVerifyEmailInboxNudge(isPatient);
  if (!(await ensureNativeNotificationPermission())) return;
  await scheduleOccasionalReminders(isPatient);
}

/** Run on app open / foreground so inbox badge reflects notifications sent while away. */
export async function syncEngagementNotificationsOnAppActive(
  user: ApiUserPayload | null | undefined,
): Promise<void> {
  await syncUnverifiedEngagementNotifications(user);
}

/** Every completed screening writes an inbox success entry; unverified users also get verify nudges. */
export async function onScreeningCompleted(args?: {
  sessionId?: string;
  riskLabel?: string;
  user?: ApiUserPayload | null;
  /** "preliminary" when only cough + checklist were saved and the smear will follow. */
  stage?: "preliminary" | "final";
}): Promise<void> {
  const user = args?.user ?? peekProfile();
  if (user?.userId) {
    ensureNotificationInboxUser(user.userId);
  }
  const isPatient = isPatientRole(parseUserRole(user?.role));
  const userIsUnverified = user?.emailVerified !== true;
  const isPreliminary = args?.stage === "preliminary";
  const title = isPreliminary
    ? isPatient
      ? "Preliminary result saved"
      : "Preliminary screening saved"
    : isPatient
      ? "Result saved"
      : "Screening saved";
  const risk = args?.riskLabel ? ` (${args.riskLabel})` : "";
  const preliminaryBody = isPatient
    ? "Your preliminary result is saved. The sputum smear will be added later and your score may change."
    : "Preliminary result saved — sputum smear pending. Add the smear later from History to finalize.";
  const body = isPreliminary
    ? preliminaryBody
    : userIsUnverified
      ? isPatient
        ? PATIENT_SCREENING_SAVED_NUDGE
        : STAFF_SCREENING_SAVED_NUDGE
      : isPatient
        ? "Your visit result is saved and available in History."
        : "This screening session is saved and available in History.";

  await addInboxNotification({
    id: args?.sessionId ? `screening-${args.sessionId}` : undefined,
    type: "screening_complete",
    title,
    body,
    read: false,
  });

  if (!userIsUnverified) {
    await setNativeAppBadgeCount(await unreadInboxCount());
    return;
  }

  const scheduled = await scheduleNativeNotification({
    identifier: args?.sessionId
      ? `${PREFIX}screening-${args.sessionId}`
      : `${PREFIX}screening-${Date.now()}`,
    title: `${title}${risk}`,
    body,
    data: {
      type: "screening_complete",
      route: "verifyEmail",
      ...(args?.sessionId ? { sessionId: args.sessionId } : {}),
    },
    seconds: null,
    channelId: ANDROID_CHANNEL_ID,
  });

  if (scheduled) {
    await incrementNativeAppBadge();
  }
}

export const onUnverifiedScreeningCompleted = onScreeningCompleted;

/**
 * Two-phase screening: the sputum smear was added later and the result was finalized.
 * Writes a distinct inbox entry (and native nudge for unverified) so a claimed patient
 * knows their score was updated.
 */
export async function onScreeningUpdated(args?: {
  sessionId?: string;
  riskLabel?: string;
  user?: ApiUserPayload | null;
}): Promise<void> {
  const user = args?.user ?? peekProfile();
  if (user?.userId) {
    ensureNotificationInboxUser(user.userId);
  }
  const isPatient = isPatientRole(parseUserRole(user?.role));
  const userIsUnverified = user?.emailVerified !== true;
  const title = isPatient ? "Result updated" : "Screening finalized";
  const risk = args?.riskLabel ? ` (${args.riskLabel})` : "";
  const body = isPatient
    ? "Your screening result was updated after sputum smear review. Open History to see your latest score."
    : "Sputum smear added — screening finalized. The updated result is in History.";

  await addInboxNotification({
    id: args?.sessionId ? `screening-updated-${args.sessionId}` : undefined,
    type: "screening_updated",
    title,
    body,
    read: false,
  });

  if (!userIsUnverified) {
    // Still notify on device for the smear update even when verified, so a
    // released patient learns their result changed.
    const scheduled = await scheduleNativeNotification({
      identifier: args?.sessionId
        ? `${PREFIX}screening-updated-${args.sessionId}`
        : `${PREFIX}screening-updated-${Date.now()}`,
      title: `${title}${risk}`,
      body,
      data: {
        type: "screening_complete",
        ...(args?.sessionId ? { sessionId: args.sessionId } : {}),
      },
      seconds: null,
      channelId: ANDROID_CHANNEL_ID,
    });
    if (scheduled) await incrementNativeAppBadge();
    await setNativeAppBadgeCount(await unreadInboxCount());
    return;
  }

  const scheduled = await scheduleNativeNotification({
    identifier: args?.sessionId
      ? `${PREFIX}screening-updated-${args.sessionId}`
      : `${PREFIX}screening-updated-${Date.now()}`,
    title: `${title}${risk}`,
    body,
    data: {
      type: "screening_complete",
      route: "verifyEmail",
      ...(args?.sessionId ? { sessionId: args.sessionId } : {}),
    },
    seconds: null,
    channelId: ANDROID_CHANNEL_ID,
  });
  if (scheduled) await incrementNativeAppBadge();
}

export async function handleNotificationResponse(response: NotificationResponsePayload): Promise<void> {
  const content = response.notification.request.content;
  const data = content.data as UnverifiedNotificationData | undefined;
  if (!data?.type) return;

  await mirrorEngagementNotificationToInbox({
    identifier: response.notification.request.identifier ?? `native-response-${Date.now()}`,
    title: content.title ?? "",
    body: content.body ?? "",
    data: content.data,
  });

  if (data.route === "learn" || data.type === "learn_tb") {
    await setPendingHomeTab("learn");
    return;
  }
  if (data.route === "verifyEmail" || data.type === "verify_email" || data.type === "screening_complete") {
    await setPendingAppRoute("verifyEmail");
  }
}
