import { StyleSheet } from "react-native";
import { authFormTk as tk } from "./authFormTheme";

/** Primary CTA — shared by sign-up and log-in screens. */
export const authFormButtonStyles = StyleSheet.create({
  primaryButton: {
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: tk.primaryBtnBg,
    borderRadius: 24,
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 28,
    overflow: "hidden",
  },
  primaryButtonText: {
    color: tk.primaryBtnText,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
