import * as FileSystem from "expo-file-system/legacy";
import { resolveTbApiBaseUrls } from "./tbApiUrl";

export type CoughQualityStatus = "checking" | "ok" | "bad" | "skipped";
export type CoughQualityLabel = "silence" | "speech" | "replay" | "noise" | "invalid" | "";

export const COUGH_QUALITY_LABEL_MSG: Record<string, string> = {
  silence: "Too quiet — cough louder",
  speech: "Sounds like speech, not a cough",
  replay: "Sounds like a recording/replay",
  noise: "Too much background noise",
  invalid: "Could not validate recording",
};

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

async function uploadAudioForCheck(base: string, uri: string): Promise<any | null> {
  const fileUri = normalizeAudioFileUri(uri);
  const { name, mimeType } = pickMimeAndName(fileUri);
  const url = `${base.replace(/\/$/, "")}/check-quality`;
  const result = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType,
    parameters: { filename: name },
  });
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
  try {
    let data: any = null;
    for (const base of apiBases) {
      try {
        const result = await uploadAudioForCheck(base, uri);
        if (result) {
          data = result;
          break;
        }
      } catch (e) {
        console.log(`[CoughQuality] check-quality failed at ${base}:`, String((e as any)?.message ?? e));
      }
    }
    if (!data) {
      return { status: "skipped", label: "" };
    }
    return {
      status: data?.ok === true ? "ok" : "bad",
      label: (data?.label ?? "") as CoughQualityLabel,
    };
  } catch {
    return { status: "skipped", label: "" };
  }
}
