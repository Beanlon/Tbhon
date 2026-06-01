import * as FileSystem from "expo-file-system/legacy";
import { probeTbApiReachable, resolveTbApiBaseUrls } from "./tbApiUrl";

export type CoughQualityStatus = "checking" | "ok" | "bad" | "skipped" | "unavailable";
export type CoughQualityLabel = "silence" | "speech" | "replay" | "noise" | "invalid" | "";

export const COUGH_QUALITY_LABEL_MSG: Record<string, string> = {
  silence: "Too quiet — cough louder",
  speech: "Sounds like speech, not a cough",
  replay: "Sounds like a recording/replay",
  noise: "Too much background noise",
  invalid: "Could not validate recording",
};

const QUALITY_UPLOAD_TIMEOUT_MS = 45_000;
const QUALITY_MAX_ATTEMPTS = 2;

export function normalizeAudioFileUri(uri: string): string {
  const trimmed = String(uri || "").trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  return hasScheme ? trimmed : `file://${trimmed}`;
}

function pickMimeAndName(uri: string): { name: string; mimeType: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4") || lower.endsWith(".aac")) {
    return { name: "cough.m4a", mimeType: "audio/mp4" };
  }
  if (lower.endsWith(".3gp") || lower.endsWith(".3gpp")) {
    return { name: "cough.3gp", mimeType: "audio/3gpp" };
  }
  if (lower.endsWith(".caf")) {
    return { name: "cough.caf", mimeType: "audio/x-caf" };
  }
  if (lower.endsWith(".ogg") || lower.endsWith(".oga") || lower.endsWith(".opus")) {
    return { name: "cough.ogg", mimeType: "audio/ogg" };
  }
  return { name: "cough.wav", mimeType: "audio/wav" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadAudioForCheck(base: string, uri: string): Promise<any | null> {
  const fileUri = normalizeAudioFileUri(uri);
  const { name, mimeType } = pickMimeAndName(fileUri);
  const url = `${base.replace(/\/$/, "")}/check-quality`;
  const uploadTask = FileSystem.uploadAsync(url, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType,
    parameters: { filename: name },
  });
  const timeoutTask = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Quality check upload timed out")), QUALITY_UPLOAD_TIMEOUT_MS),
  );
  const result = await Promise.race([uploadTask, timeoutTask]);
  if (result.status < 200 || result.status >= 300) return null;
  try {
    return JSON.parse(result.body || "{}");
  } catch {
    return null;
  }
}

/** POST /check-quality on the TB inference API (same as legacy recording screen). */
export async function checkCoughRecordingQuality(
  uri: string,
): Promise<{ status: CoughQualityStatus; label: CoughQualityLabel }> {
  const apiBases = resolveTbApiBaseUrls();
  if (apiBases.length === 0) {
    return { status: "unavailable", label: "" };
  }

  try {
    let data: any = null;
    for (const base of apiBases) {
      const reachable = await probeTbApiReachable(base);
      if (!reachable) {
        console.log(`[CoughQuality] ML API unreachable at ${base}`);
        continue;
      }

      for (let attempt = 0; attempt < QUALITY_MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await uploadAudioForCheck(base, uri);
          if (result) {
            data = result;
            break;
          }
        } catch (e) {
          console.log(
            `[CoughQuality] check-quality failed at ${base} (attempt ${attempt + 1}):`,
            String((e as any)?.message ?? e),
          );
        }
        if (attempt + 1 < QUALITY_MAX_ATTEMPTS) {
          await sleep(600);
        }
      }
      if (data) break;
    }

    if (!data) {
      return { status: "unavailable", label: "" };
    }
    return {
      status: data?.ok === true ? "ok" : "bad",
      label: (data?.label ?? "") as CoughQualityLabel,
    };
  } catch {
    return { status: "unavailable", label: "" };
  }
}
