import * as FileSystem from "expo-file-system/legacy";
import { IOT_COUGH_COUNT } from "../constants/iotScreening";
import { resolveApiBaseUrl } from "../utils/apiBaseUrl";
import { getAuthToken } from "../utils/authStorage";

const cacheDirectory = FileSystem.cacheDirectory ?? "";

const API_REQUEST_TIMEOUT_MS = 30000;
/** IoT session polling over mobile data / Cloudflare tunnels needs more time. */
const IOT_SESSION_FETCH_TIMEOUT_MS = 60_000;
const IOT_COMMAND_TIMEOUT_MS = 45_000;
const RAW_UPLOAD_TIMEOUT_MS = 45000;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    e.name === "AbortError" ||
    msg.includes("aborted") ||
    msg.includes("timed out") ||
    msg.includes("network request failed") ||
    msg.includes("failed to fetch")
  );
}

export type ApiUserPayload = {
  userId: string;
  email: string | null;
  phoneNumber: string | null;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  profile?: {
    profileId: string;
    userId: string;
    firstName: string;
    lastName: string;
    birthdate: string;
    gender: string;
    street: string | null;
    barangay: string | null;
    city: string | null;
    /** ISO-style or display code (e.g. PH, US, KOR); optional until backend persists it */
    countryCode?: string | null;
  } | null;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type JsonBody = Record<string, unknown>;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Please check your connection.")), timeoutMs),
    ),
  ]);
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as unknown;
    if (typeof data === "object" && data !== null && "message" in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
  } catch {
    // ignore
  }
  return response.statusText || "Something went wrong. Please try again.";
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { json?: JsonBody; timeoutMs?: number } = {},
  token?: string | null,
): Promise<T> {
  // TODO(Backend+Mobile, production auth hardening):
  // Current app session behavior is token-based and client-persisted.
  // For deployed environments, align on short-lived access tokens + refresh-token rotation,
  // explicit session revocation, and 401 refresh/retry contract for this request layer.
  const base = resolveApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(options.json !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(((options.headers as Record<string, string>) ?? {}) as HeadersInit),
  };
  let authHeader = token;
  if (authHeader === undefined) {
    authHeader = await getAuthToken();
  }
  if (authHeader) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${authHeader}`;
  }
  const { json: bodyJson, timeoutMs, ...rest } = options;
  const requestTimeoutMs = timeoutMs ?? API_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      signal: controller.signal,
      body: bodyJson !== undefined ? JSON.stringify(bodyJson) : rest.body,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Request timed out. Please check your connection.");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export type LoginRegisterResponse = {
  token: string;
  user: ApiUserPayload;
};

export async function postLogin(email: string, password: string) {
  return apiRequest<LoginRegisterResponse>(
    "/auth/login",
    { method: "POST", json: { email: email.trim(), password } },
    null,
  );
}

export type RegisterProfile = {
  firstName: string;
  lastName: string;
  birthdate: string;
  gender: string;
  street?: string | null;
  barangay?: string | null;
  city?: string | null;
  countryCode?: string | null;
};

export async function postRegister(args: {
  email: string;
  password: string;
  phoneNumber?: string | null;
  profile: RegisterProfile;
}) {
  return apiRequest<LoginRegisterResponse>(
    "/auth/register",
    {
      method: "POST",
      json: {
        email: args.email.trim(),
        password: args.password,
        phoneNumber: args.phoneNumber ?? null,
        profile: args.profile,
      },
    },
    null,
  );
}

export async function getMe() {
  return apiRequest<{ user: ApiUserPayload }>("/users/me", { method: "GET" });
}

export async function postSendEmailVerification() {
  return apiRequest<{
    ok: boolean;
    message: string;
    emailVerified: boolean;
    expiresAt?: string;
    ttlMinutes?: number;
  }>("/auth/email/send-verification", { method: "POST" });
}

export async function postVerifyEmail(code: string) {
  return apiRequest<{
    ok: boolean;
    message: string;
    emailVerified: boolean;
    emailVerifiedAt?: string;
  }>("/auth/email/verify", { method: "POST", json: { code: code.replace(/\D/g, "") } });
}

export type IotCaptureCommand = "image" | "audio";

export type RequestIotCaptureResponse = {
  ok: boolean;
  message: string;
  command: IotCaptureCommand;
  minSeconds: number | null;
  maxSeconds: number | null;
  queuedAt: string;
  sessionId: string | null;
};

/** Open a screening session before IoT sample capture (same sessionId for retakes). */
export async function createScreeningDraft() {
  return apiRequest<{ ok: boolean; sessionId: string }>("/screenings/draft", { method: "POST" });
}

/** Local UUID when POST /screenings/draft is not on the server yet (IoT upload still creates the row). */
export function createLocalScreeningSessionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.floor(Math.random() * 16) % 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Prefer server draft; fall back to a client id so the button is never blocked by 404 draft. */
export async function ensureScreeningSessionId(existing?: string | null): Promise<string> {
  const trimmed = existing?.trim();
  if (trimmed) return trimmed;
  try {
    const { sessionId } = await createScreeningDraft();
    return sessionId;
  } catch {
    return createLocalScreeningSessionId();
  }
}

export type IotDeviceCommandResult = {
  ok: boolean;
  message: string;
  command: string;
  userId: string | null;
  sessionId: string | null;
  coughAttempt: number | null;
};

/**
 * Queue a firmware command — same HTTP call as terminal:
 * POST /iot/device-command  { command, userId, sessionId, coughAttempt? }  +  X-IoT-Key
 */
function clampCoughAttempt(attempt: number): number {
  const n = Math.floor(attempt);
  if (n < 1) return 1;
  if (n > IOT_COUGH_COUNT) return IOT_COUGH_COUNT;
  return n;
}

export async function queueIotDeviceCommand(args: {
  command: "image" | "audio" | "stop audio" | "audio upload";
  userId: string;
  sessionId: string;
  /** Which cough slot (1-based, 1–3) this audio command is for. Retakes reuse the same slot. */
  coughAttempt?: number;
}): Promise<IotDeviceCommandResult> {
  const key =
    typeof process !== "undefined"
      ? (process.env.EXPO_PUBLIC_IOT_API_KEY as string | undefined)
      : undefined;
  if (!key?.trim()) {
    throw new Error(
      "Missing EXPO_PUBLIC_IOT_API_KEY in mobile/.env (use the same value as IOT_API_KEY on the backend).",
    );
  }

  const base = resolveApiBaseUrl();
  const url = `${base}/iot/device-command`;
  console.log(`[IoT] POST ${url} command=${args.command} session=${args.sessionId.slice(0, 8)}…`);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IOT_COMMAND_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-IoT-Key": key.trim(),
        },
        body: JSON.stringify({
          command: args.command,
          userId: args.userId.trim(),
          sessionId: args.sessionId.trim(),
          ...(args.coughAttempt != null
            ? { coughAttempt: clampCoughAttempt(args.coughAttempt) }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = new ApiError(response.status, await parseErrorMessage(response));
        const retryable =
          (err.status === 409 || err.status === 503 || err.status === 429) && attempt < 2;
        if (retryable) {
          console.log(`[IoT] Device busy (${err.status}), retry ${attempt + 1}/2…`);
          lastError = err;
          await sleepMs(900 * (attempt + 1));
          continue;
        }
        throw err;
      }

      const text = await response.text();
      if (!text) {
        return {
          ok: true,
          message: `Queued '${args.command}' command for device`,
          command: args.command,
          userId: args.userId,
          sessionId: args.sessionId,
          coughAttempt: args.coughAttempt ?? null,
        };
      }
      return JSON.parse(text) as IotDeviceCommandResult;
    } catch (e) {
      lastError = e;
      const retryable = isRetryableNetworkError(e) && attempt < 2;
      if (retryable) {
        console.log(
          `[IoT] Command failed (${e instanceof Error ? e.message : String(e)}), retry ${attempt + 1}/2…`,
        );
        await sleepMs(900 * (attempt + 1));
        continue;
      }
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("Device command timed out. Check your connection and try again.");
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Device command failed. Please try again.");
}

/** Queue `image` on the device (sputum still photo). */
export async function queueIotDeviceImageCommand(args: {
  userId: string;
  sessionId: string;
}): Promise<IotDeviceCommandResult> {
  return queueIotDeviceCommand({ command: "image", ...args });
}

/** Queue `audio` on the device (start bench recording). */
export async function queueIotDeviceAudioStartCommand(args: {
  userId: string;
  sessionId: string;
  /** Which cough slot (1-based) this recording is for (e.g. 1, 2, or 3). */
  coughAttempt: number;
}): Promise<IotDeviceCommandResult> {
  return queueIotDeviceCommand({ command: "audio", ...args });
}

/** Queue stop/upload — ends recording and triggers device upload. */
export async function queueIotDeviceStopAudioCommand(args: {
  userId: string;
  sessionId: string;
  /** Same 1-based slot as the matching `audio` start command. */
  coughAttempt?: number;
}): Promise<IotDeviceCommandResult> {
  return queueIotDeviceCommand({ command: "audio upload", ...args });
}

export type IotHardwareState = "offline" | "idle" | "recording" | "uploading";

export type IotDeviceStatus = {
  ok: boolean;
  online: boolean;
  ready: boolean;
  state: IotHardwareState;
  lastSeenAt: string | null;
  pendingCommand: {
    command: string;
    queuedAt: string;
    sessionId: string | null;
    coughAttempt: number | null;
  } | null;
  activeAudioCapture: {
    elapsedSeconds: number | null;
    minSeconds: number;
  } | null;
};

export type WaitForIotDeviceOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  onProgress?: (elapsedMs: number, status: IotDeviceStatus) => void;
};

const IOT_STATUS_POLL_MS = 350;
const IOT_DEVICE_READY_TIMEOUT_MS = 20_000;
const IOT_DEVICE_RECORDING_TIMEOUT_MS = 25_000;
const IOT_DEVICE_UPLOADING_TIMEOUT_MS = 90_000;
const IOT_DEVICE_IDLE_TIMEOUT_MS = 120_000;

async function fetchIotDeviceStatusWithJwt(): Promise<IotDeviceStatus> {
  return apiRequest<IotDeviceStatus>("/screenings/iot/device-status", { method: "GET" });
}

async function fetchIotDeviceStatusWithIotKey(): Promise<IotDeviceStatus> {
  const key =
    typeof process !== "undefined"
      ? (process.env.EXPO_PUBLIC_IOT_API_KEY as string | undefined)
      : undefined;
  if (!key?.trim()) {
    throw new Error(
      "Missing EXPO_PUBLIC_IOT_API_KEY in mobile/.env (use the same value as IOT_API_KEY on the backend).",
    );
  }
  const base = resolveApiBaseUrl();
  const response = await fetch(`${base}/iot/device-status`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-IoT-Key": key.trim(),
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return (await response.json()) as IotDeviceStatus;
}

/** Poll backend mirror of ESP32 presence (JWT preferred, IoT key fallback). */
export async function fetchIotDeviceStatus(): Promise<IotDeviceStatus> {
  const token = await getAuthToken();
  if (token) {
    try {
      return await fetchIotDeviceStatusWithJwt();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
    }
  }
  return fetchIotDeviceStatusWithIotKey();
}

async function pollIotDeviceStatusUntil(
  label: string,
  predicate: (status: IotDeviceStatus) => boolean,
  options: WaitForIotDeviceOptions = {},
): Promise<IotDeviceStatus> {
  const timeoutMs = options.timeoutMs ?? IOT_DEVICE_READY_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? IOT_STATUS_POLL_MS;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (options.signal?.aborted) {
      throw new Error("Device wait cancelled");
    }
    const status = await fetchIotDeviceStatus();
    options.onProgress?.(Date.now() - started, status);
    if (predicate(status)) {
      return status;
    }
    await sleepMs(intervalMs);
  }

  throw new Error(
    `Timed out waiting for device: ${label}. Check that the screening device is on Wi‑Fi and polling the server.`,
  );
}

/** Device online, idle, no queued command — safe to queue a new `audio` start. */
export async function waitForIotDeviceReady(
  options: WaitForIotDeviceOptions = {},
): Promise<IotDeviceStatus> {
  return pollIotDeviceStatusUntil(
    "ready",
    (s) => s.online && s.ready && s.state === "idle",
    { timeoutMs: options.timeoutMs ?? IOT_DEVICE_READY_TIMEOUT_MS, ...options },
  );
}

/** After POST `audio`, wait until firmware reports `recording` (bench actually started). */
export async function waitForIotDeviceRecording(
  options: WaitForIotDeviceOptions = {},
): Promise<IotDeviceStatus> {
  return pollIotDeviceStatusUntil(
    "recording",
    (s) => s.state === "recording",
    { timeoutMs: options.timeoutMs ?? IOT_DEVICE_RECORDING_TIMEOUT_MS, ...options },
  );
}

/** After POST stop / `audio upload`, wait until bench is sending the WAV. */
export async function waitForIotDeviceUploading(
  options: WaitForIotDeviceOptions = {},
): Promise<IotDeviceStatus> {
  return pollIotDeviceStatusUntil(
    "uploading",
    (s) => s.state === "uploading",
    { timeoutMs: options.timeoutMs ?? IOT_DEVICE_UPLOADING_TIMEOUT_MS, ...options },
  );
}

/** Wait until the server sees at least `minSeconds` of device capture (for stop). */
export async function waitForDeviceMinRecordSeconds(
  minSeconds: number,
  options: WaitForIotDeviceOptions = {},
): Promise<IotDeviceStatus> {
  return pollIotDeviceStatusUntil(
    `at least ${minSeconds}s recorded on device`,
    (s) => (s.activeAudioCapture?.elapsedSeconds ?? 0) >= minSeconds,
    { timeoutMs: options.timeoutMs ?? 15_000, ...options },
  );
}

/** After stop/upload — wait until device is idle again (upload finished on bench). */
export async function waitForIotDeviceIdle(
  options: WaitForIotDeviceOptions = {},
): Promise<IotDeviceStatus> {
  return pollIotDeviceStatusUntil(
    "idle after upload",
    (s) => s.online && s.state === "idle" && !s.pendingCommand,
    { timeoutMs: options.timeoutMs ?? IOT_DEVICE_IDLE_TIMEOUT_MS, ...options },
  );
}

/** @deprecated Use {@link waitForIotDeviceRecording} after queueing `audio`. */
export async function waitForIotDeviceAudioReady(
  args: WaitForIotDeviceOptions = {},
): Promise<void> {
  await waitForIotDeviceRecording(args);
}

/** Queue ESP32 capture via JWT when deployed; otherwise use {@link queueIotDeviceImageCommand}. */
export async function requestIotCapture(args: {
  command: IotCaptureCommand;
  sessionId?: string;
}) {
  try {
    return await apiRequest<RequestIotCaptureResponse>("/screenings/iot/request-capture", {
      method: "POST",
      json: {
        command: args.command,
        ...(args.sessionId ? { sessionId: args.sessionId } : {}),
      },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && args.sessionId) {
      const { user } = await getMe();
      if (args.command === "image") {
        const direct = await queueIotDeviceImageCommand({
          userId: user.userId,
          sessionId: args.sessionId,
        });
        return {
          ok: direct.ok,
          message: direct.message,
          command: "image" as IotCaptureCommand,
          minSeconds: null,
          maxSeconds: null,
          queuedAt: new Date().toISOString(),
          sessionId: args.sessionId ?? null,
        };
      }
      if (args.command === "audio") {
        const direct = await queueIotDeviceAudioStartCommand({
          userId: user.userId,
          sessionId: args.sessionId,
          coughAttempt: 1,
        });
        return {
          ok: direct.ok,
          message: direct.message,
          command: "audio" as IotCaptureCommand,
          minSeconds: 3,
          maxSeconds: 10,
          queuedAt: new Date().toISOString(),
          sessionId: args.sessionId ?? null,
        };
      }
    }
    throw e;
  }
}

/** True when this session already has sputum bytes on the server (IoT or prior upload). */
export async function sessionHasStoredSputumBytes(sessionId: string): Promise<boolean> {
  const preview = await fetchSessionSputumPreview(sessionId);
  return Boolean(preview && preview.byteSize > 0);
}

/** Latest IoT/mobile sputum preview for a draft session (null if not uploaded yet). */
export async function fetchSessionSputumPreview(sessionId: string) {
  try {
    const { session } = await getScreening(sessionId);
    const img = session.sputumImage;
    if (session.sessionId !== sessionId) return null;
    if (!img?.hasRawData) return null;
    if (typeof img.sessionId === "string" && img.sessionId.length > 0 && img.sessionId !== sessionId) {
      return null;
    }
    return {
      sessionId,
      imageId: img.imageId ?? "",
      byteSize: img.byteSize ?? 0,
      source: img.source ?? null,
      capturedAt: typeof img.capturedAt === "string" ? img.capturedAt : null,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Poll until the IoT sputum row for this session has image bytes. */
export async function waitForSessionSputumImage(args: {
  sessionId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{ sessionId: string; imageId: string }> {
  const timeoutMs = args.timeoutMs ?? 120_000;
  const intervalMs = args.intervalMs ?? 2500;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const { session } = await getScreening(args.sessionId);
    const img = session.sputumImage;
    const rowSessionId = typeof img?.sessionId === "string" ? img.sessionId : session.sessionId;
    if (
      session.sessionId === args.sessionId &&
      img?.hasRawData &&
      rowSessionId === args.sessionId
    ) {
      return { sessionId: args.sessionId, imageId: img.imageId ?? "" };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for device photo");
}

/** Bearer headers for streaming /screenings/.../sputum-image/file in Image. */
export async function getAuthMediaHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) throw new ApiError(401, "Not signed in");
  return { Authorization: `Bearer ${token}` };
}

/** True when a media URL targets this screening session (not another session's file). */
export function mediaUrlMatchesSession(url: string, sessionId: string): boolean {
  const sid = sessionId.trim();
  if (!sid) return false;
  const encoded = encodeURIComponent(sid);
  return (
    url.includes(`/screenings/${encoded}/`) ||
    url.includes(`/screenings/${sid}/`)
  );
}

/** Authenticated URL for sputum bytes for exactly this sessionId (null if not on server). */
export function buildServerSputumImageUrl(
  sessionId: string,
  sputum:
    | {
        hasRawData?: boolean;
        sessionId?: string | null;
        byteSize?: number | null;
        capturedAt?: string | null;
      }
    | null
    | undefined,
): string | null {
  const sid = sessionId.trim();
  if (!sid || !sputum?.hasRawData) return null;
  if (
    typeof sputum.sessionId === "string" &&
    sputum.sessionId.length > 0 &&
    sputum.sessionId !== sid
  ) {
    return null;
  }
  const base = resolveMediaUrl(`/screenings/${encodeURIComponent(sid)}/sputum-image/file`);
  if (!base) return null;
  const v =
    typeof sputum.byteSize === "number" && sputum.byteSize > 0
      ? String(sputum.byteSize)
      : typeof sputum.capturedAt === "string" && sputum.capturedAt.length > 0
        ? sputum.capturedAt
        : "0";
  const q = new URLSearchParams({ sid, v });
  return `${base}?${q.toString()}`;
}

/** Download server sputum bytes to a local file for ML upload / review navigation. */
export async function downloadSessionSputumToCache(sessionId: string): Promise<string> {
  const token = await getAuthToken();
  if (!token) throw new ApiError(401, "Not signed in");
  const url = resolveMediaUrl(`/screenings/${encodeURIComponent(sessionId)}/sputum-image/file`);
  if (!url) throw new Error("Missing sputum file URL");
  const dest = `${cacheDirectory}iot_sputum_${sessionId}_${Date.now()}.jpg`;
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(result.status, `Failed to download device photo (HTTP ${result.status})`);
  }
  return result.uri;
}

export type SessionCoughRecordingPreview = {
  sessionId: string;
  recordingId: string;
  byteSize: number;
  mimeType: string | null;
  source: string | null;
  /** Which cough slot (1-based) this recording belongs to. Null for legacy rows. */
  coughAttempt: number | null;
  /** When the recording was last updated (for detecting retakes with same byteSize). */
  recordedAt: string | null;
};

export function coughRecordingFingerprint(preview: SessionCoughRecordingPreview): string {
  // Include recordedAt to detect retakes even when byteSize is identical
  return `${preview.recordingId}|${preview.byteSize}|${preview.recordedAt ?? ""}`;
}

export type FetchSessionCoughOptions = {
  /** Per-attempt timeout (default 60s for slow mobile uploads). */
  timeoutMs?: number;
  /** Extra attempts after the first failure (default 2). */
  retries?: number;
};

/** IoT cough rows with raw bytes for a draft session. */
export async function fetchSessionCoughRecordings(
  sessionId: string,
  options: FetchSessionCoughOptions = {},
): Promise<SessionCoughRecordingPreview[]> {
  const timeoutMs = options.timeoutMs ?? IOT_SESSION_FETCH_TIMEOUT_MS;
  const retries = options.retries ?? 2;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const { session } = await getScreening(sessionId, timeoutMs);
      if (session.sessionId !== sessionId) return [];
      return session.coughRecordings
        .filter(
          (r): r is typeof r & { recordingId: string } =>
            Boolean(r.hasRawData) &&
            typeof r.recordingId === "string" &&
            r.recordingId.length > 0 &&
            (r.byteSize ?? 0) > 0,
        )
        .map((r) => ({
          sessionId,
          recordingId: r.recordingId,
          byteSize: r.byteSize ?? 0,
          mimeType: r.mimeType ?? null,
          source: r.source ?? null,
          coughAttempt: (r.coughAttempt as number | null | undefined) ?? null,
          recordedAt: (r.recordedAt as string | null | undefined) ?? null,
        }));
    } catch (e) {
      lastError = e;
      if (e instanceof ApiError && e.status === 404) return [];
      if (attempt < retries && isRetryableNetworkError(e)) {
        console.log(
          `[IoT] Session fetch failed (attempt ${attempt + 1}/${retries + 1}): ${e instanceof Error ? e.message : String(e)}`,
        );
        await sleepMs(800 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to load session recordings");
}

export type PollCoughRecordingOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  onProgress?: (elapsedMs: number, attempt: number) => void;
  signal?: AbortSignal;
  /**
   * When provided, the poll will match the row whose coughAttempt equals this
   * value (primary) or fall back to any new fingerprint (for legacy firmware
   * that doesn't send coughAttempt). 1-based slot number.
   */
  coughAttempt?: number;
};

/** Poll until a new cough recording appears (retake-safe via fingerprint baseline). */
export async function pollForNewCoughRecording(
  sessionId: string,
  baselineFingerprints: Set<string>,
  timeoutMsOrOptions: number | PollCoughRecordingOptions = 120_000,
  intervalMsLegacy = 2500,
): Promise<SessionCoughRecordingPreview> {
  const options: PollCoughRecordingOptions =
    typeof timeoutMsOrOptions === "number"
      ? { timeoutMs: timeoutMsOrOptions, intervalMs: intervalMsLegacy }
      : timeoutMsOrOptions;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2500;
  const started = Date.now();
  let pollAttempt = 0;

  while (Date.now() - started < timeoutMs) {
    if (options.signal?.aborted) {
      throw new Error("Upload wait cancelled");
    }
    pollAttempt += 1;
    options.onProgress?.(Date.now() - started, pollAttempt);

    const rows = await fetchSessionCoughRecordings(sessionId, {
      timeoutMs: 25_000,
      retries: 1,
    });

    // Primary: prefer the row whose coughAttempt matches the slot we're waiting on.
    if (options.coughAttempt != null) {
      const bySlot = rows.find((r) => r.coughAttempt === options.coughAttempt);
      if (bySlot) {
        const fp = coughRecordingFingerprint(bySlot);
        if (!baselineFingerprints.has(fp)) return bySlot;
      }
    }

    // Fallback: accept any new fingerprint not in the baseline. The per-slot baseline
    // (refreshUploadBaseline) already includes every existing server recording, so the
    // only "new" row is the genuine upload for the current slot. This runs unconditionally
    // so a firmware that tags a mismatched/missing coughAttempt can never hide an upload.
    for (const row of rows) {
      const fp = coughRecordingFingerprint(row);
      if (!baselineFingerprints.has(fp)) return row;
    }

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, intervalMs);
      if (options.signal) {
        const onAbort = () => {
          clearTimeout(t);
          reject(new Error("Upload wait cancelled"));
        };
        if (options.signal.aborted) {
          clearTimeout(t);
          reject(new Error("Upload wait cancelled"));
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }
  throw new Error("Timed out waiting for device audio");
}

function coughFileExtension(mimeType: string | null | undefined): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("mp4") || mime.includes("m4a")) return ".m4a";
  if (mime.includes("3gp")) return ".3gp";
  if (mime.includes("caf")) return ".caf";
  if (mime.includes("ogg")) return ".ogg";
  return ".wav";
}

/** Download server cough bytes for in-app playback. */
export async function downloadSessionCoughToCache(
  sessionId: string,
  recordingId: string,
  mimeType?: string | null,
): Promise<string> {
  const token = await getAuthToken();
  if (!token) throw new ApiError(401, "Not signed in");
  const url = resolveMediaUrl(
    `/screenings/${encodeURIComponent(sessionId)}/cough-recordings/${encodeURIComponent(recordingId)}/file`,
  );
  if (!url) throw new Error("Missing cough file URL");
  const ext = coughFileExtension(mimeType);
  const dest = `${cacheDirectory}iot_cough_${sessionId}_${recordingId}_${Date.now()}${ext}`;
  const downloadTask = FileSystem.downloadAsync(url, dest, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const timeoutTask = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Audio download timed out")), 45_000),
  );
  const result = await Promise.race([downloadTask, timeoutTask]);
  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(result.status, `Failed to download device audio (HTTP ${result.status})`);
  }
  return result.uri;
}

export type UpdateMePayload = {
  email?: string | null;
  phoneNumber?: string | null;
};

export async function patchMe(payload: UpdateMePayload) {
  return apiRequest<{ user: ApiUserPayload }>("/users/me", {
    method: "PATCH",
    json: payload as JsonBody,
  });
}

export type UpsertMyProfilePayload = {
  firstName: string;
  lastName: string;
  birthdate: string;
  gender: string;
  street?: string | null;
  barangay?: string | null;
  city?: string | null;
};

export async function putMyProfile(payload: UpsertMyProfilePayload) {
  return apiRequest<{ profile: ApiUserPayload["profile"] }>("/users/me/profile", {
    method: "PUT",
    json: payload as JsonBody,
  });
}

export type CompleteScreeningPayload = {
  riskLevel: "low" | "moderate" | "high";
  recommendation: string;
  checklist?: string;
  audioUris: string[];
  imageUri?: string;
  sessionId?: string;
  uploadError?: boolean;
  invalidAudio?: boolean;
  invalidAudioLabel?: string;
  invalidAudioReasons?: string[];
  apiAttempt?: string;
  averageTbProbability?: number | null;
  phlegmAnalyzed?: boolean;
  phlegmLoad?: string;
  phlegmConfidence?: number | null;
  phlegmProbs?: string;
};

/** Returned from POST /screenings with the rows the server just created. */
export type CompleteScreeningResponse = {
  session: {
    sessionId: string;
    coughRecordings: Array<{ recordingId: string; mimeType: string; byteSize: number | null }>;
    sputumImage: { imageId: string; mimeType: string; byteSize: number | null } | null;
  };
};

/** Persist a finished screening run for the authenticated user. */
export async function postCompleteScreening(payload: CompleteScreeningPayload) {
  return apiRequest<CompleteScreeningResponse>("/screenings", {
    method: "POST",
    json: { ...payload } as JsonBody,
  });
}

/* ------------------------------------------------------------------------
 * Raw media uploads
 *
 * After `postCompleteScreening` the backend has metadata rows but the actual
 * audio / image bytes still live on this phone. These helpers upload those
 * bytes so the same account can replay the cough or view the sputum image on
 * any other device. The backend stores the bytes in the same `cough_recordings`
 * / `sputum_images` tables (LONGBLOB columns).
 * ----------------------------------------------------------------------- */

function pickAudioMimeAndName(uri: string): { name: string; mimeType: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4") || lower.endsWith(".aac")) {
    return { name: "cough.m4a", mimeType: "audio/mp4" };
  }
  if (lower.endsWith(".3gp") || lower.endsWith(".3gpp")) {
    return { name: "cough.3gp", mimeType: "audio/3gpp" };
  }
  if (lower.endsWith(".caf")) return { name: "cough.caf", mimeType: "audio/x-caf" };
  if (lower.endsWith(".ogg") || lower.endsWith(".opus")) {
    return { name: "cough.ogg", mimeType: "audio/ogg" };
  }
  return { name: "cough.wav", mimeType: "audio/wav" };
}

function pickImageMimeAndName(uri: string): { name: string; mimeType: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return { name: "sputum.png", mimeType: "image/png" };
  if (lower.endsWith(".webp")) return { name: "sputum.webp", mimeType: "image/webp" };
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) {
    return { name: "sputum.heic", mimeType: "image/heic" };
  }
  return { name: "sputum.jpg", mimeType: "image/jpeg" };
}

function normalizeLocalUri(uri: string): string {
  const trimmed = uri.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  return hasScheme ? trimmed : `file://${trimmed}`;
}

