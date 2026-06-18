import React from "react";
import { View } from "react-native";

type AudioWaveIconProps = {
  size?: number;
  color?: string;
};

const BAR_HEIGHTS = [0.42, 0.68, 0.92, 0.58, 0.82, 0.5];

export default function AudioWaveIcon({ size = 28, color = "#FFFFFF" }: AudioWaveIconProps) {
  const barWidth = Math.max(3, size * 0.12);
  const gap = Math.max(2, size * 0.055);

  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap,
      }}
      pointerEvents="none"
    >
      {BAR_HEIGHTS.map((height, index) => (
        <View
          key={`${height}-${index}`}
          style={{
            width: barWidth,
            height: Math.max(barWidth, size * height),
            borderRadius: barWidth,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
