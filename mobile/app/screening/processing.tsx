import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { resolveTbApiBaseUrls } from "../../utils/tbApiUrl";

const ANALYSIS_UPLOAD_TIMEOUT_MS = 12000;

/** URLs that only work on the same LAN as the PC (or USB tricks), not on carrier mobile data. */
const LAN_OR_LOCALHOST = /https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.0\.0\.1|localhost)(:|\/|$)/i;

function normalizeFileUri(uri: string): string {
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

/** Last path segment, lowercased, without query/hash — reliable ext for camera/picker URIs. */
function uriSuffixForMime(uri: string): string {
  const noFrag = uri.split("#")[0]?.split("?")[0] ?? uri;
  const slash = noFrag.lastIndexOf("/");
  return (slash >= 0 ? noFrag.slice(slash) : noFrag).toLowerCase();
}

function pickImageMimeAndName(uri: string): { name: string; mimeType: string } {
  const lower = uriSuffixForMime(uri);
  if (lower.endsWith(".png")) return { name: "phlegm.png", mimeType: "image/png" };
  if (lower.endsWith(".webp")) return { name: "phlegm.webp", mimeType: "image/webp" };
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return { name: "phlegm.heic", mimeType: "image/heic" };
  if (lower.endsWith(".jpeg") || lower.endsWith(".jpg")) return { name: "phlegm.jpg", mimeType: "image/jpeg" };
  return { name: "phlegm.jpg", mimeType: "image/jpeg" };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs),
    ),
  ]);
}

type RiskLevel = "low" | "moderate" | "high";

function phlegmLoadToRisk(load: string): RiskLevel {
  const x = load.toLowerCase();
  if (x === "high") return "high";
  if (x === "moderate") return "moderate";
  return "low";
}

function mergeRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const rank: Record<RiskLevel, number> = { low: 0, moderate: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function parsePredictResponseBody(status: number, text: string): any {
  let data: any = null;
  try {
    data = text.length ? JSON.parse(text) : null;
  } catch {
    throw new Error(`predict-phlegm returned non-JSON: HTTP ${status} ${text.slice(0, 200)}`);
  }
  if (status < 200 || status >= 300) {
    const detail = data?.detail;
    const hint =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((d: { msg?: string; loc?: unknown }) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d)))
              .join("; ")
          : text.slice(0, 240);
    throw new Error(`predict-phlegm failed: HTTP ${status} ${hint}`);
  }
  return data;
}

async function persistImageToDocs(srcUri: string): Promise<string> {
  const docs = FileSystem.documentDirectory ?? "";
  if (!docs) return srcUri;
  const dirUri = `${docs}phlegm`;
  try {
    const info = await FileSystem.getInfoAsync(dirUri);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }
  } catch {
    /* best-effort */
  }
  const lower = uriSuffixForMime(srcUri);
  const ext = lower.endsWith(".png")
    ? ".png"
    : lower.endsWith(".webp")
      ? ".webp"
      : lower.endsWith(".heic") || lower.endsWith(".heif")
        ? ".heic"
        : ".jpg";
  const dest = `${dirUri}/phlegm_${Date.now()}${ext}`;
  try {
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    return dest;
  } catch (e) {
    console.log("[Processing] persistImageToDocs copy failed:", String((e as any)?.message ?? e));
    return srcUri;
  }
}

async function uploadImagePhlegmFetch(base: string, uri: string): Promise<any> {
  const raw = String(uri || "").trim();
  const { name, mimeType } = pickImageMimeAndName(raw);
  const url = `${base.replace(/\/$/, "")}/predict-phlegm`;
  const form = new FormData();
  form.append("file", { uri: raw, name, type: mimeType } as unknown as Blob);
  const res = await fetch(url, { method: "POST", body: form });
  const text = await res.text();
  return parsePredictResponseBody(res.status, text);
}

