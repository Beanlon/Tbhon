import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import LandingPage from "./landingpage/landingpage";
import SplashIntro from "./components/SplashIntro";
import { APP_SCREEN_BACKGROUND } from "../constants/palette";
import { resetToAuthenticatedHome } from "../utils/authNavigation";
import { getAuthToken } from "../utils/authStorage";

type BootState = "checking" | "guest" | "authed";

export default function Index() {
  const navigation = useNavigation();
  const [splashDone, setSplashDone] = useState(false);
  const [bootState, setBootState] = useState<BootState>("checking");

  useEffect(() => {
    void getAuthToken().then((token) => {
      setBootState(token ? "authed" : "guest");
    });
  }, []);

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true);
  }, []);

  useEffect(() => {
    if (splashDone && bootState === "authed") {
      resetToAuthenticatedHome(navigation);
    }
  }, [splashDone, bootState, navigation]);

  const showSplash = !splashDone || bootState === "checking";
  const showLanding = splashDone && bootState === "guest";

  return (
    <View style={styles.root}>
      {showLanding ? <LandingPage /> : null}
      {showSplash ? <SplashIntro onComplete={handleSplashComplete} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: APP_SCREEN_BACKGROUND,
  },
});
