import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

export type GaugeRiskLevel = "low" | "moderate" | "high";

/** Centers of each equal third of the upper semicircle (degrees, CCW from +x). */
const NEEDLE_CENTER_DEG: Record<GaugeRiskLevel, number> = {
  low: 150,
  moderate: 90,
  high: 30,
};

const NEEDLE_COLOR: Record<GaugeRiskLevel, string> = {
  low: "#15803D",
  moderate: "#CA8A04",
  high: "#DC2626",
};

/** Equal thirds: 180°→120° (green), 120°→60° (amber), 60°→0° (red). */
const ARC_SEGMENTS: { degFrom: number; degTo: number; color: string }[] = [
  { degFrom: 180, degTo: 120, color: "#22C55E" },
  { degFrom: 120, degTo: 60, color: "#F59E0B" },
  { degFrom: 60, degTo: 0, color: "#EF4444" },
];

type GaugeChartProps = {
  size?: number;
  riskLevel?: GaugeRiskLevel;
};

/** Math angle (deg, CCW from +x) → point on circle; SVG y grows downward. */
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

/** Build the top semicircle path explicitly so SVG sweep flags cannot flip the arc. */
function arcStrokePath(cx: number, cy: number, r: number, degFrom: number, degTo: number) {
  const steps = 16;
  const step = (degTo - degFrom) / steps;

  return Array.from({ length: steps + 1 }, (_, i) => {
    const p = polar(cx, cy, r, degFrom + step * i);
    const cmd = i === 0 ? "M" : "L";
    return `${cmd} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  }).join(" ");
}

/** Rotation (degrees) for a needle lying on +x that should point toward `arcDeg` on the arc. */
function needleRotationDeg(arcDeg: number): string {
  const rad = (arcDeg * Math.PI) / 180;
  const deg = (Math.atan2(-Math.sin(rad), Math.cos(rad)) * 180) / Math.PI;
  return `${deg}deg`;
}

/**
 * Semicircle gauge: three equal 60° bands (green / amber / red); needle aims at the
 * center of the band for `riskLevel`.
 */
export function GaugeChart({ size = 150, riskLevel = "low" }: GaugeChartProps) {
  const S = size;
  const scale = S / 150;
  const needleL = 64 * scale;
  const needleTh = 5 * scale;
  const hubR = 8 * scale;

  const cx = S / 2;
  const cy = S / 2;
  const strokeW = 26 * scale;
  /** Mid-radius of the thick stroke band */
  const r = S / 2 - strokeW / 2;

  const arcDeg = NEEDLE_CENTER_DEG[riskLevel];
  const needleColor = NEEDLE_COLOR[riskLevel];
  const needleRotate = needleRotationDeg(arcDeg);

  const svgH = S / 2;

  return (
    <View style={{ width: S, height: svgH + 22 * scale, alignItems: "center" }}>
      <Svg width={S} height={svgH} viewBox={`0 0 ${S} ${svgH}`}>
        {ARC_SEGMENTS.map((seg, i) => (
          <Path
            key={i}
            d={arcStrokePath(cx, cy, r, seg.degFrom, seg.degTo)}
            stroke={seg.color}
            strokeWidth={strokeW}
            strokeLinecap="butt"
            fill="none"
          />
        ))}
      </Svg>

      <View
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          width: 0,
          height: 0,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: -needleTh / 2,
            width: needleL,
            height: needleTh,
            backgroundColor: needleColor,
            borderRadius: needleTh / 2,
            transform: [{ rotate: needleRotate }],
            transformOrigin: "left center",
          }}
        />
      </View>

      <View
        style={{
          position: "absolute",
          top: cy - hubR,
          left: cx - hubR,
          width: hubR * 2,
          height: hubR * 2,
          borderRadius: hubR,
          backgroundColor: "#1E293B",
        }}
      />
    </View>
  );
}
