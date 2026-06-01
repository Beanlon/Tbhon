import { Platform } from "react-native";
import Constants from "expo-constants";

function isRemoteTunnelHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower.includes("trycloudflare.com") || lower.includes("exp.direct") || lower.includes("expo.dev");
}

/**
 * Metro / dev server host from Expo (e.g. "192.168.1.9:8081").
 * Same machine as your ML API when you run both on the PC - use for phone + Expo Go on LAN.
 */
function devPackagerLanHost(): string | null {
  const uri = Constants.expoConfig?.hostUri;
  if (!uri || typeof uri !== "string") return null;
  const host = uri.split(":")[0]?.trim();
  if (!host) return null;
  if (host === "localhost" || host === "127.0.0.1") return null;
  if (isRemoteTunnelHost(host)) return null;
  return host;
}

/**
 * Base URL for the TB cough inference API (no trailing slash).
 * 1) EXPO_PUBLIC_TB_API_URL (see mobile/.env.example)
 * 2) Expo dev hostUri → http://<same-host>:8000 (fixes phone + Expo Go using 127.0.0.1)
 * 3) Android emulator → 10.0.2.2
 * 4) 127.0.0.1 (simulator / web on same PC)
 */
export function resolveTbApiBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" ? (process.env.EXPO_PUBLIC_TB_API_URL as string | undefined) : undefined;
  if (fromEnv && String(fromEnv).trim().length > 0) {
    return String(fromEnv).replace(/\/$/, "");
  }
  const lan = devPackagerLanHost();
  if (lan) {
    return `http://${lan}:8000`;
  }
  if (Platform.OS === "android" && Constants.isDevice === false) {
    return "http://10.0.2.2:8000";
  }
  if (Constants.isDevice && __DEV__) {
    console.warn(
      "[TB API] Using http://127.0.0.1:8000 on a physical device - connection will fail unless the API runs ON the phone. Set EXPO_PUBLIC_TB_API_URL=http://<PC_LAN_IP>:8000 or open Expo in LAN mode (not tunnel)."
    );
  }
  return "http://127.0.0.1:8000";
}

const LOOPBACK_API = "http://127.0.0.1:8000";

/** Metro host from Expo config (host only, no port). */
function devMetroHost(): string | null {
  if (!__DEV__) return null;
  const uri = Constants.expoConfig?.hostUri;
  if (!uri || typeof uri !== "string") return null;
  const [host] = uri.split(":").map((s) => s.trim());
  if (!host) return null;
  if (isRemoteTunnelHost(host)) return null;
  return host;
}

/**
 * Candidate Metro proxy bases.
 * Expo may bump ports (8081 -> 8082, etc.) when one is busy, so we try common dev ports.
 */
function devMetroTbProxyBases(): string[] {
  if (!__DEV__) return [];
  const uri = Constants.expoConfig?.hostUri;
  const host = devMetroHost();
  if (!uri || typeof uri !== "string" || !host) return [];
  const [, uriPort = "8081"] = uri.split(":").map((s) => s.trim());
  const ports = [uriPort, "8081", "8082", "8083"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of ports) {
    const port = String(p || "").trim();
    if (!port || seen.has(port)) continue;
    seen.add(port);
    out.push(`http://${host}:${port}/_tb_infer`);
  }
  return out;
}

/**
 * Ordered list of base URLs to try for /predict and /check-quality.
 * 1) Explicit EXPO_PUBLIC_TB_API_URL when present (Cloudflare / LAN direct)
 * 2) Metro `/_tb_infer` proxy on LAN (same port as Expo)
 * 3) Direct :8000 from resolveTbApiBaseUrl()
 * 4) On physical Android, http://127.0.0.1:8000 (adb reverse tcp:8000 tcp:8000)
 */
export function resolveTbApiBaseUrls(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (u: string) => {
    const x = u.replace(/\/$/, "");
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  };

  const fromEnv =
    typeof process !== "undefined" ? (process.env.EXPO_PUBLIC_TB_API_URL as string | undefined) : undefined;
  const envTrimmed = fromEnv ? String(fromEnv).trim() : "";
  const lan = devPackagerLanHost();
  const envIsStaleCfTunnel =
    envTrimmed.length > 0 && envTrimmed.toLowerCase().includes("trycloudflare.com");

  // LAN Expo + local infer: try Metro proxy / :8000 before a possibly dead quick tunnel.
  if (__DEV__ && lan && envIsStaleCfTunnel) {
    for (const proxy of devMetroTbProxyBases()) add(proxy);
    add(`http://${lan}:8000`);
    add(envTrimmed);
  } else if (envTrimmed.length > 0) {
    add(envTrimmed);
  }
  // Metro proxy only works for LAN/dev-server hosts. Remote Expo tunnels expose
  // HTTPS :443, not the local Metro port, so those proxy URLs would hang phones.
  if (!(__DEV__ && lan && envIsStaleCfTunnel)) {
    for (const proxy of devMetroTbProxyBases()) add(proxy);
  }
  if (envTrimmed.length === 0) add(resolveTbApiBaseUrl());
  if (Platform.OS === "android" && Constants.isDevice === true) {
    add(LOOPBACK_API);
  }
  return out;
}

/** Quick GET /healthz probe — skips dead Cloudflare tunnel URLs before multipart upload. */
export async function probeTbApiReachable(base: string, timeoutMs = 8_000): Promise<boolean> {
  const url = `${base.replace(/\/$/, "")}/healthz`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    if (!response.ok) return false;
    const data = (await response.json()) as { ok?: boolean };
    return data?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
