export const IOT_COUGH_COUNT = 3;

export type IotStep = {
  id: string;
  label: string;
  duration: number;
};

export const IOT_COUGH_STEPS: IotStep[] = [
  { id: "preparing", label: "Preparing device", duration: 1200 },
  { id: "started", label: "Recording started", duration: 800 },
  { id: "recording", label: "Recording in progress", duration: 3000 },
  { id: "ended", label: "Recording ended", duration: 600 },
  { id: "uploading", label: "Uploading to server", duration: 1500 },
  { id: "success", label: "Upload successful", duration: 0 },
];

export const IOT_COUGH_STATUS_LABELS = IOT_COUGH_STEPS.map((s) => s.label);

export const IOT_SPUTUM_STEPS: IotStep[] = [
  { id: "preparing", label: "Preparing capture", duration: 1000 },
  { id: "capturing", label: "Capturing image", duration: 1500 },
  { id: "processing", label: "Processing image", duration: 1200 },
  { id: "uploading", label: "Uploading to server", duration: 1500 },
  { id: "success", label: "Upload successful", duration: 0 },
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
