import * as FileSystem from "expo-file-system/legacy";
import { resolveTbApiBaseUrls } from "./tbApiUrl";

export type PhlegmQualityStatus = "checking" | "ok" | "bad" | "skipped";
export type PhlegmQualityLabel = "blank" | "dark" | "blurry" | "invalid" | "";

export const PHLEGM_QUALITY_LABEL_MSG: Record<string, string> = {
  blank: "Image looks blank — recapture the smear",
  dark: "Image too dark — check microscope lighting",
  blurry: "Image too blurry — refocus and recapture",
  invalid: "Could not validate sputum image",
};

function normalizeFileUri(uri: string): string {
  const trimmed = String(uri || "").trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  return hasScheme ? trimmed : `file://${trimmed}`;
}

function pickMimeAndName(uri: string): { name: string; mimeType: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return { name: "sputum.png", mimeType: "image/png" };
  if (lower.endsWith(".webp")) return { name: "sputum.webp", mimeType: "image/webp" };
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return { name: "sputum.heic", mimeType: "image/heic" };
  return { name: "sputum.jpg", mimeType: "image/jpeg" };
}

async function uploadImageForCheck(base: string, uri: string): Promise<any | null> {
  const fileUri = normalizeFileUri(uri);
  const { name, mimeType } = pickMimeAndName(fileUri);
  const url = `${base.replace(/\/$/, "")}/check-phlegm-quality`;
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

/** POST /check-phlegm-quality on the TB inference API. */
export async function checkPhlegmImageQuality(
  uri: string,
): Promise<{ status: PhlegmQualityStatus; label: PhlegmQualityLabel }> {
  const apiBases = resolveTbApiBaseUrls();
  try {
    let data: any = null;
    for (const base of apiBases) {
      try {
        const result = await uploadImageForCheck(base, uri);
        if (result) {
          data = result;
          break;
        }
      } catch (e) {
        console.log(`[PhlegmQuality] check-phlegm-quality failed at ${base}:`, String((e as any)?.message ?? e));
      }
    }
    if (!data) {
      return { status: "skipped", label: "" };
    }
    return {
      status: data?.ok === true ? "ok" : "bad",
      label: (data?.label ?? "") as PhlegmQualityLabel,
    };
  } catch {
    return { status: "skipped", label: "" };
  }
}

export function phlegmQualityMessage(label: string): string {
  return PHLEGM_QUALITY_LABEL_MSG[label] ?? PHLEGM_QUALITY_LABEL_MSG.invalid;
}