/** POST /screenings/:sessionId/cough-recordings/:recordingId/raw (multipart). */
export async function uploadCoughRecordingRaw(args: {
  sessionId: string;
  recordingId: string;
  localUri: string;
}): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new ApiError(401, "Not signed in");

  const base = resolveApiBaseUrl();
  const url = `${base}/screenings/${encodeURIComponent(args.sessionId)}/cough-recordings/${encodeURIComponent(args.recordingId)}/raw`;
  const { name, mimeType } = pickAudioMimeAndName(args.localUri);
  const result = await withTimeout(
    FileSystem.uploadAsync(url, normalizeLocalUri(args.localUri), {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      parameters: { filename: name },
      headers: { Authorization: `Bearer ${token}` },
    }),
    RAW_UPLOAD_TIMEOUT_MS,
    "Cough upload",
  );
  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(result.status, "Could not upload recording. Please try again.");
  }
}

/** POST /screenings/:sessionId/sputum-image/raw (multipart). */
export async function uploadSputumImageRaw(args: {
  sessionId: string;
  localUri: string;
}): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new ApiError(401, "Not signed in");

  const base = resolveApiBaseUrl();
  const url = `${base}/screenings/${encodeURIComponent(args.sessionId)}/sputum-image/raw`;
  const { name, mimeType } = pickImageMimeAndName(args.localUri);
  const result = await withTimeout(
    FileSystem.uploadAsync(url, normalizeLocalUri(args.localUri), {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      parameters: { filename: name },
      headers: { Authorization: `Bearer ${token}` },
    }),
    RAW_UPLOAD_TIMEOUT_MS,
    "Sputum upload",
  );
  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(result.status, "Could not upload image. Please try again.");
  }
}

