import AsyncStorage from "@react-native-async-storage/async-storage";

export type InboxNotificationType =
  | "screening_complete"
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
  /** ISO timestamp — item is hidden after this time. */
  expiresAt: string;
  read: boolean;
};

const INBOX_KEY = "@tbhon/notification-inbox";
const MAX_ITEMS = 50;
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** How long each notification type stays in the inbox. */
const NOTIFICATION_TTL_MS: Record<InboxNotificationType, number> = {
  email_verified: 7 * 24 * 60 * 60 * 1000,
  password_changed: 14 * 24 * 60 * 60 * 1000,
  profile_updated: 14 * 24 * 60 * 60 * 1000,
  verify_email: 30 * 24 * 60 * 60 * 1000,
  screening_complete: 30 * 24 * 60 * 60 * 1000,
  learn_tb: 30 * 24 * 60 * 60 * 1000,
};

function ttlMsForType(type: InboxNotificationType): number {
  return NOTIFICATION_TTL_MS[type] ?? DEFAULT_TTL_MS;
}

function expiresAtFor(type: InboxNotificationType, createdAt: string): string {
  return new Date(new Date(createdAt).getTime() + ttlMsForType(type)).toISOString();
}

function isNotExpired(item: InboxNotification, now = Date.now()): boolean {
  const expiresAt = item.expiresAt ?? expiresAtFor(item.type, item.createdAt);
  return new Date(expiresAt).getTime() > now;
}

function normalizeInboxItem(value: InboxNotification): InboxNotification {
  return {
    ...value,
    expiresAt: value.expiresAt ?? expiresAtFor(value.type, value.createdAt),
  };
}

function pruneExpired(items: InboxNotification[]): InboxNotification[] {
  const now = Date.now();
  return items.map(normalizeInboxItem).filter((item) => isNotExpired(item, now));
}

export async function loadNotificationInbox(): Promise<InboxNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(INBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items = parsed.filter(isInboxItem).map(normalizeInboxItem);
    const active = pruneExpired(items);
    if (active.length !== items.length) {
      await saveInbox(active);
    }
    return active;
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

async function saveInbox(items: InboxNotification[]): Promise<void> {
  await AsyncStorage.setItem(INBOX_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export async function addInboxNotification(
  item: Omit<InboxNotification, "id" | "createdAt" | "read" | "expiresAt"> & {
    id?: string;
    read?: boolean;
  },
): Promise<InboxNotification | null> {
  const existing = await loadNotificationInbox();
  const id = item.id ?? `${item.type}-${Date.now()}`;
  if (existing.some((n) => n.id === id)) {
    return existing.find((n) => n.id === id) ?? null;
  }

  const createdAt = new Date().toISOString();
  const entry: InboxNotification = {
    id,
    type: item.type,
    title: item.title,
    body: item.body,
    createdAt,
    expiresAt: expiresAtFor(item.type, createdAt),
    read: item.read === true,
  };
  await saveInbox([entry, ...existing]);
  return entry;
}

export async function markInboxNotificationRead(id: string): Promise<void> {
  const items = await loadNotificationInbox();
  await saveInbox(items.map((n) => (n.id === id ? { ...n, read: true } : n)));
}

export async function markAllInboxRead(): Promise<void> {
  const items = await loadNotificationInbox();
  await saveInbox(items.map((n) => ({ ...n, read: true })));
}

export async function unreadInboxCount(): Promise<number> {
  const items = await loadNotificationInbox();
  return items.filter((n) => !n.read).length;
}

export async function clearNotificationInbox(): Promise<void> {
  await AsyncStorage.removeItem(INBOX_KEY);
}
