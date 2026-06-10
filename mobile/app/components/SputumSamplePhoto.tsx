import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
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
  /** Called when the user taps the image to view it full-screen. */
  onPress?: () => void;
};

const MAX_AUTH_RETRIES = 2;

/**
 * Displays sputum bytes stored on the backend (requires Bearer auth).
 * Refuses file:// and content:// so history always reflects database media.
 */
function SputumSamplePhoto({ sessionId, uri, height = 220, label, onPress }: Props) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [headersLoading, setHeadersLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [authRetry, setAuthRetry] = useState(0);
  const retryCountRef = useRef(0);

  const trimmed = uri.trim();
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";
  const uriMismatch =
    trimmed.length > 0 && sid.length > 0 && isHttpUri(trimmed) && !mediaUrlMatchesSession(trimmed, sid);
  const blocked = trimmed.length === 0 || isLocalUri(trimmed) || uriMismatch;
  const needsAuth = isHttpUri(trimmed) && !blocked;

  const source = useMemo(
    () => (needsAuth && headers ? { uri: trimmed, headers } : needsAuth ? null : { uri: trimmed }),
    [headers, needsAuth, trimmed],
  );

  const loadHeaders = useCallback(async () => {
    if (!needsAuth || blocked) return;
    setHeadersLoading(true);
    try {
      const h = await getAuthMediaHeaders();
      setHeaders(h);
      setLoadError(false);
    } catch {
      setHeaders(null);
      setLoadError(true);
    } finally {
      setHeadersLoading(false);
    }
  }, [blocked, needsAuth]);

  useEffect(() => {
    retryCountRef.current = 0;
    setAuthRetry(0);
    setLoadError(false);
    setHeaders(null);
    if (!needsAuth || blocked) return;
    void loadHeaders();
  }, [trimmed, needsAuth, blocked, sid, loadHeaders]);

  const handleImageError = useCallback(() => {
    if (!needsAuth) {
      setLoadError(true);
      return;
    }
    if (retryCountRef.current < MAX_AUTH_RETRIES) {
      retryCountRef.current += 1;
      setHeaders(null);
      setLoadError(false);
      setAuthRetry((n) => n + 1);
      void loadHeaders();
      return;
    }
    setLoadError(true);
  }, [loadHeaders, needsAuth]);

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

  const imageContent = (
    <>
      {(needsAuth && (headersLoading || !headers)) || (!needsAuth && !trimmed) ? (
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
        <>
          <Image
            key={`${sid || trimmed}-${authRetry}`}
            source={source}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={0}
            cachePolicy={needsAuth ? "none" : "memory-disk"}
            onError={handleImageError}
          />
          {onPress ? (
            <View
              className="absolute bottom-2 right-2 h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            >
              <Ionicons name="expand-outline" size={16} color="#fff" />
            </View>
          ) : null}
        </>
      )}
    </>
  );

  return (
    <View>
      {label ? (
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </Text>
      ) : null}
      {onPress ? (
        <Pressable
          onPress={onPress}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 active:opacity-90"
          style={{ height }}
          accessibilityRole="button"
          accessibilityLabel="View sputum sample full screen"
        >
          {imageContent}
        </Pressable>
      ) : (
        <View
          className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
          style={{ height }}
        >
          {imageContent}
        </View>
      )}
    </View>
  );
}

export default memo(SputumSamplePhoto);
