import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getPresentedNativeNotifications,
  type NativeNotificationContent,
} from "./nativeNotifications";

export type InboxNotificationType =
  | "screening_complete"
  | "screening_updated"
  | "verify_email"
  | "learn_tb"
  | "email_verified"
  | "password_changed"
  | "profile_updated";

export type InboxNotification = {
  id: string;
  type: InboxNotificationType;
  title: string;
  body: string;
  createdAt: string;
  /** Deprecated: older inbox entries may still include this, but notifications now persist until cleared. */
  expiresAt?: string;
  read: boolean;
};

const SCREENING_INBOX_TYPES: ReadonlySet<InboxNotificationType> = new Set([
  "screening_complete",
  "screening_updated",
]);

/** Screening result notifications belong on the bell only — not bottom-nav tab badges. */
export function isScreeningInboxNotification(type: InboxNotificationType): boolean {
  return SCREENING_INBOX_TYPES.has(type);
}

export function countUnreadInboxItems(
  items: InboxNotification[],
  options?: { screeningOnly?: boolean; excludeScreening?: boolean },
): number {
  return items.filter((n) => {
    if (n.read) return false;
    if (options?.screeningOnly) return isScreeningInboxNotification(n.type);
    if (options?.excludeScreening) return !isScreeningInboxNotification(n.type);
    return true;
  }).length;
}

const LEGACY_INBOX_KEY = "@tbhon/notification-inbox";
const INBOX_KEY_PREFIX = "@tbhon/notification-inbox/";
const DISMISSED_KEY_PREFIX = "@tbhon/notification-inbox-dismissed/";
const CLEARED_AT_KEY_PREFIX = "@tbhon/notification-inbox-cleared-at/";
const MAX_ITEMS = 50;

/** Static inbox ids that sync may recreate unless explicitly dismissed. */
const STATIC_INBOX_IDS = ["verify-email-nudge", "learn-tb-nudge"] as const;

type InboxChangeListener = () => void;

const inboxChangeListeners = new Set<InboxChangeListener>();

/** Serialize inbox writes so mark-all-read cannot overwrite a concurrent add. */
let inboxMutation: Promise<unknown> = Promise.resolve();

/** Active signed-in user — inbox reads/writes are scoped to this id only. */
let activeUserId: string | null = null;

