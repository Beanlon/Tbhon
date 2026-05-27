import * as FileSystem from "expo-file-system/legacy";
import { resolveApiBaseUrl } from "../utils/apiBaseUrl";
import { getAuthToken } from "../utils/authStorage";

const API_REQUEST_TIMEOUT_MS = 15000;
const RAW_UPLOAD_TIMEOUT_MS = 20000;

export type ApiUserPayload = {
  userId: string;
  email: string | null;
  phoneNumber: string | null;
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
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs),
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
  return response.statusText || `Request failed (${response.status})`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { json?: JsonBody } = {},
  token?: string | null,
): Promise<T> {
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
  const { json: bodyJson, ...rest } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      signal: controller.signal,
      body: bodyJson !== undefined ? JSON.stringify(bodyJson) : rest.body,
    });
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

export type CompleteScreeningPayload = {
  riskLevel: "low" | "moderate" | "high";
  recommendation: string;
  checklist?: string;
  audioUris: string[];
  imageUri?: string;
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
    throw new ApiError(result.status, `Cough upload failed: HTTP ${result.status}`);
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
    throw new ApiError(result.status, `Sputum upload failed: HTTP ${result.status}`);
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
    qualityCheck: { ok: boolean; label: string | null; reasonsJson: unknown } | null;
    audioPrediction: { probTb: number; probNoTb: number } | null;
  }>;
  sputumImage: {
    imageId?: string;
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

export async function getScreening(sessionId: string) {
  return apiRequest<{ session: ScreeningSessionDetail }>(
    `/screenings/${encodeURIComponent(sessionId)}`,
    {
      method: "GET",
    },
  );
}
