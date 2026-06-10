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
  /** Deprecated: older inbox entries may still include this, but notifications now persist until cleared. */
  expiresAt?: string;
  read: boolean;
};

const INBOX_KEY = "@tbhon/notification-inbox";
const MAX_ITEMS = 50;

type InboxChangeListener = () => void;

const inboxChangeListeners = new Set<InboxChangeListener>();

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

export function subscribeNotificationInbox(listener: InboxChangeListener): { remove: () => void } {
  inboxChangeListeners.add(listener);
  return {
    remove: () => {
      inboxChangeListeners.delete(listener);
    },
  };
}

export async function loadNotificationInbox(): Promise<InboxNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(INBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items = parsed.filter(isInboxItem).map(normalizeInboxItem);
    return items;
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
  emitInboxChanged();
}

export async function addInboxNotification(
  item: Omit<InboxNotification, "id" | "createdAt" | "read" | "expiresAt"> & {
    id?: string;
    createdAt?: string;
    read?: boolean;
  },
): Promise<InboxNotification | null> {
  const existing = await loadNotificationInbox();
  const id = item.id ?? `${item.type}-${Date.now()}`;
  if (existing.some((n) => n.id === id)) {
    return existing.find((n) => n.id === id) ?? null;
  }

  const createdAt =
    typeof item.createdAt === "string" && Number.isFinite(new Date(item.createdAt).getTime())
      ? item.createdAt
      : new Date().toISOString();
  const entry: InboxNotification = {
    id,
    type: item.type,
    title: item.title,
    body: item.body,
    createdAt,
    read: item.read === true,
  };
  await saveInbox([entry, ...existing]);
  return entry;
}

export async function markInboxNotificationRead(id: string): Promise<void> {
  const items = await loadNotificationInbox();
  await saveInbox(items.map((n) => (n.id === id ? { ...n, read: true } : n)));
}

export async function markInboxNotificationsOfTypeRead(type: InboxNotificationType): Promise<void> {
  const items = await loadNotificationInbox();
  await saveInbox(items.map((n) => (n.type === type ? { ...n, read: true } : n)));
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
  emitInboxChanged();
}
