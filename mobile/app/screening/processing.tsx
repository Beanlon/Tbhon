import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { resolveTbApiBaseUrls } from "../../utils/tbApiUrl";

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

async function uploadAudioForPredict(base: string, uri: string): Promise<any> {
  const fileUri = normalizeFileUri(uri);
  const { name, mimeType } = pickMimeAndName(fileUri);
  const url = `${base.replace(/\/$/, "")}/predict`;
  const result = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: "file",
    mimeType,
    parameters: { filename: name },
  });
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ audioDone?: string; audioUris?: string; imageUri?: string }>();

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
      if (p >= 0.50) return "moderate";
      return "low";
    };

    const run = async () => {
      const apiBases = resolveTbApiBaseUrls();
      if (__DEV__) {
        console.log("[Processing] TB API try in order:", apiBases.join(" -> "));
      }

      const uris = parseUris();
      if (uris.length === 0) {
        router.replace({
          pathname: "/screening/result",
          params: {
            risk: "low",
            audioUris: params.audioUris ?? "[]",
            imageUri: typeof params.imageUri === "string" ? params.imageUri : "",
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
            imageUri: typeof params.imageUri === "string" ? params.imageUri : "",
            uploadError: "1",
            wifiRequired: "1",
            apiAttempt: apiBases.join(" | "),
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
              data = await uploadAudioForPredict(base, uri);
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

        if (spoofed) {
          if (!cancelled) {
            router.replace({
              pathname: "/screening/result",
              params: {
                risk: "moderate",
                audioUris: params.audioUris ?? "[]",
                imageUri: typeof params.imageUri === "string" ? params.imageUri : "",
                invalidAudio: "1",
                invalidLabel: spoofLabel ?? "",
                invalidReasons: JSON.stringify(spoofReasons),
              },
            } as any);
          }
          return;
        }

        const avg = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0;
        if (!cancelled) {
          router.replace({
            pathname: "/screening/result",
            params: {
              risk: tbProbToRisk(avg),
              probTb: String(avg),
              audioUris: params.audioUris ?? "[]",
              imageUri: typeof params.imageUri === "string" ? params.imageUri : "",
            },
          } as any);
        }
      } catch (err) {
        console.error(`[Processing] Upload/predict failed. Tried: ${apiBases.join(" | ")}`, err);
        if (!cancelled) {
          router.replace({
            pathname: "/screening/result",
            params: {
              risk: "low",
              audioUris: params.audioUris ?? "[]",
              imageUri: typeof params.imageUri === "string" ? params.imageUri : "",
              uploadError: "1",
              apiAttempt: apiBases.join(" | "),
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
    <View
      style={{
        flex: 1,
        backgroundColor: "#0B1530",
        paddingTop: Math.max(insets.top, 16) + 8,
        paddingBottom: Math.max(insets.bottom, 16) + 18,
        paddingHorizontal: 18,
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <ActivityIndicator size="large" color="#FFFFFF" />
      <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "900", textAlign: "center" }}>
        Analyzing data… Please wait
      </Text>
      <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, textAlign: "center" }}>
        This may take a few seconds
      </Text>
    </View>
  );
}
