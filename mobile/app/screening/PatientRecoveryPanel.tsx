import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ApiError,
  getScreeningPatientRecovery,
  postScreeningPatientRecoveryReset,
} from "../../services/backendApi";
import { useTheme } from "../../contexts/ThemeContext";
import { canRunScreenings, resolveUserRole } from "../../constants/userRole";
import { peekProfile } from "../../utils/profileCache";

type Props = {
  sessionId: string;
};

export default function PatientRecoveryPanel({ sessionId }: Props) {
  const { colors } = useTheme();
  const role = resolveUserRole(peekProfile()?.role);
  const isStaff = role ? canRunScreenings(role) : false;

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [claimedAt, setClaimedAt] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId || !isStaff) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const info = await getScreeningPatientRecovery(sessionId);
      if (info.linked) {
        setLinked(true);
        setMaskedEmail(info.maskedEmail);
        setClientName(info.clientName);
        setClaimedAt(info.patientClaimedAt);
      } else {
        setLinked(false);
      }
    } catch {
      setLinked(false);
    } finally {
      setLoading(false);
    }
  }, [isStaff, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendReset = useCallback(async () => {
    setSending(true);
    try {
      const result = await postScreeningPatientRecoveryReset(sessionId);
      Alert.alert("Reset sent", result.message);
    } catch (e) {
      Alert.alert(
        "Could not send reset",
        e instanceof ApiError ? e.message : "Try again in a moment.",
      );
    } finally {
      setSending(false);
    }
  }, [sessionId]);

  if (!isStaff || !sessionId) return null;
  if (loading) {
    return (
      <View
        className="mb-4 rounded-2xl border px-4 py-4"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!linked) return null;

  const claimedLabel = claimedAt
    ? new Date(claimedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <View
      className="mb-4 rounded-2xl border px-4 py-4"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}
    >
      <View className="mb-2 flex-row items-center gap-2">
        <Ionicons name="key-outline" size={18} color={colors.primary} />
        <Text className="font-bold" style={{ color: colors.text }}>
          Patient result account
        </Text>
      </View>
      <Text className="mb-3 text-sm leading-6" style={{ color: colors.textSecondary }}>
        Verify the screened person&apos;s identity against intake, then help them recover access. Staff
        cannot see the full email or password.
      </Text>
      {clientName ? (
        <Text className="mb-1 text-sm" style={{ color: colors.text }}>
          <Text style={{ color: colors.textMuted }}>Intake name: </Text>
          {clientName}
        </Text>
      ) : null}
      {maskedEmail ? (
        <Text className="mb-1 text-sm" style={{ color: colors.text }}>
          <Text style={{ color: colors.textMuted }}>Login email: </Text>
          {maskedEmail}
        </Text>
      ) : null}
      {claimedLabel ? (
        <Text className="mb-4 text-sm" style={{ color: colors.textMuted }}>
          Linked {claimedLabel}
        </Text>
      ) : (
        <View className="mb-4" />
      )}
      <Pressable
        className="items-center rounded-xl py-3"
        style={{ backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }}
        disabled={sending}
        onPress={() => void sendReset()}
      >
        {sending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="font-bold text-white">Send password reset email</Text>
        )}
      </Pressable>
    </View>
  );
}
