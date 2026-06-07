import type { ScreeningClientRecord } from "../services/backendApi";
import { ageFromIsoBirthdate } from "./profileDisplay";

export const GOVERNMENT_ID_LABELS: Record<string, string> = {
  national_id: "National ID",
  passport: "Passport",
  drivers_license: "Driver's license",
  other: "Other ID",
};

export function formatClientFullName(
  client: Pick<ScreeningClientRecord, "firstName" | "middleName" | "lastName"> | null | undefined,
): string {
  if (!client) return "Name not recorded";
  const name = [client.firstName, client.middleName, client.lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join(" ");
  return name.length > 0 ? name : "Name not recorded";
}

export function formatClientAddress(
  client: Pick<ScreeningClientRecord, "street" | "barangay" | "city"> | null | undefined,
): string | null {
  if (!client) return null;
  const parts = [client.street, client.barangay, client.city]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function formatGovernmentId(client: ScreeningClientRecord | null | undefined): string | null {
  if (!client) return null;
  const number = client.governmentIdNumber?.trim();
  if (!number) return null;
  const type = client.governmentIdType?.trim();
  const label = type ? (GOVERNMENT_ID_LABELS[type] ?? type) : "ID";
  return `${label}: ${number}`;
}

export function formatClientSubtitle(client: ScreeningClientRecord | null | undefined): string {
  if (!client) return "No details on file";
  const age = ageFromIsoBirthdate(client.birthdate);
  const agePart = age !== null ? `${age} yrs` : "Age —";
  const gender = client.gender?.trim() ? client.gender : "—";
  const city = client.city?.trim();
  return city ? `${agePart} · ${gender} · ${city}` : `${agePart} · ${gender}`;
}

export type ClientHistoryMeta = {
  demographics: string;
  address: string;
  contactNumber: string;
};

/** Compact patient facts for history list cards. */
export function formatClientHistoryMeta(
  client: ScreeningClientRecord | null | undefined,
): ClientHistoryMeta | null {
  if (!client) return null;
  const age = ageFromIsoBirthdate(client.birthdate);
  const agePart = age !== null ? `${age} yrs` : "Age —";
  const gender = client.gender?.trim() ? client.gender : "—";
  return {
    demographics: `${agePart} · ${gender}`,
    address: formatClientAddress(client) ?? "Address not provided",
    contactNumber: client.contactNumber?.trim() || "Contact not recorded",
  };
}

export type ClientDetailRow = { label: string; value: string };

export function buildClientDetailRows(client: ScreeningClientRecord | null | undefined): ClientDetailRow[] {
  if (!client) return [];

  const rows: ClientDetailRow[] = [];
  const age = ageFromIsoBirthdate(client.birthdate);
  const dobLabel =
    client.birthdate?.trim() && age !== null
      ? `${client.birthdate} (${age} yrs)`
      : client.birthdate?.trim() || "—";
  rows.push({ label: "Date of birth", value: dobLabel });
  rows.push({ label: "Sex", value: client.gender?.trim() || "—" });

  const address = formatClientAddress(client);
  if (address) rows.push({ label: "Current address", value: address });

  if (client.contactNumber?.trim()) {
    rows.push({ label: "Contact number", value: client.contactNumber.trim() });
  }

  const ecName = client.emergencyContactName?.trim();
  const ecRelation = client.emergencyContactRelation?.trim();
  const ecPhone = client.emergencyContactPhone?.trim();
  if (ecName || ecRelation || ecPhone) {
    const namePart = [ecName, ecRelation].filter(Boolean).join(" · ");
    const value = [namePart, ecPhone].filter(Boolean).join(" · ");
    rows.push({ label: "Emergency contact", value });
  }

  const govId = formatGovernmentId(client);
  if (govId) rows.push({ label: "Government ID", value: govId });

  return rows;
}
