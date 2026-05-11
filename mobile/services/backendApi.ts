import { resolveApiBaseUrl } from "../utils/apiBaseUrl";
import { getAuthToken } from "../utils/authStorage";

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
  const response = await fetch(url, {
    ...rest,
    headers,
    body: bodyJson !== undefined ? JSON.stringify(bodyJson) : rest.body,
  });
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

/** Persist a finished screening run for the authenticated user (no-op token required). */
export async function postCompleteScreening(payload: CompleteScreeningPayload) {
  return apiRequest<{ session: unknown }>("/screenings", {
    method: "POST",
    json: { ...payload } as JsonBody,
  });
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
    fileUri: string;
    qualityCheck: { ok: boolean; label: string | null; reasonsJson: unknown } | null;
    audioPrediction: { probTb: number; probNoTb: number } | null;
  }>;
  sputumImage: {
    fileUri: string;
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
