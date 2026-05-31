/** Max cough slots per screening session; matches backend MAX_COUGH_ATTEMPTS / DB unique (session_id, cough_attempt). */
export const IOT_COUGH_COUNT = 3;

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
