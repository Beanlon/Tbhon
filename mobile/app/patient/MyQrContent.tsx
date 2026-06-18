import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getMe, postEnsureMyPatientCode } from "../../services/backendApi";
import { buildPatientIdQrImageUrl, buildPatientIdUrl } from "../../constants/patientAccess";
import { peekProfile, setCachedProfile } from "../../utils/profileCache";
import { useTheme } from "../../contexts/ThemeContext";

function profileName(profile: { firstName?: string; lastName?: string } | null | undefined): string {
  if (!profile) return "";
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
}

type Props = {
  /** When true, omit the top header (used inside Home tab shell). */
  embedded?: boolean;
  isActive?: boolean;
};

export function MyQrContent({ embedded = false, isActive = true }: Props) {
  const { colors } = useTheme();

  const [publicCode, setPublicCode] = useState<string | null>(null);
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const loadQr = useCallback(async () => {
    setLoading(true);
    try {
      const { user } = await getMe();
      let patientPublicCode = user.patientPublicCode ?? null;
      if (!patientPublicCode && user.role === "PATIENT") {
        const ensured = await postEnsureMyPatientCode();
        patientPublicCode = ensured.patientPublicCode;
      }
      setCachedProfile({ ...user, patientPublicCode });
      setPublicCode(patientPublicCode);
      setName(profileName(user.profile ?? undefined));
    } catch (e) {
      const cached = peekProfile();
      if (cached) {
        setPublicCode(cached.patientPublicCode ?? null);
        setName(profileName(cached.profile ?? undefined));
      }
      Alert.alert(
        "Could not refresh QR",
        e instanceof Error ? e.message : "Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;
    void loadQr();
  }, [isActive, loadQr]);

  const handleShare = useCallback(async () => {
    if (!publicCode) return;
    setSharing(true);
    try {
      const payload = buildPatientIdUrl(publicCode);
      await Share.share({
        message: `My TBhon access code: ${publicCode}\n\nScan or enter this code at the booth to link a new screening to my account.\n\n${payload}`,
        title: "My TBhon QR",
      });
    } catch {
      // User cancelled — ignore
    } finally {
      setSharing(false);
    }
  }, [publicCode]);

  const qrSize = 220;
  const qrImageUri = publicCode ? buildPatientIdQrImageUrl(publicCode, qrSize) : null;

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
        paddingTop: embedded ? 16 : 0,
        paddingBottom: 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      {embedded ? (
        <Text className="mb-4 w-full text-center text-lg font-black" style={{ color: colors.text }}>
          My TBhon QR
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : !publicCode ? (
        <View className="items-center px-4">
          <Ionicons name="qr-code-outline" size={48} color={colors.textMuted} />
          <Text className="mt-4 text-center text-base font-semibold" style={{ color: colors.text }}>
            QR not available
          </Text>
          <Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.textSecondary }}>
            We could not load your TBhon ID from the server. Check your connection and tap refresh.
          </Text>
          <Pressable
            className="mt-5 rounded-xl px-5 py-3"
            style={{ backgroundColor: colors.primary }}
            onPress={() => void loadQr()}
          >
            <Text className="font-bold text-white">Refresh QR</Text>
          </Pressable>
        </View>
      ) : (
        <View className="w-full items-center">
          <Text className="mb-2 text-center text-xs font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
            My TBhon ID
          </Text>

          <View
            className="mb-5 w-full items-center rounded-3xl border px-6 py-7"
            style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
          >
            <View className="mb-4 rounded-2xl bg-white p-3">
              <Image
                source={{ uri: qrImageUri! }}
                style={{ width: qrSize, height: qrSize }}
                accessibilityLabel="My TBhon patient QR code"
              />
            </View>

            {name ? (
              <Text className="mb-1 text-center text-xl font-extrabold" style={{ color: colors.text }}>
                {name}
              </Text>
            ) : null}

            <View className="mt-3 w-full rounded-xl border px-3 py-2.5" style={{ borderColor: colors.border, backgroundColor: colors.surfaceAlt }}>
              <Text className="text-center text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
                Access code
              </Text>
              <Text
                className="mt-1 text-center text-xs"
                selectable
                style={{ color: colors.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
              >
                {publicCode}
              </Text>
            </View>
          </View>

          <Text className="mb-6 text-center text-xs leading-5" style={{ color: colors.textMuted }}>
            Show this QR to booth staff when you return for another screening so your new visit is linked to this account.
          </Text>

          <Pressable
            className="w-full flex-row items-center justify-center gap-2 rounded-xl py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary, opacity: sharing ? 0.7 : 1 }}
            disabled={sharing}
            onPress={() => void handleShare()}
          >
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
            <Text className="font-bold text-white">Share QR</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
