import { CommonActions } from "@react-navigation/native";
import type { NavigationAction } from "@react-navigation/native";

const AUTHENTICATED_HOME = "home/HomeScreen";
const LANDING_ROUTE = "landingpage/landingpage";

type NavigationDispatch = {
  dispatch: (action: NavigationAction) => void;
};

/** Clears auth stack history so back cannot return to login / sign-up. */
export function resetToAuthenticatedHome(navigation: NavigationDispatch) {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: AUTHENTICATED_HOME }],
    }),
  );
}

/** Clears session stack after sign-out so back cannot return to the home screen. */
export function resetToLanding(navigation: NavigationDispatch) {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: LANDING_ROUTE }],
    }),
  );
}
