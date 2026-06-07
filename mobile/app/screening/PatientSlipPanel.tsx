import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, getScreeningPatientAccess } from "../../services/backendApi";
import PatientResultQr from "../components/PatientResultQr";
import { useTheme } from "../../contexts/ThemeContext";
import { canRunScreenings, resolveUserRole } from "../../constants/userRole";
import { peekProfile } from "../../utils/profileCache";

type Props = {
  sessionId: string;
  onSharePdf: (claimUrl: string) => Promise<void>;
};

/** Staff-only: re-share result slip QR / PDF from session details. */
export default function PatientSlipPanel({ sessionId, onSharePdf }: Props) {
  const { colors } = useTheme();
  const role = resolveUserRole(peekProfile()?.role);
  const isStaff = role ? canRunScreenings(role) : false;

  const [loading, setLoading] = useState(true);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId || !isStaff) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const access = await getScreeningPatientAccess(sessionId);
      setClaimUrl(access.claimUrl);
      setAlreadyClaimed(Boolean(access.alreadyClaimed));
      setMaskedEmail(access.maskedEmail ?? null);
    } catch (e) {
      setClaimUrl(null);
      if (e instanceof ApiError && e.status !== 404) {
        Alert.alert("Result slip unavailable", e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [isStaff, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sharePdf = useCallback(async () => {
    if (!claimUrl) return;
    setSharing(true);
    try {
      await onSharePdf(claimUrl);
    } catch (e) {
      Alert.alert(
        "Share PDF",
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not create PDF.",
      );
    } finally {
      setSharing(false);
    }
  }, [claimUrl, onSharePdf]);

  if (!isStaff) return null;

  return (
    <View
      className="mb-3 rounded-3xl border p-5"
      style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
    >
      <View className="mb-3 flex-row items-center gap-2">
        <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
        <Text className="text-base font-bold" style={{ color: colors.text }}>
          Patient result slip
        </Text>
      </View>
      <Text className="mb-3 text-sm leading-5" style={{ color: colors.textSecondary }}>
        Re-print or share the QR access slip for the screened person.
        {alreadyClaimed
          ? maskedEmail
            ? ` Already linked to ${maskedEmail}.`
            : " Already linked to a patient account."
          : ""}
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : claimUrl ? (
        <>
          <PatientResultQr claimUrl={claimUrl} compact />
          <Pressable
            disabled={sharing}
            onPress={() => void sharePdf()}
            className="mt-4 flex-row items-center justify-center gap-2 rounded-xl py-3 active:opacity-85"
            style={{ backgroundColor: colors.primary }}
          >
            {sharing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text className="text-sm font-bold text-white">Share PDF with QR</Text>
              </>
            )}
          </Pressable>
        </>
      ) : (
        <Text className="text-sm leading-5" style={{ color: colors.textMuted }}>
          No access code is stored for this session.
        </Text>
      )}
    </View>
  );
}
