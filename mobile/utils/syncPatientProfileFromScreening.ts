import {
  getMe,
  listMyScreenings,
  patchMe,
  putMyProfile,
  type ApiUserPayload,
} from "../services/backendApi";
import { isProfileIdentityComplete } from "./profileDisplay";

/** Copy booth intake from the patient's linked screening into their account profile. */
export async function trySyncPatientProfileFromScreening(
  user: ApiUserPayload,
): Promise<ApiUserPayload | null> {
  if (user.role !== "PATIENT" || isProfileIdentityComplete(user)) {
    return null;
  }

  try {
    const { screenings } = await listMyScreenings(10);
    const client = screenings.find((row) => row.client?.firstName?.trim())?.client;
    if (!client) return null;

    await putMyProfile({
      firstName: client.firstName,
      lastName: client.lastName,
      birthdate: client.birthdate,
      gender: client.gender,
      street: client.street,
      barangay: client.barangay,
      city: client.city,
    });

    if (!user.phoneNumber?.trim() && client.contactNumber?.trim()) {
      await patchMe({ phoneNumber: client.contactNumber.trim() });
    }

    const { user: refreshed } = await getMe();
    return refreshed;
  } catch {
    return null;
  }
}

export async function refreshPatientProfileIfNeeded(user: ApiUserPayload): Promise<ApiUserPayload> {
  const synced = await trySyncPatientProfileFromScreening(user);
  return synced ?? user;
}