async function uploadImagePhlegmFs(base: string, uri: string): Promise<any> {
  const raw = String(uri || "").trim();
  const fileUri = normalizeFileUri(raw);
  const { name, mimeType } = pickImageMimeAndName(fileUri);
  const url = `${base.replace(/\/$/, "")}/predict-phlegm`;
  const result = await withTimeout(
    FileSystem.uploadAsync(url, fileUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      parameters: { filename: name },
    }),
    ANALYSIS_UPLOAD_TIMEOUT_MS,
    "predict-phlegm",
  );
  return parsePredictResponseBody(result.status, result.body ?? "");
}

async function uploadImagePhlegm(base: string, uri: string): Promise<any> {
  // Try the most permissive first (handles content:// on Android), then the proven fallback.
  try {
    return await uploadImagePhlegmFetch(base, uri);
  } catch (e1) {
    if (__DEV__) {
      console.log(`[Processing] phlegm fetch upload failed at ${base}:`, String((e1 as any)?.message ?? e1));
    }
    try {
      return await uploadImagePhlegmFs(base, uri);
    } catch (e2) {
      if (__DEV__) {
        console.log(`[Processing] phlegm uploadAsync fallback failed at ${base}:`, String((e2 as any)?.message ?? e2));
      }
      throw e2;
    }
  }
}

type PhlegmPred = {
  analyzed: boolean;
  load: string;
  confidence: string;
  probsJson: string;
  error: string;
  errorDetail: string;
};

async function tryPredictPhlegm(apiBases: string[], imageUri: string | undefined): Promise<PhlegmPred> {
  const empty: PhlegmPred = {
    analyzed: false,
    load: "",
    confidence: "",
    probsJson: "{}",
    error: "0",
    errorDetail: "",
  };
  const trimmed = typeof imageUri === "string" ? imageUri.trim() : "";
  if (!trimmed) return empty;

  // Copy into the app's documentDirectory so the URI survives navigation and is reachable
  // by uploadAsync as a stable file:// path (mirrors what cough recordings do).
  let stableUri = trimmed;
  try {
    stableUri = await persistImageToDocs(trimmed);
    if (__DEV__ && stableUri !== trimmed) {
      console.log(`[Processing] phlegm image persisted: ${trimmed} -> ${stableUri}`);
    }
  } catch (e) {
    if (__DEV__) console.log("[Processing] persistImageToDocs threw:", String((e as any)?.message ?? e));
  }

  let lastErr: unknown = null;
  for (const base of apiBases) {
    try {
      if (__DEV__) console.log(`[Processing] phlegm POST -> ${base}/predict-phlegm`);
      const data = await uploadImagePhlegm(base, stableUri);
      const probs = data?.probabilities;
      if (__DEV__) console.log(`[Processing] phlegm OK ${base}/predict-phlegm`, data?.predicted_load);
      return {
        analyzed: true,
        load: typeof data?.predicted_load === "string" ? data.predicted_load : "",
        confidence:
          typeof data?.confidence === "number" && Number.isFinite(data.confidence) ? String(data.confidence) : "",
        probsJson: JSON.stringify(probs && typeof probs === "object" ? probs : {}),
        error: "0",
        errorDetail: "",
      };
    } catch (e) {
      lastErr = e;
      console.log(`[Processing] Failed ${base}/predict-phlegm:`, String((e as any)?.message ?? e));
    }
  }
  return {
    ...empty,
    error: "1",
    errorDetail: String((lastErr as any)?.message ?? lastErr ?? "unknown").slice(0, 400),
  };
}

function phlegmNavParams(p: PhlegmPred) {
  return {
    phlegmAnalyzed: p.analyzed ? "1" : "0",
    phlegmLoad: p.load,
    phlegmConfidence: p.confidence,
    phlegmProbs: p.probsJson,
    phlegmError: p.error,
    phlegmErrorDetail: p.errorDetail,
  };
}

