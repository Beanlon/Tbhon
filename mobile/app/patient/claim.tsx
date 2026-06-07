import { Redirect, useLocalSearchParams } from "expo-router";

/** Deep link entry: tbhon://patient/claim?token=… */
export default function PatientClaimDeepLink() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const raw = params.token;
  const token =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw) && typeof raw[0] === "string"
        ? raw[0].trim()
        : "";

  if (!token) {
    return <Redirect href="/patient/access" />;
  }

  return (
    <Redirect
      href={{
        pathname: "/patient/access",
        params: { token, autoClaim: "1" },
      }}
    />
  );
}
