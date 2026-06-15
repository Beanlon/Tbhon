import { listMyScreenings, type ScreeningHistoryRow } from "../services/backendApi";
import {
  addInboxNotification,
  loadNotificationInbox,
  markInboxNotificationsOfTypeRead,
} from "./notificationInbox";
import { PATIENT_SCREENING_SAVED_NUDGE } from "../constants/patientAccess";
import { peekProfile } from "./profileCache";

const PATIENT_SCREENING_NOTIFICATION_LIMIT = 20;

function patientScreeningNotificationBody(): string {
  const profile = peekProfile();
  return profile?.emailVerified === true
    ? "Your visit result is saved and available in History."
    : PATIENT_SCREENING_SAVED_NUDGE;
}

export async function reconcileScreeningHistoryNotifications(
  screenings: ScreeningHistoryRow[],
  options: {
    isPatientPortal: boolean;
    markPatientScreeningsRead?: boolean;
  },
): Promise<void> {
  if (!options.isPatientPortal) {
    await markInboxNotificationsOfTypeRead("screening_complete");
    return;
  }

  const existing = await loadNotificationInbox();
  const existingIds = new Set(existing.map((item) => item.id));
  const body = patientScreeningNotificationBody();

  for (const row of screenings) {
    const id = `screening-${row.sessionId}`;
    if (existingIds.has(id)) continue;
    await addInboxNotification({
      id,
      type: "screening_complete",
      title: "Result saved",
      body,
      createdAt: row.completedAt ?? row.startedAt,
      read: options.markPatientScreeningsRead === true,
    });
    existingIds.add(id);
  }

  if (options.markPatientScreeningsRead === true) {
    await markInboxNotificationsOfTypeRead("screening_complete");
  }
}

export async function syncPatientScreeningNotificationsFromServer(): Promise<void> {
  const { screenings } = await listMyScreenings(PATIENT_SCREENING_NOTIFICATION_LIMIT);
  await reconcileScreeningHistoryNotifications(screenings, {
    isPatientPortal: true,
    markPatientScreeningsRead: false,
  });
}