async function uploadAudioForPredict(base: string, uri: string, extras?: Record<string, string>): Promise<any> {
  const fileUri = normalizeFileUri(uri);
  const { name, mimeType } = pickMimeAndName(fileUri);
  const url = `${base.replace(/\/$/, "")}/predict`;
  const result = await withTimeout(
    FileSystem.uploadAsync(url, fileUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      mimeType,
      parameters: { filename: name, ...(extras ?? {}) },
    }),
    ANALYSIS_UPLOAD_TIMEOUT_MS,
    "predict",
  );
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`predict failed: HTTP ${result.status} ${result.body?.slice(0, 200) ?? ""}`);
  }
  try {
    return JSON.parse(result.body || "{}");
  } catch {
    throw new Error(`predict returned non-JSON: ${result.body?.slice(0, 200) ?? ""}`);
  }
}

export default function ProcessingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ audioDone?: string; audioUris?: string; imageUri?: string; checklist?: string }>();

  useEffect(() => {
    let cancelled = false;

    const parseUris = (): string[] => {
      if (typeof params.audioUris !== "string" || params.audioUris.length === 0) return [];
      try {
        const v = JSON.parse(params.audioUris);
        return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length > 0) : [];
      } catch {
        return [];
      }
    };

    const tbProbToRisk = (p: number): "low" | "moderate" | "high" => {
      if (!Number.isFinite(p)) return "low";
      if (p >= 0.75) return "high";
      if (p >= 0.5) return "moderate";
      return "low";
    };

    const run = async () => {
      const apiBases = resolveTbApiBaseUrls();
      if (__DEV__) {
        console.log("[Processing] TB API try in order:", apiBases.join(" -> "));
      }

      const uris = parseUris();
      const imageUriStr = typeof params.imageUri === "string" ? params.imageUri : "";
      const checklistStr = typeof params.checklist === "string" ? params.checklist : "";
      /** Forward to every path so result/details persist + display checklist after analysis */
      const checklistNavParams = checklistStr.length > 0 ? ({ checklist: checklistStr } as const) : {};
      const uploadExtras = checklistStr.length ? { checklist: checklistStr } : undefined;
      const emptyPhlegm: PhlegmPred = {
        analyzed: false,
        load: "",
        confidence: "",
        probsJson: "{}",
        error: "0",
        errorDetail: "",
      };

      if (uris.length === 0 && !imageUriStr.trim()) {
        router.replace({
          pathname: "/screening/result",
          params: {
            risk: "low",
            audioUris: params.audioUris ?? "[]",
            imageUri: "",
            ...checklistNavParams,
            ...phlegmNavParams(emptyPhlegm),
          },
        } as any);
        return;
      }

      const net = await NetInfo.fetch();
      const usesLanApi = apiBases.some((b) => LAN_OR_LOCALHOST.test(b));
      const isWifiLike = net.type === "wifi" || net.type === "ethernet";
      if (__DEV__) {
        console.log(
          `[Processing] Network type=${String(net.type)} connected=${String(net.isConnected)} reachable=${String(
            net.isInternetReachable
          )}`
        );
      }
      if (usesLanApi && !isWifiLike && !cancelled) {
        router.replace({
          pathname: "/screening/result",
          params: {
            risk: "low",
            audioUris: params.audioUris ?? "[]",
            imageUri: imageUriStr,
            uploadError: "1",
            wifiRequired: "1",
            apiAttempt: apiBases.join(" | "),
            ...checklistNavParams,
            ...phlegmNavParams(emptyPhlegm),
          },
        } as any);
        return;
      }

      if (uris.length === 0 && imageUriStr.trim()) {
        const phlegm = await tryPredictPhlegm(apiBases, imageUriStr);
        if (cancelled) return;
        const finalRisk = phlegm.analyzed ? phlegmLoadToRisk(phlegm.load) : "low";
        router.replace({
          pathname: "/screening/result",
          params: {
            risk: finalRisk,
            probTb: "",
            audioUris: params.audioUris ?? "[]",
            imageUri: imageUriStr,
            ...checklistNavParams,
            ...phlegmNavParams(phlegm),
          },
        } as any);
        return;
      }

      try {
        const probs: number[] = [];
        let spoofed = false;
        let spoofReasons: string[] = [];
        let spoofLabel: string | null = null;
        for (const uri of uris) {
          let data: any = null;
          let lastPredictErr: unknown = null;
          for (const base of apiBases) {
            try {
              data = await uploadAudioForPredict(base, uri, uploadExtras);
              lastPredictErr = null;
              if (__DEV__) console.log(`[Processing] OK ${base}/predict`);
              break;
            } catch (e) {
              lastPredictErr = e;
              console.log(`[Processing] Failed ${base}/predict:`, String((e as any)?.message ?? e));
            }
          }
          if (lastPredictErr != null) {
            throw lastPredictErr;
          }

          if (data?.spoof === true) {
            spoofed = true;
            const reasons = data?.spoof_metrics?.reasons;
            if (Array.isArray(reasons)) {
              spoofReasons = reasons.filter((r: unknown) => typeof r === "string") as string[];
            }
            spoofLabel = typeof data?.spoof_metrics?.label === "string" ? data.spoof_metrics.label : null;
            break;
          }
          const pTb = Number(data?.prob_tb);
          if (Number.isFinite(pTb)) probs.push(pTb);
        }

        const phlegm = await tryPredictPhlegm(apiBases, imageUriStr);

        if (spoofed) {
          if (!cancelled) {
            const phR = phlegm.analyzed ? phlegmLoadToRisk(phlegm.load) : ("low" as RiskLevel);
            router.replace({
              pathname: "/screening/result",
              params: {
                risk: mergeRisk("moderate", phR),
                audioUris: params.audioUris ?? "[]",
                imageUri: imageUriStr,
                invalidAudio: "1",
                invalidLabel: spoofLabel ?? "",
                invalidReasons: JSON.stringify(spoofReasons),
                ...checklistNavParams,
                ...phlegmNavParams(phlegm),
              },
            } as any);
          }
          return;
        }

        const avg = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0;
        if (!cancelled) {
          const audioR = tbProbToRisk(avg);
          const phR = phlegm.analyzed ? phlegmLoadToRisk(phlegm.load) : ("low" as RiskLevel);
          router.replace({
            pathname: "/screening/result",
            params: {
              risk: mergeRisk(audioR, phR),
              probTb: String(avg),
              audioUris: params.audioUris ?? "[]",
              imageUri: imageUriStr,
              ...checklistNavParams,
              ...phlegmNavParams(phlegm),
            },
          } as any);
        }
      } catch (err) {
        console.error(`[Processing] Upload/predict failed. Tried: ${apiBases.join(" | ")}`, err);
        if (!cancelled) {
          const phlegm = await tryPredictPhlegm(apiBases, imageUriStr);
          const phR = phlegm.analyzed ? phlegmLoadToRisk(phlegm.load) : ("low" as RiskLevel);
          router.replace({
            pathname: "/screening/result",
            params: {
              risk: phR,
              probTb: "",
              audioUris: params.audioUris ?? "[]",
              imageUri: imageUriStr,
              ...checklistNavParams,
              uploadError: "1",
              apiAttempt: apiBases.join(" | "),
              ...phlegmNavParams(phlegm),
            },
          } as any);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor="#0B1530" translucent={false} />
      <SafeAreaView className="flex-1 bg-navy" edges={["top", "right", "bottom", "left"]}>
        <View className="flex-1 items-center justify-center gap-5 px-5 sm:px-6">
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text className="text-center text-base font-bold text-white sm:text-lg">
            Analyzing data… Please wait
          </Text>
          <Text className="text-center text-xs text-white/55 sm:text-sm">This may take a few seconds</Text>
        </View>
      </SafeAreaView>
    </>
  );
}
