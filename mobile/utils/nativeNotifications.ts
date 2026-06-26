import Constants from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

export type NotificationResponsePayload = {
  notification: {
    request: {
      identifier?: string;
      content: {
        title?: string;
        body?: string;
        data?: Record<string, unknown>;
      };
    };
  };
};

let notificationsModule: Promise<NotificationsModule | null> | null = null;

/** Local/scheduled notifications are unavailable in Expo Go (SDK 53+). In-app inbox still works. */
export function isNativeNotificationsAvailable(): boolean {
  return Constants.appOwnership !== "expo";
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!isNativeNotificationsAvailable()) return null;
  if (!notificationsModule) {
    notificationsModule = import("expo-notifications").catch(() => null);
  }
  return notificationsModule;
}

let handlerConfigured = false;

export async function configureNativeNotificationPresentation(): Promise<void> {
  if (handlerConfigured) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
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

export async function ensureNativeNotificationPermission(): Promise<boolean> {
  await configureNativeNotificationPresentation();
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("tbhon-unverified-engagement", {
      name: "Account & screening reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleNativeNotification(args: {
  identifier: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  seconds?: number | null;
  channelId?: string;
}): Promise<boolean> {
  const granted = await ensureNativeNotificationPermission();
  if (!granted) return false;

  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (scheduled.some((n) => n.identifier === args.identifier)) {
    await Notifications.cancelScheduledNotificationAsync(args.identifier);
  }

  await Notifications.scheduleNotificationAsync({
    identifier: args.identifier,
    content: {
      title: args.title,
      body: args.body,
      data: args.data,
      sound: true,
      ...(Platform.OS === "android" && args.channelId ? { channelId: args.channelId } : {}),
    },
    trigger:
      args.seconds == null
        ? null
        : {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: Math.max(60, args.seconds),
          },
  });
  return true;
}

export async function cancelNativeNotificationsWithPrefix(prefix: string): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export async function hasNativeNotificationScheduled(id: string): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((n) => n.identifier === id);
}

export async function setNativeAppBadgeCount(count: number): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await Notifications.setBadgeCountAsync(count).catch(() => {});
}

export async function incrementNativeAppBadge(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const count = await Notifications.getBadgeCountAsync();
  await Notifications.setBadgeCountAsync(count + 1).catch(() => {});
}

export type NativeNotificationContent = {
  identifier: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function getPresentedNativeNotifications(): Promise<NativeNotificationContent[]> {
  const Notifications = await loadNotifications();
  if (!Notifications) return [];

  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    return presented.map((entry) => ({
      identifier: entry.request.identifier,
      title: entry.request.content.title ?? "",
      body: entry.request.content.body ?? "",
      data: entry.request.content.data as Record<string, unknown> | undefined,
    }));
  } catch {
    return [];
  }
}

export function subscribeToNativeNotificationsReceived(
  handler: (notification: NativeNotificationContent) => void,
): { remove: () => void } {
  if (!isNativeNotificationsAvailable()) {
    return { remove: () => {} };
  }

  let subscription: { remove: () => void } | null = null;
  let cancelled = false;

  void (async () => {
    const Notifications = await loadNotifications();
    if (!Notifications || cancelled) return;

    subscription = Notifications.addNotificationReceivedListener((notification) => {
      handler({
        identifier: notification.request.identifier,
        title: notification.request.content.title ?? "",
        body: notification.request.content.body ?? "",
        data: notification.request.content.data as Record<string, unknown> | undefined,
      });
    });
  })();

  return {
    remove: () => {
      cancelled = true;
      subscription?.remove();
    },
  };
}

export function subscribeToNotificationResponses(
  handler: (response: NotificationResponsePayload) => void,
): { remove: () => void } {
  if (!isNativeNotificationsAvailable()) {
    return { remove: () => {} };
  }

  let subscription: { remove: () => void } | null = null;
  let cancelled = false;

  void (async () => {
    const Notifications = await loadNotifications();
    if (!Notifications || cancelled) return;

    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handler(response as NotificationResponsePayload);
    });

    const last = await Notifications.getLastNotificationResponseAsync();
    if (last && !cancelled) {
      handler(last as NotificationResponsePayload);
    }
  })();

  return {
    remove: () => {
      cancelled = true;
      subscription?.remove();
    },
  };
}
