import { Alert } from "react-native";
import type { ApiUserPayload } from "../services/backendApi";

export const EMAIL_VERIFY_BENEFITS =
  "Verify your email to unlock screening PDF export.";

export function isEmailVerified(user: ApiUserPayload | null | undefined): boolean {
  return Boolean(user?.emailVerified);
}

type RouterLike = { push: (href: string) => void };

export function promptEmailVerification(router: RouterLike): void {
  Alert.alert("Email verification required", EMAIL_VERIFY_BENEFITS, [
    { text: "Maybe later", style: "cancel" },
    {
      text: "Verify now",
      onPress: () => router.push("/verifyEmail/verifyEmail" as never),
    },
  ]);
}
