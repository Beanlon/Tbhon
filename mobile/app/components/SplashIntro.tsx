import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { JAM_TEAM_LOGO, TBHON_ICON_UPDATED } from "../../constants/branding";
import { APP_SCREEN_BACKGROUND } from "../../constants/palette";
import CachedImage from "./CachedImage";

/** Sequence timings for team logo -> app logo -> app screen. */
const TEAM_HOLD_MS = 2300;
const TEAM_FADE_OUT_MS = 320;
const APP_FADE_IN_MS = 320;
const APP_HOLD_MS = 1700;
const OUTRO_MS = 450;

type Props = {
  onComplete: () => void;
};

export default function SplashIntro({ onComplete }: Props) {
  const { width } = useWindowDimensions();
  const logoSize = Math.min(width * 0.52, 280);

  const screenOpacity = useRef(new Animated.Value(1)).current;
  const appLogoOpacity = useRef(new Animated.Value(0)).current;
  const teamLogoOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.98)).current;
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

    let cancelled = false;

    const play = async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, TEAM_HOLD_MS);
      });
      if (cancelled) return;

      await new Promise<void>((resolve) => {
        Animated.timing(teamLogoOpacity, {
          toValue: 0,
          duration: TEAM_FADE_OUT_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => resolve());
      });
      if (cancelled) return;

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 80);
      });
      if (cancelled) return;

      await new Promise<void>((resolve) => {
        Animated.parallel([
          Animated.timing(appLogoOpacity, {
            toValue: 1,
            duration: APP_FADE_IN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1,
            duration: APP_FADE_IN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => resolve());
      });
      if (cancelled) return;

      await new Promise<void>((resolve) => {
        setTimeout(resolve, APP_HOLD_MS);
      });
      if (cancelled) return;

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
    };

    void play();

    return () => {
      cancelled = true;
    };
  }, [appLogoOpacity, logoScale, screenOpacity, teamLogoOpacity]);

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <Animated.View
          style={{
            transform: [{ scale: logoScale }],
            width: logoSize,
            height: logoSize,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Animated.View
            style={{
              opacity: teamLogoOpacity,
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={styles.producedBy}>Produced by</Text>
            <CachedImage
              source={JAM_TEAM_LOGO}
              style={{
                width: logoSize,
                height: logoSize,
                alignSelf: "center",
              }}
              resizeMode="contain"
            />
          </Animated.View>
          <Animated.View style={{ opacity: appLogoOpacity }}>
            <CachedImage
              source={TBHON_ICON_UPDATED}
              style={{ width: logoSize, height: logoSize }}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: APP_SCREEN_BACKGROUND,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  producedBy: {
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: "#4B5563",
  },
});
