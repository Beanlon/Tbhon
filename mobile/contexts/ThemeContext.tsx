import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "light" | "dark" | "system";

/**
 * TBhon Palette:
 * Deep Navy: #0C1E4A - darkest background
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
  background: tbhonPalette.deepNavy,
  surface: tbhonPalette.navy,
  surfaceAlt: tbhonPalette.indigo,
  card: tbhonPalette.navy,
  cardBorder: tbhonPalette.indigo,
  text: "#FFFFFF",
  textSecondary: "#F2EDFF",
  textMuted: "#D8D0FF",
  primary: tbhonPalette.softViolet,
  primaryLight: tbhonPalette.indigo,
  accent: tbhonPalette.violet,
  border: tbhonPalette.indigo,
  borderLight: tbhonPalette.navy,
  success: "#34D399",
  successBg: "rgba(52,211,153,0.15)",
  warning: "#FBBF24",
  warningBg: "rgba(251,191,36,0.15)",
  error: "#F87171",
  errorBg: "rgba(248,113,113,0.15)",
  inputBg: tbhonPalette.navy,
  inputBorder: tbhonPalette.indigo,
  modalOverlay: "rgba(0,0,0,0.6)",
  statusBar: "light",
  heroCard: tbhonPalette.indigo,
  heroCardAccent: tbhonPalette.softViolet,
  heroText: "#FFFFFF",
  heroTextMuted: tbhonPalette.lavender,
  heroBadgeBg: "rgba(255,255,255,0.12)",
  heroButtonBg: tbhonPalette.indigo,
  heroButtonText: "#FFFFFF",
  serviceTileBg: tbhonPalette.navy,
  serviceTileBorder: tbhonPalette.indigo,
  serviceTileIcon: "#D8D0FF",
  navActive: tbhonPalette.softViolet,
  navInactive: "#D8D0FF",
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

export { lightColors, darkColors };
