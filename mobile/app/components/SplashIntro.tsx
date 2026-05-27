import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { TBHON_ICON } from "../../constants/branding";
import { palette } from "../../constants/palette";
import CachedImage from "./CachedImage";

/** Time logo stays fully visible before outro begins. */
const INTRO_HOLD_MS = 2550;
const OUTRO_MS = 450;

type Props = {
  onComplete: () => void;
};

export default function SplashIntro({ onComplete }: Props) {
  const { width } = useWindowDimensions();
  const logoSize = Math.min(width * 0.52, 280);

  const screenOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(1)).current;
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const run = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Native splash may already be hidden
      }
    };
    void run();

    const holdTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(screenOpacity, {
          toValue: 0,
          duration: OUTRO_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 0.94,
          duration: OUTRO_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current();
        }
      });
    }, INTRO_HOLD_MS);

    return () => clearTimeout(holdTimer);
  }, [logoScale, screenOpacity]);

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <CachedImage
            source={TBHON_ICON}
            style={{ width: logoSize, height: logoSize }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.lavender,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