function runInboxMutation<T>(fn: () => Promise<T>): Promise<T> {
  const next = inboxMutation.then(fn, fn);
  inboxMutation = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function normalizeInboxItem(value: InboxNotification): InboxNotification {
  return {
    ...value,
  };
}

function emitInboxChanged(): void {
  for (const listener of inboxChangeListeners) {
    listener();
  }
}

function resolveActiveUserId(): string | null {
  if (activeUserId) return activeUserId;

  // Lazy require avoids a circular import with profileCache at module load time.
  try {
    const { peekProfile } = require("./profileCache") as typeof import("./profileCache");
    const userId = peekProfile()?.userId?.trim();
    if (userId) {
      activeUserId = userId;
      return userId;
    }
  } catch {
    /* profile cache unavailable */
  }
  return null;
}

/** Bind inbox reads/writes to the signed-in user before sync or add calls. */
export function ensureNotificationInboxUser(userId?: string | null): void {
  const next = userId?.trim() ? userId.trim() : resolveActiveUserId();
  if (next) {
    setNotificationInboxUser(next);
  }
}

function inboxKey(userId: string): string {
  return `${INBOX_KEY_PREFIX}${userId}`;
}

function dismissedKey(userId: string): string {
  return `${DISMISSED_KEY_PREFIX}${userId}`;
}

function clearedAtKey(userId: string): string {
  return `${CLEARED_AT_KEY_PREFIX}${userId}`;
}

async function migrateLegacyInboxIfNeeded(userId: string): Promise<void> {
  const legacyRaw = await AsyncStorage.getItem(LEGACY_INBOX_KEY);
  if (!legacyRaw) return;

  const userRaw = await AsyncStorage.getItem(inboxKey(userId));
  if (!userRaw) {
    await AsyncStorage.setItem(inboxKey(userId), legacyRaw);
  }
  await AsyncStorage.removeItem(LEGACY_INBOX_KEY);
}

/** Call when the signed-in user changes (login, profile refresh, logout). */
export function setNotificationInboxUser(userId: string | null): void {
  const next = userId?.trim() ? userId.trim() : null;
  if (activeUserId === next) return;
  activeUserId = next;
  if (next) {
    void migrateLegacyInboxIfNeeded(next);
  }
  emitInboxChanged();
}

export function subscribeNotificationInbox(listener: InboxChangeListener): { remove: () => void } {
  inboxChangeListeners.add(listener);
  return {
    remove: () => {
      inboxChangeListeners.delete(listener);
    },
  };
}

async function loadDismissedIds(userId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(dismissedKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

async function saveDismissedIds(userId: string, ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(dismissedKey(userId), JSON.stringify([...ids]));
}

export async function getInboxClearedAt(): Promise<string | null> {
  const userId = resolveActiveUserId();
  if (!userId) return null;
  const raw = await AsyncStorage.getItem(clearedAtKey(userId));
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function isNotificationDismissed(id: string): Promise<boolean> {
  const userId = resolveActiveUserId();
  if (!userId) return true;
  const dismissed = await loadDismissedIds(userId);
  return dismissed.has(id);
}

/** True when a notification must not be shown or recreated (dismissed or cleared before its date). */
export async function shouldSuppressInboxNotification(id: string, createdAt?: string): Promise<boolean> {
  return isNotificationBlocked(id, createdAt);
}

async function isNotificationBlocked(id: string, createdAt?: string): Promise<boolean> {
  if (await isNotificationDismissed(id)) return true;

  const clearedAt = await getInboxClearedAt();
  if (!clearedAt || !createdAt) return false;

  const createdMs = new Date(createdAt).getTime();
  const clearedMs = new Date(clearedAt).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(clearedMs)) return false;
  return createdMs <= clearedMs;
}

const NATIVE_PREFIX = "tbhon-unverified-";

function inboxIdForPresentedNative(notification: NativeNotificationContent): string | undefined {
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

  return undefined;
}

export async function loadNotificationInbox(): Promise<InboxNotification[]> {
  const userId = resolveActiveUserId();
  if (!userId) return [];

  try {
    const raw = await AsyncStorage.getItem(inboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isInboxItem).map(normalizeInboxItem);
  } catch {
    return [];
  }
}

function isInboxItem(value: unknown): value is InboxNotification {
  if (!value || typeof value !== "object") return false;
  const v = value as InboxNotification;
  return (
    typeof v.id === "string" &&
    typeof v.type === "string" &&
    typeof v.title === "string" &&
    typeof v.body === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.read === "boolean" &&
    (v.expiresAt === undefined || typeof v.expiresAt === "string")
  );
}

async function saveInbox(userId: string, items: InboxNotification[]): Promise<void> {
  await AsyncStorage.setItem(inboxKey(userId), JSON.stringify(items.slice(0, MAX_ITEMS)));
  emitInboxChanged();
}

export async function addInboxNotification(
  item: Omit<InboxNotification, "id" | "createdAt" | "read" | "expiresAt"> & {
    id?: string;
    createdAt?: string;
    read?: boolean;
  },
): Promise<InboxNotification | null> {
  return runInboxMutation(async () => {
    const userId = resolveActiveUserId();
    if (!userId) return null;

    const id = item.id ?? `${item.type}-${Date.now()}`;
    const createdAt =
      typeof item.createdAt === "string" && Number.isFinite(new Date(item.createdAt).getTime())
        ? item.createdAt
        : new Date().toISOString();

    if (await isNotificationBlocked(id, createdAt)) {
      return null;
    }

    const existing = await loadNotificationInbox();
    const prior = existing.find((n) => n.id === id);
    if (prior) {
      if (!prior.read && item.read !== true) {
        return prior;
      }
      if (prior.read && item.read !== true) {
        const revived = { ...prior, read: false, title: item.title, body: item.body, createdAt };
        await saveInbox(
          userId,
          [revived, ...existing.filter((n) => n.id !== id)],
        );
        return revived;
      }
      return prior;
    }

    const entry: InboxNotification = {
      id,
      type: item.type,
      title: item.title,
      body: item.body,
      createdAt,
      read: item.read === true,
    };
    await saveInbox(userId, [entry, ...existing]);
    return entry;
  });
}

export async function markInboxNotificationRead(id: string): Promise<void> {
  await runInboxMutation(async () => {
    const userId = resolveActiveUserId();
    if (!userId) return;

    const items = await loadNotificationInbox();
    if (!items.some((n) => n.id === id && !n.read)) return;
    await saveInbox(
      userId,
      items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  });
}

export async function markInboxNotificationsOfTypeRead(type: InboxNotificationType): Promise<void> {
  await runInboxMutation(async () => {
    const userId = resolveActiveUserId();
    if (!userId) return;

    const items = await loadNotificationInbox();
    if (!items.some((n) => n.type === type && !n.read)) return;
    await saveInbox(
      userId,
      items.map((n) => (n.type === type ? { ...n, read: true } : n)),
    );
  });
}

/** Mark result notifications for one session read (e.g. user opened result or session details). */
export async function markSessionScreeningNotificationsRead(sessionId: string): Promise<void> {
  await runInboxMutation(async () => {
    const userId = resolveActiveUserId();
    if (!userId) return;

    const ids = new Set([`screening-${sessionId}`, `screening-updated-${sessionId}`]);
    const items = await loadNotificationInbox();
    if (!items.some((n) => ids.has(n.id) && !n.read)) return;
    await saveInbox(
      userId,
      items.map((n) => (ids.has(n.id) ? { ...n, read: true } : n)),
    );
  });
}

export async function markAllInboxRead(): Promise<void> {
  await runInboxMutation(async () => {
    const userId = resolveActiveUserId();
    if (!userId) return;

    const items = await loadNotificationInbox();
    if (!items.some((n) => !n.read)) return;
    await saveInbox(
      userId,
      items.map((n) => ({ ...n, read: true })),
    );
  });
}

export async function unreadInboxCount(): Promise<number> {
  const items = await loadNotificationInbox();
  return items.filter((n) => !n.read).length;
}

/** Remove this user's inbox and block sync from recreating dismissed items. */
export async function clearNotificationInbox(): Promise<void> {
  await runInboxMutation(async () => {
    const userId = resolveActiveUserId();
    if (!userId) return;

    const items = await loadNotificationInbox();
    const dismissed = await loadDismissedIds(userId);
    for (const item of items) {
      dismissed.add(item.id);
    }
    for (const id of STATIC_INBOX_IDS) {
      dismissed.add(id);
    }

    const presented = await getPresentedNativeNotifications();
    for (const notification of presented) {
      const mappedId = inboxIdForPresentedNative(notification);
      if (mappedId) dismissed.add(mappedId);
    }

    await saveDismissedIds(userId, dismissed);
    await AsyncStorage.setItem(clearedAtKey(userId), new Date().toISOString());
    await AsyncStorage.removeItem(inboxKey(userId));
    emitInboxChanged();
  });
}
