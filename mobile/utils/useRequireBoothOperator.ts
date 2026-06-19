import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useFocusEffect, useRouter, useSegments } from "expo-router";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { getMe } from "../services/backendApi";
import { canRunScreenings, isPatientRole, resolveUserRole, type UserRole } from "../constants/userRole";
import { getAuthToken } from "./authStorage";
import { peekProfile, setCachedProfile } from "./profileCache";
import { resetToLanding } from "./authNavigation";

/** Routes under /screening that patients may open (linked result details only). */
export const PATIENT_ALLOWED_SCREENING_ROUTES = new Set(["details"]);

export function isPatientAllowedScreeningRoute(segments: string[]): boolean {
  const screeningIdx = segments.indexOf("screening");
  if (screeningIdx < 0) return false;
  const routeName = segments[screeningIdx + 1];
  return typeof routeName === "string" && PATIENT_ALLOWED_SCREENING_ROUTES.has(routeName);
}

type BoothAccessState = {
  checked: boolean;
  allowed: boolean;
  role: UserRole | null;
};

/**
 * Blocks PATIENT accounts from booth workflow screens under /screening.
 * Patients may only view screening/details for their linked results.
 */
export function useRequireBoothOperator(): BoothAccessState {
  const router = useRouter();
  const navigation = useNavigation();
  const segments = useSegments();
  const isFocused = useIsFocused();
  const patientRedirectedRef = useRef(false);
  const [state, setState] = useState<BoothAccessState>({
    checked: false,
    allowed: false,
    role: null,
  });

  const verifyAccess = useCallback(async () => {
    if (!isFocused) return;

    if (isPatientAllowedScreeningRoute(segments as string[])) {
      patientRedirectedRef.current = false;
      setState({ checked: true, allowed: true, role: "PATIENT" });
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      resetToLanding(navigation);
      setState({ checked: true, allowed: false, role: null });
      return;
    }

    let role = resolveUserRole(peekProfile()?.role);
    if (!role) {
      try {
        const { user } = await getMe();
        setCachedProfile(user);
        role = resolveUserRole(user.role);
      } catch {
        role = null;
      }
    }

    if (!role) {
      Alert.alert("Session error", "Could not verify your account role. Please sign in again.");
      resetToLanding(navigation);
      setState({ checked: true, allowed: false, role: null });
      return;
    }

    if (isPatientRole(role)) {
      if (!patientRedirectedRef.current) {
        patientRedirectedRef.current = true;
        router.replace("/home/HomeScreen" as never);
      }
      setState({ checked: true, allowed: false, role });
      return;
    }

    if (!canRunScreenings(role)) {
      router.replace("/home/HomeScreen" as never);
      setState({ checked: true, allowed: false, role });
      return;
    }

    patientRedirectedRef.current = false;
    setState({ checked: true, allowed: true, role });
  }, [isFocused, navigation, router, segments]);

  useEffect(() => {
    void verifyAccess();
  }, [verifyAccess]);

  useFocusEffect(
    useCallback(() => {
      void verifyAccess();
    }, [verifyAccess]),
  );

  return state;
}
