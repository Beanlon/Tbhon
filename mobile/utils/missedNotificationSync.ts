import type { InboxNotificationType } from "./notificationInbox";
import { addInboxNotification, shouldSuppressInboxNotification } from "./notificationInbox";
import {
  getPresentedNativeNotifications,
  type NativeNotificationContent,
} from "./nativeNotifications";

const NATIVE_PREFIX = "tbhon-unverified-";

type EngagementType = "screening_complete" | "verify_email" | "learn_tb";

function isEngagementType(value: unknown): value is EngagementType {
  return value === "screening_complete" || value === "verify_email" || value === "learn_tb";
}

function inboxIdForNativeNotification(notification: NativeNotificationContent): string | undefined {
  const dataType = notification.data?.type;
  const identifier = notification.identifier;

  if (identifier.startsWith(`${NATIVE_PREFIX}screening-`)) {
    const sessionId = identifier.slice(`${NATIVE_PREFIX}screening-`.length);
    if (sessionId) return `screening-${sessionId}`;
  }

  if (dataType === "screening_complete") {
    const sessionId = notification.data?.sessionId;
    if (typeof sessionId === "string" && sessionId.trim()) {
      return `screening-${sessionId.trim()}`;
    }
    return `native-${identifier}`;
  }

  if (dataType === "verify_email" || identifier.includes("verify")) {
    return "verify-email-nudge";
  }

  if (dataType === "learn_tb" || identifier.includes("learn")) {
    return "learn-tb-nudge";
  }

  if (isEngagementType(dataType)) {
    return `native-${identifier}`;
  }

  return undefined;
}

function fallbackTitle(type: EngagementType): string {
  if (type === "screening_complete") return "Screening saved";
  if (type === "learn_tb") return "Learn more about TB";
  return "Verify your email";
}

export async function mirrorEngagementNotificationToInbox(
  notification: NativeNotificationContent,
): Promise<boolean> {
  const dataType = notification.data?.type;
  if (!isEngagementType(dataType)) return false;

  const id = inboxIdForNativeNotification(notification);
  if (!id) return false;

  const title = notification.title.trim() || fallbackTitle(dataType);
  const body = notification.body.trim();
  if (!body) return false;

  if (await shouldSuppressInboxNotification(id)) return false;

  await addInboxNotification({
    id,
    type: dataType as InboxNotificationType,
    title,
    body,
    read: false,
  });
  return true;
}

/** Pull system notifications that arrived while the app was closed into the in-app inbox. */
export async function syncPresentedNativeNotificationsToInbox(): Promise<void> {
  const presented = await getPresentedNativeNotifications();
  for (const notification of presented) {
    await mirrorEngagementNotificationToInbox(notification);
  }
}
