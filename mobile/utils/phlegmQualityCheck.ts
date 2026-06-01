import * as FileSystem from "expo-file-system/legacy";
import { probeTbApiReachable, resolveTbApiBaseUrls } from "./tbApiUrl";

export type PhlegmQualityStatus = "checking" | "ok" | "bad" | "skipped";
export type PhlegmQualityLabel = "blank" | "dark" | "blurry" | "invalid" | "";

export const PHLEGM_QUALITY_LABEL_MSG: Record<string, string> = {
  blank: "Image looks blank — recapture the smear",
  dark: "Image too dark — check microscope lighting",
  blurry: "Image too blurry — refocus and recapture",
  invalid: "Could not validate sputum image",
};

const QUALITY_UPLOAD_TIMEOUT_MS = 45_000;
const QUALITY_MAX_ATTEMPTS = 2;

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
  const uploadTask = FileSystem.uploadAsync(url, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType,
    parameters: { filename: name },
  });
  const timeoutTask = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Phlegm quality check upload timed out")), QUALITY_UPLOAD_TIMEOUT_MS),
  );
  const result = await Promise.race([uploadTask, timeoutTask]);
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
      if (!(await probeTbApiReachable(base))) {
        console.log(`[PhlegmQuality] ML API unreachable at ${base}`);
        continue;
      }
      for (let attempt = 0; attempt < QUALITY_MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await uploadImageForCheck(base, uri);
          if (result) {
            data = result;
            break;
          }
        } catch (e) {
          console.log(
            `[PhlegmQuality] check-phlegm-quality failed at ${base} (attempt ${attempt + 1}):`,
            String((e as any)?.message ?? e),
          );
        }
        if (attempt + 1 < QUALITY_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      if (data) break;
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
