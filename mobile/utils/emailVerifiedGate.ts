import { Alert } from "react-native";
import type { ApiUserPayload } from "../services/backendApi";

export const EMAIL_VERIFY_BENEFITS =
  "Verify your email in Profile to download your screening history and share results.";

export function isEmailVerified(user: ApiUserPayload | null | undefined): boolean {
  return Boolean(user?.emailVerified);
}

type RouterLike = { push: (href: string) => void };

export function promptEmailVerification(router: RouterLike): void {
  Alert.alert("Verify your email", EMAIL_VERIFY_BENEFITS, [
    { text: "Not now", style: "cancel" },
    {
      text: "Verify email",
      onPress: () => router.push("/verifyEmail/verifyEmail" as never),
    },
  ]);
}

export function formatScreeningShareMessage(args: {
  riskLabel: string;
  completedAt?: string | null;
  tbProbabilityPercent?: number | null;
}): string {
  const dateLine = args.completedAt
    ? `Date: ${new Date(args.completedAt).toLocaleString()}`
    : "";
  const probLine =
    typeof args.tbProbabilityPercent === "number" && Number.isFinite(args.tbProbabilityPercent)
      ? `Cough signal (TB probability): ${args.tbProbabilityPercent.toFixed(1)}%`
      : "";
  return [
    "TBhon screening summary",
    "",
    `Risk level: ${args.riskLabel}`,
    dateLine,
    probLine,
    "",
    "This is a screening aid, not a medical diagnosis. Consult a healthcare professional for care decisions.",
  ]
    .filter(Boolean)
    .join("\n");
}
