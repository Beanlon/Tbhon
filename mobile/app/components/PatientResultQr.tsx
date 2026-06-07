import { Image, Platform, Text, View } from "react-native";
import {
  buildPatientClaimQrImageUrl,
  PATIENT_ACCESS_CODE_HINT,
  PATIENT_ACCESS_CODE_LABEL,
  PATIENT_QR_INSTRUCTION,
  patientAccessCodeFromClaimUrl,
} from "../../constants/patientAccess";

type Props = {
  claimUrl: string;
  compact?: boolean;
};

/** Result-slip QR for screened person to claim their result in the app. */
export default function PatientResultQr({ claimUrl, compact = false }: Props) {
  const qrUri = buildPatientClaimQrImageUrl(claimUrl, compact ? 160 : 200);
  const accessCode = patientAccessCodeFromClaimUrl(claimUrl);

  return (
    <View
      className={`items-center rounded-2xl border px-4 ${compact ? "py-3" : "py-4"}`}
      style={{ borderColor: "#E2E8F0", backgroundColor: "#FAFBFF" }}
    >
      <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-[#64748B]">
        Your result access QR
      </Text>
      <Text className="mb-3 text-center text-xs leading-5 text-[#64748B]">
        {PATIENT_QR_INSTRUCTION}
      </Text>
      <View className="rounded-xl bg-white p-2">
        <Image
          source={{ uri: qrUri }}
          style={{ width: compact ? 160 : 200, height: compact ? 160 : 200 }}
          accessibilityLabel="QR code to access your screening result in the TBhon app"
        />
      </View>
      {accessCode ? (
        <View className="mt-3 w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
            {PATIENT_ACCESS_CODE_LABEL}
          </Text>
          <Text
            className="mt-1 text-center text-xs leading-5 text-[#0F172A]"
            selectable
            style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
          >
            {accessCode}
          </Text>
          <Text className="mt-1.5 text-center text-[10px] leading-4 text-[#94A3B8]">
            {PATIENT_ACCESS_CODE_HINT}
          </Text>
        </View>
      ) : null}
      <Text className="mt-3 text-center text-[10px] leading-4 text-[#94A3B8]">
        Scan in TBhon under “View my screening result” — valid 90 days
      </Text>
    </View>
  );
}
