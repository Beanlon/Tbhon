import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "light" | "dark" | "system";

/**
 * TBhon Palette:
 * Deep Navy: #0C1E4A - primary text / light-mode accents
 * Dark Background: #081430 - screen backdrop (dark mode only)
 * Navy: #1A3478 - dark backgrounds, primary buttons
 * Indigo: #3D4EA6 - accent, cards in dark mode
 * Violet: #5B4FC4 - hero elements, highlights
 * Soft Violet: #7B6FD8 - lighter accents
 * Lavender: #EAE8FA - lightest, text on dark
 */
export const tbhonPalette = {
  deepNavy: "#0C1E4A",
  navy: "#1A3478",
  indigo: "#3D4EA6",
  violet: "#5B4FC4",
  softViolet: "#7B6FD8",
  lavender: "#EAE8FA",
} as const;

const DARK_BACKGROUND = "#081430";

/**
 * Dark-mode surfaces — richer purple/indigo/violet, still dimmed for comfort.
 */
const darkComponent = {
  base: "#1B244C",
  raised: "#252468",
  elevated: "#2E2A78",
  border: "#1e2751",
  accent: "#4E4698",
  highlight: "#6B5FC4",
  interactive: "#9588D8",
  interactivePressed: "#A799E4",
  onInteractive: "#FFFFFF",
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  accent: string;
  border: string;
  borderLight: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  inputBg: string;
  inputBorder: string;
  modalOverlay: string;
  statusBar: "light" | "dark";
  heroCard: string;
  heroCardAccent: string;
  heroText: string;
  heroTextMuted: string;
  heroBadgeBg: string;
  heroButtonBg: string;
  heroButtonText: string;
  serviceTileBg: string;
  serviceTileBorder: string;
  serviceTileIcon: string;
  navActive: string;
  navInactive: string;
};

const lightColors: ThemeColors = {
  background: "#FFFFFF",
  surface: "#F8FAFC",
  surfaceAlt: "#F1F5F9",
  card: "#FFFFFF",
  cardBorder: "#E2E8F0",
  text: tbhonPalette.deepNavy,
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  primary: tbhonPalette.navy,
  primaryLight: "#EFF6FF",
  accent: tbhonPalette.indigo,
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  success: "#10B981",
  successBg: "#ECFDF5",
  warning: "#F59E0B",
  warningBg: "#FFFBEB",
  error: "#EF4444",
  errorBg: "#FEF2F2",
  inputBg: "#F8FAFC",
  inputBorder: "#E2E8F0",
  modalOverlay: "rgba(0,0,0,0.35)",
  statusBar: "dark",
  heroCard: tbhonPalette.navy,
  heroCardAccent: tbhonPalette.violet,
  heroText: "#FFFFFF",
  heroTextMuted: "rgba(255,255,255,0.7)",
  heroBadgeBg: "rgba(255,255,255,0.15)",
  heroButtonBg: tbhonPalette.navy,
  heroButtonText: "#FFFFFF",
  serviceTileBg: "#FFFFFF",
  serviceTileBorder: "#F1F5F9",
  serviceTileIcon: tbhonPalette.violet,
  navActive: tbhonPalette.deepNavy,
  navInactive: "#9CA3AF",
};

const darkColors: ThemeColors = {
  background: DARK_BACKGROUND,
  surface: darkComponent.base,
  surfaceAlt: darkComponent.raised,
  card: darkComponent.base,
  cardBorder: darkComponent.border,
  text: "#F2EFFE",
  textSecondary: "#D6D0F2",
  textMuted: "#A39ACA",
  primary: darkComponent.interactive,
  primaryLight: darkComponent.raised,
  accent: darkComponent.highlight,
  border: darkComponent.border,
  borderLight: darkComponent.base,
  success: "#34D399",
  successBg: "rgba(52,211,153,0.14)",
  warning: "#FBBF24",
  warningBg: "rgba(251,191,36,0.14)",
  error: "#F87171",
  errorBg: "rgba(248,113,113,0.14)",
  inputBg: darkComponent.base,
  inputBorder: darkComponent.border,
  modalOverlay: "rgba(0,0,0,0.58)",
  statusBar: "light",
  heroCard: darkComponent.elevated,
  heroCardAccent: darkComponent.accent,
  heroText: "#FAF8FF",
  heroTextMuted: "rgba(214,208,242,0.82)",
  heroBadgeBg: "rgba(149,136,216,0.18)",
  heroButtonBg: darkComponent.highlight,
  heroButtonText: darkComponent.onInteractive,
  serviceTileBg: darkComponent.base,
  serviceTileBorder: darkComponent.border,
  serviceTileIcon: "#C8BEF5",
  navActive: "#B8AEF0",
  navInactive: "#8E86B8",
};

type ThemeContextType = {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "@tbhon_theme_mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") {
          setModeState(stored);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode).catch(() => {});
  }, []);

  const isDark = useMemo(() => {
    if (mode === "system") {
      return systemScheme === "dark";
    }
    return mode === "dark";
  }, [mode, systemScheme]);

  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  const toggleDarkMode = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  const value = useMemo(
    () => ({ mode, isDark, colors, setMode, toggleDarkMode }),
    [mode, isDark, colors, setMode, toggleDarkMode],
  );

  if (!loaded) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export { lightColors, darkColors, darkComponent };
