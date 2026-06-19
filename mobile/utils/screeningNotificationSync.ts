import { listMyScreenings, type ScreeningHistoryRow } from "../services/backendApi";
import {
  PATIENT_SCREENING_SAVED_NUDGE,
  STAFF_SCREENING_SAVED_NUDGE,
} from "../constants/patientAccess";
import { resolveUserRole } from "../constants/userRole";
import {
  addInboxNotification,
  loadNotificationInbox,
  markInboxNotificationsOfTypeRead,
  shouldSuppressInboxNotification,
} from "./notificationInbox";
import { peekProfile } from "./profileCache";

const SCREENING_NOTIFICATION_LIMIT = 20;

function screeningNotificationCopy(isPatientPortal: boolean): { title: string; body: string } {
  const profile = peekProfile();
  const unverified = profile?.emailVerified !== true;
  if (isPatientPortal) {
    return {
      title: "Result saved",
      body: unverified
        ? PATIENT_SCREENING_SAVED_NUDGE
        : "Your visit result is saved and available in History.",
    };
  }
  return {
    title: "Screening saved",
    body: unverified
      ? STAFF_SCREENING_SAVED_NUDGE
      : "This screening session is saved and available in History.",
  };
}

export async function reconcileScreeningHistoryNotifications(
  screenings: ScreeningHistoryRow[],
  options: {
    isPatientPortal: boolean;
    /** When true, existing screening notifications are marked read (e.g. user opened History). */
    markScreeningsRead?: boolean;
    /** @deprecated Use markScreeningsRead */
    markPatientScreeningsRead?: boolean;
  },
): Promise<void> {
  const markRead = options.markScreeningsRead === true || options.markPatientScreeningsRead === true;
  const existing = await loadNotificationInbox();
  const existingIds = new Set(existing.map((item) => item.id));
  const copy = screeningNotificationCopy(options.isPatientPortal);

  for (const row of screenings) {
    const id = `screening-${row.sessionId}`;
    const awaitingSputum = row.awaitingSputum === true;
    const completedAt = row.completedAt ?? row.startedAt;
    if (!existingIds.has(id)) {
      if (await shouldSuppressInboxNotification(id, completedAt)) {
        existingIds.add(id);
      } else {
        await addInboxNotification({
          id,
          type: "screening_complete",
          title: awaitingSputum
            ? options.isPatientPortal
              ? "Preliminary result saved"
              : "Preliminary screening saved"
            : copy.title,
          body: awaitingSputum
            ? options.isPatientPortal
              ? "Your preliminary result is saved. The sputum smear will be added later and your score may change."
              : "Preliminary result saved — sputum smear pending. Add the smear later from History to finalize."
            : copy.body,
          createdAt: completedAt,
          read: markRead,
        });
        existingIds.add(id);
      }
    }

    // Two-phase: the smear was added later — surface a distinct "updated" entry.
    const updatedId = `screening-updated-${row.sessionId}`;
    if (!awaitingSputum && row.sputumFinalizedAt && !existingIds.has(updatedId)) {
      if (await shouldSuppressInboxNotification(updatedId, row.sputumFinalizedAt)) {
        existingIds.add(updatedId);
      } else {
        await addInboxNotification({
          id: updatedId,
          type: "screening_updated",
          title: options.isPatientPortal ? "Result updated" : "Screening finalized",
          body: options.isPatientPortal
            ? "Your screening result was updated after sputum smear review. Open History to see your latest score."
            : "Sputum smear added — screening finalized. The updated result is in History.",
          createdAt: row.sputumFinalizedAt,
          read: markRead,
        });
        existingIds.add(updatedId);
      }
    }
  }

  if (markRead) {
    await markInboxNotificationsOfTypeRead("screening_complete");
    await markInboxNotificationsOfTypeRead("screening_updated");
  }
}

export async function syncScreeningNotificationsFromServer(): Promise<void> {
  const profile = peekProfile();
  const isPatientPortal = resolveUserRole(profile?.role) === "PATIENT";
  const { screenings } = await listMyScreenings(SCREENING_NOTIFICATION_LIMIT);
  await reconcileScreeningHistoryNotifications(screenings, {
    isPatientPortal,
    markScreeningsRead: false,
  });
}

/** @deprecated Use syncScreeningNotificationsFromServer */
export async function syncPatientScreeningNotificationsFromServer(): Promise<void> {
  await syncScreeningNotificationsFromServer();
}
