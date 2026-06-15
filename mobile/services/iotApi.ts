import { resolveApiBaseUrl } from "../utils/apiBaseUrl";

export type IotHealthResponse = {
  ok: boolean;
  service: string;
  time: string;
};

export type IotHelloResponse = {
  ok: boolean;
  service: string;
  received: string;
  time: string;
};

export type IotCommandType = "image" | "audio" | "audio upload" | "setup check";

export type IotQueueCommandResponse = {
  ok: boolean;
  message: string;
  command: IotCommandType;
  minSeconds?: number;
  maxSeconds?: number;
  queuedAt: string;
};

export type IotSetupCheckStatus = "queued" | "delivered" | "acknowledged" | "expired";

export type IotSetupCheck = {
  checkId: string;
  message: string;
  status: IotSetupCheckStatus;
  queuedAt: string;
  expiresAt: string;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  acknowledgementMessage: string | null;
};

export type IotSetupCheckResponse = {
  ok: boolean;
  check: IotSetupCheck;
};

export type IotSetupCheckOptions = {
  message?: string;
  timeoutMs?: number;
  intervalMs?: number;
  onProgress?: (check: IotSetupCheck) => void;
};

const SETUP_CHECK_TIMEOUT_MS = 20_000;
const SETUP_CHECK_POLL_MS = 700;

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function iotKey(): string | null {
  const key =
    typeof process !== "undefined"
      ? (process.env.EXPO_PUBLIC_IOT_API_KEY as string | undefined)
      : undefined;
  return key?.trim() ? key.trim() : null;
}

function iotHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (json) headers["Content-Type"] = "application/json";
  const key = iotKey();
  if (key) headers["X-IoT-Key"] = key;
  return headers;
}

async function parseIotError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string };
    if (typeof data?.message === "string") return data.message;
  } catch {
    // ignore
  }
  return response.statusText || "Connection failed. Please try again.";
}

/** GET /iot/health — public probe (no IoT key). */
export async function fetchIotHealth(): Promise<IotHealthResponse> {
  const base = resolveApiBaseUrl();
  const response = await fetch(`${base}/iot/health`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(await parseIotError(response));
  }
  return (await response.json()) as IotHealthResponse;
}

/** POST /iot/hello — smoke test with X-IoT-Key. */
export async function postIotHello(payload = "hello"): Promise<IotHelloResponse> {
  if (!iotKey()) {
    throw new Error("Device connection is not configured. Please contact support.");
  }
  const base = resolveApiBaseUrl();
  const response = await fetch(`${base}/iot/hello`, {
    method: "POST",
    headers: {
      ...iotHeaders(),
      "Content-Type": "text/plain",
    },
    body: payload,
  });
  if (!response.ok) {
    throw new Error(await parseIotError(response));
  }
  return (await response.json()) as IotHelloResponse;
}

/** POST /iot/device-command — queue firmware command (backend / device integration). */
export async function queueIotDeviceCommand(
  command: IotCommandType,
): Promise<IotQueueCommandResponse> {
  if (!iotKey()) {
    throw new Error("Device connection is not configured. Please contact support.");
  }
  const base = resolveApiBaseUrl();
  const response = await fetch(`${base}/iot/device-command`, {
    method: "POST",
    headers: iotHeaders(true),
    body: JSON.stringify({ command }),
  });
  if (!response.ok) {
    throw new Error(await parseIotError(response));
  }
  return (await response.json()) as IotQueueCommandResponse;
}

export async function startIotSetupCheck(message?: string): Promise<IotSetupCheckResponse> {
  if (!iotKey()) {
    throw new Error("Device connection is not configured. Please contact support.");
  }
  const base = resolveApiBaseUrl();
  const response = await fetch(`${base}/iot/setup-check`, {
    method: "POST",
    headers: iotHeaders(true),
    body: JSON.stringify({
      message:
        message ??
        "TBhon setup check: print this message on serial, then send setup ack.",
    }),
  });
  if (!response.ok) {
    throw new Error(await parseIotError(response));
  }
  return (await response.json()) as IotSetupCheckResponse;
}

export async function fetchIotSetupCheck(checkId: string): Promise<IotSetupCheckResponse> {
  if (!iotKey()) {
    throw new Error("Device connection is not configured. Please contact support.");
  }
  const base = resolveApiBaseUrl();
  const response = await fetch(`${base}/iot/setup-check/${encodeURIComponent(checkId)}`, {
    method: "GET",
    headers: iotHeaders(),
  });
  if (!response.ok) {
    throw new Error(await parseIotError(response));
  }
  return (await response.json()) as IotSetupCheckResponse;
}

export async function waitForIotSetupAcknowledgement(
  options: IotSetupCheckOptions = {},
): Promise<IotSetupCheck> {
  const started = await startIotSetupCheck(options.message);
  const timeoutMs = options.timeoutMs ?? SETUP_CHECK_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? SETUP_CHECK_POLL_MS;
  const startedAt = Date.now();
  options.onProgress?.(started.check);

  while (Date.now() - startedAt < timeoutMs) {
    const current = await fetchIotSetupCheck(started.check.checkId);
    options.onProgress?.(current.check);
    if (current.check.status === "acknowledged") {
      return current.check;
    }
    if (current.check.status === "expired") {
      break;
    }
    await sleepMs(intervalMs);
  }

  throw new Error(
    "Device did not confirm the setup command. Turn on the IoT device, check Wi-Fi, then try again.",
  );
}
