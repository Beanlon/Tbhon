import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Image } from "expo-image";
import { getAuthMediaHeaders, mediaUrlMatchesSession } from "../../services/backendApi";

function isLocalUri(uri: string): boolean {
  const lower = uri.trim().toLowerCase();
  return lower.startsWith("file://") || lower.startsWith("content://");
}

function isHttpUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri.trim());
}

type Props = {
  /** Screening session this photo must belong to (when set, URI must match). */
  sessionId?: string;
  /** Full URL to GET /screenings/:sessionId/sputum-image/file (not a phone-local path). */
  uri: string;
  height?: number;
  label?: string;
};

/**
 * Displays sputum bytes stored on the backend (requires Bearer auth).
 * Refuses file:// and content:// so history always reflects database media.
 */
export default function SputumSamplePhoto({ sessionId, uri, height = 220, label }: Props) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [loadError, setLoadError] = useState(false);

  const trimmed = uri.trim();
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";
  const uriMismatch =
    trimmed.length > 0 && sid.length > 0 && isHttpUri(trimmed) && !mediaUrlMatchesSession(trimmed, sid);
  const blocked = trimmed.length === 0 || isLocalUri(trimmed) || uriMismatch;
  const needsAuth = isHttpUri(trimmed) && !blocked;

  useEffect(() => {
    setLoadError(false);
    setHeaders(null);
    if (!needsAuth || blocked) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const h = await getAuthMediaHeaders();
        if (!cancelled) setHeaders(h);
      } catch {
        if (!cancelled) setHeaders(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trimmed, needsAuth, blocked, sid]);

  if (blocked) {
    return (
      <View
        className="items-center justify-center rounded-2xl bg-slate-200 px-4"
        style={{ height }}
      >
        <Text className="text-center text-sm font-medium text-slate-500">no photo taken</Text>
      </View>
    );
  }

  const source =
    needsAuth && headers ? { uri: trimmed, headers } : needsAuth ? null : { uri: trimmed };

  return (
    <View>
      {label ? (
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </Text>
      ) : null}
      <View
        className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
        style={{ height }}
      >
        {needsAuth && !headers ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#0f172a" />
          </View>
        ) : loadError || !source ? (
          <View className="flex-1 items-center justify-center px-4">
            <Text className="text-center text-sm text-slate-500">
              Could not load image from the server.
            </Text>
          </View>
        ) : (
          <Image
            key={sid.length > 0 ? sid : trimmed}
            source={source}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="none"
            onError={() => setLoadError(true)}
          />
        )}
      </View>
    </View>
  );
}
