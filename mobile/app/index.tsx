import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import LandingPage from "./landingpage/landingpage";
import SplashIntro from "./components/SplashIntro";

export default function Index() {
  const [splashVisible, setSplashVisible] = useState(true);
  const handleSplashComplete = useCallback(() => {
    setSplashVisible(false);
  }, []);

  return (
    <View style={styles.root}>
      <LandingPage />
      {splashVisible ? (
        <SplashIntro onComplete={handleSplashComplete} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
