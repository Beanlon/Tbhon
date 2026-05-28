import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "../../constants/palette";

export type IotTimelineStepState = "pending" | "active" | "done" | "error";

type Props = {
  labels: readonly string[];
  activeIndex: number;
  completedThrough: number;
  errorIndex?: number;
  errorMessage?: string;
  variant?: "light" | "dark";
};

function stepState(
  index: number,
  activeIndex: number,
  completedThrough: number,
  errorIndex?: number,
): IotTimelineStepState {
  if (errorIndex === index) return "error";
  if (index <= completedThrough) return "done";
  if (index === activeIndex) return "active";
  return "pending";
}

function AnimatedStepIcon({ state, dark }: { state: IotTimelineStepState; dark: boolean }) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    if (state === "active") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [state, scaleAnim, opacityAnim, pulseAnim]);

  const baseStyle = {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  if (state === "done") {
    return (
      <Animated.View
        style={[
          baseStyle,
          {
            backgroundColor: dark ? "rgba(16, 185, 129, 0.2)" : "#ECFDF5",
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <Ionicons name="checkmark" size={16} color="#10B981" />
      </Animated.View>
    );
  }

  if (state === "active") {
    return (
      <Animated.View
        style={[
          baseStyle,
          {
            backgroundColor: dark ? palette.violet : palette.lavender,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: dark ? "#FFFFFF" : palette.violet,
          }}
        />
      </Animated.View>
    );
  }

  if (state === "error") {
    return (
      <Animated.View
        style={[
          baseStyle,
          {
            backgroundColor: "rgba(220, 38, 38, 0.15)",
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <Ionicons name="close" size={16} color="#DC2626" />
      </Animated.View>
    );
  }

  return (
    <View
      style={[
        baseStyle,
        {
          borderWidth: 2,
          borderColor: dark ? "rgba(255,255,255,0.15)" : "#E2E8F0",
          backgroundColor: dark ? "rgba(255,255,255,0.03)" : "#F8FAFC",
        },
      ]}
    />
  );
}

export default function IotStatusTimeline({
  labels,
  activeIndex,
  completedThrough,
  errorIndex,
  errorMessage,
  variant = "light",
}: Props) {
  const dark = variant === "dark";

  return (
    <View style={{ gap: 4 }}>
      {labels.map((label, index) => {
        const state = stepState(index, activeIndex, completedThrough, errorIndex);
        const isLast = index === labels.length - 1;

        const textColor =
          state === "active"
            ? dark
              ? "#FFFFFF"
              : palette.violet
            : state === "done"
              ? dark
                ? "rgba(255,255,255,0.9)"
                : "#334155"
              : state === "error"
                ? "#DC2626"
                : dark
                  ? "rgba(255,255,255,0.4)"
                  : "#94A3B8";

        const lineColor =
          index < completedThrough
            ? dark
              ? "rgba(16, 185, 129, 0.4)"
              : "#BBF7D0"
            : dark
              ? "rgba(255,255,255,0.1)"
              : "#E2E8F0";

        return (
          <View key={`${label}-${index}`} style={{ flexDirection: "row", gap: 14 }}>
            <View style={{ alignItems: "center" }}>
              <AnimatedStepIcon state={state} dark={dark} />
              {!isLast ? (
                <View
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: 16,
                    marginTop: 4,
                    backgroundColor: lineColor,
                    borderRadius: 1,
                  }}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 8, justifyContent: "center" }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: state === "active" ? "700" : "600",
                  color: textColor,
                  lineHeight: 20,
                }}
              >
                {label}
              </Text>
              {state === "error" && errorMessage ? (
                <Text style={{ marginTop: 4, fontSize: 12, color: "#DC2626", lineHeight: 16 }}>
                  {errorMessage}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
