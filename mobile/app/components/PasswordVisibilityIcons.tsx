import React from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type PasswordVisibilityIconProps = {
  /** When true, the password is masked (secure entry on). */
  secureTextEntry: boolean;
  onToggle: () => void;
};

/** Eye / eye-off control for password fields; parent should be `relative`. */
export function PasswordVisibilityIcon({
  secureTextEntry,
  onToggle,
}: PasswordVisibilityIconProps) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={secureTextEntry ? "Show password" : "Hide password"}
      className="absolute right-0 top-0 bottom-0 z-[60] justify-center pr-3 pl-2"
      android_ripple={{ color: "#E0E0E0", borderless: true }}
    >
      <Ionicons
        name={secureTextEntry ? "eye-off-outline" : "eye-outline"}
        size={22}
        color="#8FA3B1"
      />
    </Pressable>
  );
}
