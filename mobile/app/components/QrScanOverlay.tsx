import React, { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

const OVERLAY_COLOR = "rgba(0, 0, 0, 0.55)";
const FRAME_BORDER = "#FFFFFF";
const CORNER_LEN = 28;
const CORNER_THICK = 4;
const FRAME_MAX = 280;
const FRAME_RATIO = 0.72;

type CornerPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

function ScanCorner({ position }: { position: CornerPosition }) {
  const base = {
    position: "absolute" as const,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderColor: FRAME_BORDER,
  };

  const styles = {
    topLeft: {
      ...base,
      top: 0,
      left: 0,
      borderTopWidth: CORNER_THICK,
      borderLeftWidth: CORNER_THICK,
      borderTopLeftRadius: 4,
    },
    topRight: {
      ...base,
      top: 0,
      right: 0,
      borderTopWidth: CORNER_THICK,
      borderRightWidth: CORNER_THICK,
      borderTopRightRadius: 4,
    },
    bottomLeft: {
      ...base,
      bottom: 0,
      left: 0,
      borderBottomWidth: CORNER_THICK,
      borderLeftWidth: CORNER_THICK,
      borderBottomLeftRadius: 4,
    },
    bottomRight: {
      ...base,
      bottom: 0,
      right: 0,
      borderBottomWidth: CORNER_THICK,
      borderRightWidth: CORNER_THICK,
      borderBottomRightRadius: 4,
    },
  };

  return <View style={styles[position]} />;
}

type QrScanOverlayProps = {
  /** Reserved height at the bottom (controls / safe area). */
  bottomReserved?: number;
  hint?: string;
};

/** Viewfinder overlay with dimmed mask and corner brackets for QR scanning. */
export function QrScanOverlay({ bottomReserved = 140, hint }: QrScanOverlayProps) {
  const { width, height } = useWindowDimensions();

  const layout = useMemo(() => {
    const frameSize = Math.min(width * FRAME_RATIO, FRAME_MAX);
    const left = (width - frameSize) / 2;
    const cameraHeight = Math.max(0, height - bottomReserved);
    const top = Math.max(24, (cameraHeight - frameSize) / 2);
    return { frameSize, left, top };
  }, [bottomReserved, height, width]);

  const { frameSize, left, top } = layout;
  const right = left + frameSize;
  const bottom = top + frameSize;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.mask, { top: 0, left: 0, right: 0, height: top }]} />
      <View style={[styles.mask, { top: bottom, left: 0, right: 0, bottom: bottomReserved }]} />
      <View style={[styles.mask, { top, left: 0, width: left, height: frameSize }]} />
      <View style={[styles.mask, { top, left: right, right: 0, height: frameSize }]} />

      <View
        style={{
          position: "absolute",
          left,
          top,
          width: frameSize,
          height: frameSize,
        }}
      >
        <ScanCorner position="topLeft" />
        <ScanCorner position="topRight" />
        <ScanCorner position="bottomLeft" />
        <ScanCorner position="bottomRight" />
      </View>

      {hint ? (
        <Text style={[styles.hint, { top: top - 36, left: 20, right: 20 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mask: {
    position: "absolute",
    backgroundColor: OVERLAY_COLOR,
  },
  hint: {
    position: "absolute",
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
});
