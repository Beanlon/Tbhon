import { ApiError, createScreeningDraft } from "../services/backendApi";

/** Open a server session and go straight to checklist (no client record required). */
export async function startWalkInSession(): Promise<string> {
  const { sessionId } = await createScreeningDraft();
  if (!sessionId?.trim()) {
    throw new ApiError(500, "Could not start screening session.");
  }
  return sessionId.trim();
}
