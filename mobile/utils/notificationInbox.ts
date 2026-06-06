import AsyncStorage from "@react-native-async-storage/async-storage";

export type InboxNotificationType = "screening_complete" | "verify_email" | "learn_tb";

export type InboxNotification = {
  id: string;
  type: InboxNotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};

const INBOX_KEY = "@tbhon/notification-inbox";
const MAX_ITEMS = 50;

export async function loadNotificationInbox(): Promise<InboxNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(INBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isInboxItem);
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
    typeof v.read === "boolean"
  );
}

async function saveInbox(items: InboxNotification[]): Promise<void> {
  await AsyncStorage.setItem(INBOX_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export async function addInboxNotification(
  item: Omit<InboxNotification, "id" | "createdAt" | "read"> & { id?: string },
): Promise<InboxNotification> {
  const entry: InboxNotification = {
    id: item.id ?? `${item.type}-${Date.now()}`,
    type: item.type,
    title: item.title,
    body: item.body,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const existing = await loadNotificationInbox();
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
