import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addInboxNotification,
  loadNotificationInbox,
  type InboxNotificationType,
} from "../utils/notificationInbox";

const EMAIL_VERIFIED_NOTIF_KEY_PREFIX = "@tbhon/email-verified-notif-shown/";

function emailVerifiedInboxId(userId: string): string {
  return `email-verified-${userId}`;
}

function emailVerifiedStorageKey(userId: string): string {
  return `${EMAIL_VERIFIED_NOTIF_KEY_PREFIX}${userId}`;
}

export async function hasEmailVerifiedNotificationBeenShown(userId: string): Promise<boolean> {
  if (!userId) return true;
  return Boolean(await AsyncStorage.getItem(emailVerifiedStorageKey(userId)));
}

let emailVerifiedNotifyInFlight: Promise<void> | null = null;

/**
 * Inbox success entry — call only immediately after the user verifies in-app.
 * Never call on login, app open, or profile refresh.
 */
export async function celebrateFirstEmailVerification(userId: string): Promise<boolean> {
  if (!userId) return false;
  if (await hasEmailVerifiedNotificationBeenShown(userId)) return false;

  if (emailVerifiedNotifyInFlight) {
    await emailVerifiedNotifyInFlight;
    return false;
  }

  emailVerifiedNotifyInFlight = (async () => {
    const storageKey = emailVerifiedStorageKey(userId);
    const inboxId = emailVerifiedInboxId(userId);

    await AsyncStorage.setItem(storageKey, new Date().toISOString());

    const existing = await loadNotificationInbox();
    if (!existing.some((n) => n.id === inboxId)) {
      await addInboxNotification({
        id: inboxId,
        type: "email_verified",
        title: "Email verified",
        body: "You can now export screening reports as PDF.",
        read: true,
      });
    }
  })();

  try {
    await emailVerifiedNotifyInFlight;
    return true;
  } finally {
    emailVerifiedNotifyInFlight = null;
  }
}

async function notifyActivityInboxOnly(args: {
  type: InboxNotificationType;
  title: string;
  body: string;
  id?: string;
}): Promise<void> {
  await addInboxNotification({
    id: args.id,
    type: args.type,
    title: args.title,
    body: args.body,
  });
}

/** Inbox only — success is already shown via Alert on the password screen. */
export async function notifyPasswordChanged(): Promise<void> {
  await notifyActivityInboxOnly({
    id: `password-changed-${Date.now()}`,
    type: "password_changed",
    title: "Password updated",
    body: "Your password was changed successfully. Sign in again with your new password.",
  });
}

export async function notifyProfileUpdated(): Promise<void> {
  await notifyActivityInboxOnly({
    type: "profile_updated",
    title: "Profile updated",
    body: "Your profile information has been saved.",
  });
}
