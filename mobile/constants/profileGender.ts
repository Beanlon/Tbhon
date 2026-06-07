/** Shared gender labels for signup, patient claim, and booth intake. */
export const PROFILE_GENDER_OPTIONS = ["Male", "Female", "Intersex"] as const;
export type ProfileGenderOption = (typeof PROFILE_GENDER_OPTIONS)[number];

/** Map API / legacy values to UI label (accepts historical "other"). */
export function genderLabelFromApi(value: string): ProfileGenderOption {
  const lower = value.trim().toLowerCase();
  if (lower === "female") return "Female";
  if (lower === "intersex" || lower === "other") return "Intersex";
  return "Male";
}
