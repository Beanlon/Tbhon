/** Max cough slots per screening session; matches backend MAX_COUGH_ATTEMPTS / DB unique (session_id, cough_attempt). */
export const IOT_COUGH_COUNT = 3;

/** Staff medical step before device capture. */
export const SPUTUM_STAFF_SMEAR_BANNER = "Staff: prepare smear, then capture on device";

export const SPUTUM_SMEAR_STEP_INSTRUCTION = SPUTUM_STAFF_SMEAR_BANNER;

/** Device capture UI — booth actions only, no staff language. */
export const SPUTUM_DEVICE_CAPTURE_TITLE = "Smear image capture";
export const SPUTUM_DEVICE_CAPTURE_SUBTITLE = "Booth device still image";
export const SPUTUM_DEVICE_EMPTY_HINT = "No image yet. Tap Start capture.";
export const SPUTUM_DEVICE_READY_PREVIEW = "Image ready. Proceed or retake.";
export const SPUTUM_DEVICE_RECEIVED = "Image received from device. Proceed or retake.";
export const SPUTUM_DEVICE_START_BUTTON = "Start capture";
export const SPUTUM_DEVICE_INITIAL_STATUS = "Tap Start capture to queue the booth device.";

export const SPUTUM_SMEAR_REVIEW_LABEL = "Sputum smear";
export const SPUTUM_SMEAR_REVIEW_LABEL_IOT = "Sputum smear (booth device)";

export const SPUTUM_NO_SAMPLE_PILL = "No sample";
export const SPUTUM_NO_SAMPLE_DETAIL =
  "No sample was available — analysis uses cough recordings and checklist only.";

export const SPUTUM_DETAILS_MISSING_LABEL = "No sample available";
export const SPUTUM_DETAILS_MISSING_SUB =
  "Patient did not produce a sample — results use cough audio and checklist only.";

/** Staff must pick a reason before continuing without a smear image. */
export const SPUTUM_SKIP_BUTTON_LABEL = "No sample available — document reason";

export const SPUTUM_SKIP_MODAL_TITLE = "Document no smear";
export const SPUTUM_SKIP_MODAL_MESSAGE =
  "Smear capture is protocol when a sample is available. Select why you are continuing without a smear image.";

export const SPUTUM_SKIP_REASONS = [
  "No sample provided",
  "Sample unsuitable for smear",
  "Patient declined sputum collection",
  "Booth capture unavailable",
] as const;

export type SputumSkipReason = (typeof SPUTUM_SKIP_REASONS)[number];

export function formatSputumMissingDetail(skipReason?: string | null): string {
  const reason = typeof skipReason === "string" ? skipReason.trim() : "";
  if (reason.length > 0) {
    return `Documented: ${reason} — results use cough audio and checklist only.`;
  }
  return SPUTUM_NO_SAMPLE_DETAIL;
}

export function formatSputumDetailsMissingSub(skipReason?: string | null): string {
  const reason = typeof skipReason === "string" ? skipReason.trim() : "";
  if (reason.length > 0) {
    return `Staff documented: ${reason}. Results use cough audio and checklist only.`;
  }
  return SPUTUM_DETAILS_MISSING_SUB;
}

export type IotStep = {
  id: string;
  label: string;
  duration: number;
};

export const IOT_COUGH_STEPS: IotStep[] = [
  { id: "started", label: "Recording started", duration: 800 },
  { id: "recording", label: "Recording in progress", duration: 3000 },
  { id: "ended", label: "Recording ended", duration: 600 },
  { id: "uploading", label: "Uploading to server", duration: 2000 },
];

export const IOT_COUGH_STATUS_LABELS = IOT_COUGH_STEPS.map((s) => s.label);

export const IOT_SPUTUM_STEPS: IotStep[] = [
  { id: "preparing", label: "Preparing capture", duration: 1000 },
  { id: "queueing", label: "Queueing device command", duration: 1200 },
  { id: "waiting", label: "Waiting for device upload", duration: 1500 },
  { id: "downloading", label: "Downloading image", duration: 1200 },
];

export const IOT_SPUTUM_STATUS_LABELS = IOT_SPUTUM_STEPS.map((s) => s.label);

export const IOT_HARDWARE_CHECKS = [
  {
    id: "power",
    title: "Device powered on",
    detail: "Make sure the screening device is switched on and within range (about 10 meters).",
  },
  {
    id: "bluetooth",
    title: "Bluetooth enabled",
    detail: "Turn on Bluetooth on your phone if you use a wireless screening device.",
  },
  {
    id: "health",
    title: "Service connection",
    detail: "Verifies the device can reach TBhon servers over your Wi‑Fi network.",
    actionLabel: "Check connection",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  detail: string;
  actionLabel?: string;
}>;
