import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { QrScanOverlay } from "../components/QrScanOverlay";
import { ApiError, getPatientLookup, postLinkPatientToSession, type PatientLookupResponse } from "../../services/backendApi";
import { useTheme } from "../../contexts/ThemeContext";
import { genderLabelFromApi } from "../../constants/profileGender";

type FoundPatient = Extract<PatientLookupResponse, { found: true }>;

function parsePatientIdCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("tbhon://")) {
      const url = new URL(trimmed.replace("tbhon://", "https://tbhon.local/"));
      const code = url.searchParams.get("code");
      return code?.trim() || null;
    }
  } catch {
    // fall through
  }
  if (/^[A-Za-z0-9_-]{6,64}$/.test(trimmed)) return trimmed;
  return null;
}

function DetailRow({
  label,
  value,
  placeholder = "Not provided",
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  const displayValue = value?.trim() || placeholder;
  const isPlaceholder = !value?.trim();
  return (
    <View className="mb-4 flex-row items-start">
      <Text className="w-32 pr-3 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
        {label}
      </Text>
      <Text className="flex-1 text-sm leading-5" style={{ color: isPlaceholder ? colors.textMuted : colors.text }}>
        {displayValue}
      </Text>
    </View>
  );
}

function formatAddress(patient: FoundPatient): string | null {
  const parts = [patient.street, patient.barangay, patient.city]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function formatEmergencyContact(patient: FoundPatient): string | null {
  const name = patient.emergencyContactName?.trim();
  const relation = patient.emergencyContactRelation?.trim();
  const phone = patient.emergencyContactPhone?.trim();
  const namePart = [name, relation].filter(Boolean).join(" · ");
  const value = [namePart, phone].filter(Boolean).join(" · ");
  return value || null;
}

export default function ReturningPatientScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [patient, setPatient] = useState<FoundPatient | null>(null);
  const resolvingRef = useRef<string | null>(null);

  const resetLookup = () => {
    setPatient(null);
    setEmailInput("");
  };

  const runLookup = useCallback(
    async (params: { code?: string; email?: string }, key: string) => {
      if (resolvingRef.current === key) return;
      resolvingRef.current = key;
      setLoading(true);
      setPatient(null);
      try {
        const result = await getPatientLookup(params);
        if (result.found) {
          setPatient(result);
        } else {
          Alert.alert(
            "Patient not found",
            params.code
              ? "No TBhon account found for that QR code. Check the QR is the patient's TBhon ID, not a result slip."
              : "No TBhon patient account found with that email. They may not have set up an account yet.",
            [{ text: "OK" }],
          );
        }
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not look up patient.";
        Alert.alert("Lookup failed", msg);
      } finally {
        resolvingRef.current = null;
        setLoading(false);
        setScanning(false);
      }
    },
    [],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (loading || linking) return;
      const code = parsePatientIdCode(data);
      if (!code) {
        Alert.alert("Unrecognised QR", "That does not look like a TBhon patient QR. Ask the patient to show their TBhon ID from the Profile screen.");
        return;
      }
      void runLookup({ code }, code);
    },
    [loading, linking, runLookup],
  );

  const startScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Camera needed", "Allow camera access to scan the patient's TBhon QR.");
        return;
      }
    }
    setScanning(true);
    setPatient(null);
  };

  const handleEmailLookup = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Enter email", "Type the patient's TBhon account email first.");
      return;
    }
    void runLookup({ email: trimmed }, trimmed);
  };

  const handleConfirmLink = async () => {
    if (!patient?.patientPublicCode || !sessionId) return;
    setLinking(true);
    try {
      await postLinkPatientToSession(sessionId, { patientPublicCode: patient.patientPublicCode });
      router.replace({
        pathname: "/screening/checklist",
        params: { sessionId },
      } as any);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not link patient.";
      Alert.alert("Link failed", msg);
    } finally {
      setLinking(false);
    }
  };

  const handleFallbackNewPatient = () => {
    router.replace({
      pathname: "/screening/client-intake",
      params: { sessionId, from: "session-start" },
    } as any);
  };

  const formatBirthdate = (iso: string | null | undefined) => {
    if (!iso) return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[2]} / ${m[3]} / ${m[1]}`;
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "bottom"]}>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />

      <View className="flex-row items-center border-b px-4 py-3" style={{ borderColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-lg font-black" style={{ color: colors.text }}>
          Returning patient
        </Text>
      </View>

      {scanning && permission?.granted ? (
        <View className="flex-1">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={loading || linking ? undefined : onBarcodeScanned}
          />
          <QrScanOverlay bottomReserved={140} hint="Align the patient's TBhon QR inside the frame" />
          <View className="absolute inset-x-0 bottom-0 px-5 pb-8 pt-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
            <Pressable
              className="items-center rounded-xl py-3.5"
              style={{ backgroundColor: colors.card }}
              onPress={() => setScanning(false)}
            >
              <Text className="font-semibold" style={{ color: colors.text }}>Cancel scan</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!patient ? (
              <>
                <Text className="mb-6 text-sm leading-6" style={{ color: colors.textSecondary }}>
                  Scan the patient&apos;s TBhon QR from their Profile screen, or enter their email as a backup.
                </Text>

                {/* Scan QR */}
                <View
                  className="mb-4 rounded-2xl border px-4 py-4"
                  style={{ borderColor: colors.border, backgroundColor: colors.card }}
                >
                  <View className="mb-2 flex-row items-center gap-2">
                    <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
                    <Text className="font-bold" style={{ color: colors.text }}>Scan TBhon QR</Text>
                  </View>
                  <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
                    Ask the patient to open their TBhon app, go to Profile, and tap &quot;Show my QR&quot;.
                  </Text>
                  <Pressable
                    className="flex-row items-center justify-center gap-2 rounded-xl py-3.5"
                    style={{ backgroundColor: colors.primary }}
                    onPress={() => void startScan()}
                    disabled={loading}
                  >
                    <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
                    <Text className="font-bold text-white">Scan QR</Text>
                  </Pressable>
                </View>

                {/* Email fallback */}
                <View
                  className="rounded-2xl border px-4 py-4"
                  style={{ borderColor: colors.border, backgroundColor: colors.card }}
                >
                  <Text className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                    Enter email (if QR unavailable)
                  </Text>
                  <TextInput
                    value={emailInput}
                    onChangeText={setEmailInput}
                    placeholder="Patient's TBhon account email"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    className="mb-3 rounded-xl border px-3 py-3 text-base"
                    style={{ borderColor: colors.border, color: colors.text, backgroundColor: colors.surfaceAlt }}
                  />
                  <Pressable
                    className="items-center rounded-xl border py-3"
                    style={{ borderColor: colors.border, opacity: emailInput.trim() && !loading ? 1 : 0.5 }}
                    disabled={!emailInput.trim() || loading}
                    onPress={handleEmailLookup}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text className="font-semibold" style={{ color: colors.text }}>Find patient</Text>
                    )}
                  </Pressable>
                </View>

                {loading && (
                  <View className="mt-8 items-center">
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text className="mt-3 text-sm" style={{ color: colors.textSecondary }}>Looking up patient…</Text>
                  </View>
                )}

                <Pressable className="mt-8 items-center py-2" onPress={handleFallbackNewPatient}>
                  <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>
                    Continue as new patient instead
                  </Text>
                </Pressable>
              </>
            ) : (
              /* Confirmation card */
              <View>
                <View className="mb-2 flex-row items-center gap-2">
                  <Ionicons name="checkmark-circle-outline" size={22} color={colors.primary} />
                  <Text className="font-bold text-base" style={{ color: colors.text }}>Patient found</Text>
                </View>
                <Text className="mb-5 text-sm leading-5" style={{ color: colors.textSecondary }}>
                  Confirm this is the correct person before linking their account to this session.
                </Text>

                <View
                  className="mb-5 rounded-2xl border px-4 py-4"
                  style={{ borderColor: colors.border, backgroundColor: colors.card }}
                >
                  <Text className="mb-5 font-bold text-base" style={{ color: colors.text }}>
                    {patient.name ?? "—"}
                  </Text>
                  <DetailRow label="Email" value={patient.email} />
                  <DetailRow label="Date of birth" value={formatBirthdate(patient.birthdate)} />
                  <DetailRow label="Sex" value={patient.gender ? genderLabelFromApi(patient.gender) : null} />
                  <DetailRow label="Current address" value={formatAddress(patient)} />
                  <DetailRow label="Contact number" value={patient.phoneNumber} />
                  <DetailRow
                    label="Emergency contact"
                    value={formatEmergencyContact(patient)}
                    placeholder="Not saved in patient profile"
                  />
                </View>

                <Pressable
                  className="mb-3 items-center rounded-xl py-3.5"
                  style={{ backgroundColor: colors.primary, opacity: linking ? 0.7 : 1 }}
                  disabled={linking}
                  onPress={() => void handleConfirmLink()}
                >
                  {linking ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="font-bold text-white">Confirm — link and continue</Text>
                  )}
                </Pressable>

                <Pressable className="items-center py-2" onPress={resetLookup}>
                  <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>
                    Search again
                  </Text>
                </Pressable>
                <Pressable className="mt-1 items-center py-2" onPress={handleFallbackNewPatient}>
                  <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>
                    Continue as new patient instead
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