/** Build an absolute URL for a media-stream endpoint returned by the API. */
export function resolveMediaUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = resolveApiBaseUrl();
  return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Row returned by GET /screenings (list). */
export type ScreeningHistoryRow = {
  sessionId: string;
  startedAt: string;
  completedAt: string | null;
  finalRiskLevel: string | null;
  averageTbProbability: number | null;
  uploadError: boolean;
  result: {
    riskLevel: string;
    invalidAudio: boolean;
    createdAt: string;
  } | null;
  _count: { coughRecordings: number; symptomResponses: number };
};

/** Session payload from GET /screenings/:sessionId (detail). */
export type ScreeningSessionDetail = {
  sessionId: string;
  completedAt: string | null;
  finalRiskLevel: string | null;
  averageTbProbability: number | null;
  uploadError: boolean;
  checklistPayload?: unknown | null;
  result: {
    riskLevel: string;
    recommendation: string;
    invalidAudio: boolean;
    invalidAudioLabel: string | null;
    invalidAudioReasonsJson: unknown;
  } | null;
  symptomResponses: Array<{
    answerValue: boolean;
    question: { questionId: string; category: string; questionText: string };
  }>;
  coughRecordings: Array<{
    recordingId?: string;
    fileUri: string | null;
    /** Server-relative URL to stream the raw audio bytes (with Bearer auth). */
    fileUrl?: string | null;
    /** True when the backend has the original audio bytes for this row. */
    hasRawData?: boolean;
    mimeType?: string;
    byteSize?: number | null;
    source?: string | null;
    /** Which cough slot (1-based) this recording belongs to. Null for legacy rows. */
    coughAttempt?: number | null;
    /** ISO timestamp of when this recording was last written (used to detect retakes). */
    recordedAt?: string | null;
    qualityCheck: { ok: boolean; label: string | null; reasonsJson: unknown } | null;
    audioPrediction: { probTb: number; probNoTb: number } | null;
  }>;
  sputumImage: {
    imageId?: string;
    sessionId?: string;
    capturedAt?: string | null;
    fileUri: string | null;
    /** Server-relative URL to stream the raw image bytes (with Bearer auth). */
    fileUrl?: string | null;
    /** True when the backend has the original photo bytes for this row. */
    hasRawData?: boolean;
    mimeType?: string;
    byteSize?: number | null;
    source?: string | null;
    phlegmPrediction: {
      predictedLoad: string;
      confidence: number;
      probabilitiesJson: unknown;
    } | null;
  } | null;
};

export async function listMyScreenings(limit = 50) {
  const q = limit !== 50 ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return apiRequest<{ screenings: ScreeningHistoryRow[] }>(`/screenings${q}`, { method: "GET" });
}

/** CSV export — requires verified email (see emailVerifiedGate). */
export async function fetchScreeningHistoryExportCsv(): Promise<string> {
  const base = resolveApiBaseUrl();
  const token = await getAuthToken();
  if (!token) throw new ApiError(401, "Not signed in");

  const url = `${base}/screenings/export`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/csv",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return response.text();
}

export async function getScreening(sessionId: string, timeoutMs?: number) {
  return apiRequest<{ session: ScreeningSessionDetail }>(
    `/screenings/${encodeURIComponent(sessionId)}`,
    {
      method: "GET",
      ...(timeoutMs != null ? { timeoutMs } : {}),
    },
  );
}
