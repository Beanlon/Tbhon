import React, { useState, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authFormTk as tk } from "../../constants/authFormTheme";
import { palette } from "../../constants/palette";

export type AuthFormFieldProps = {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  secureTextEntry?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  editable?: boolean;
  onPress?: () => void;
  error?: string;
  touched?: boolean;
  containerStyle?: ViewStyle;
  onBlur?: () => void;
  autoCapitalize?: React.ComponentProps<typeof TextInput>["autoCapitalize"];
  autoCorrect?: boolean;
  autoComplete?: React.ComponentProps<typeof TextInput>["autoComplete"];
  textContentType?: React.ComponentProps<typeof TextInput>["textContentType"];
  spellCheck?: boolean;
};

export function AuthFormField({
  label,
  value,
  onChange,
  placeholder,
  icon,
  suffix,
  keyboardType,
  secureTextEntry,
  inputRef,
  editable = true,
  onPress,
  error,
  touched,
  containerStyle,
  onBlur: onBlurProp,
  autoCapitalize,
  autoCorrect,
  autoComplete,
  textContentType,
  spellCheck,
}: AuthFormFieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = touched && !!error;
  const isValid = touched && !error && value.length > 0;

  const labelColor = hasError ? tk.error : tk.fieldLabel;
  const borderColor = hasError
    ? tk.errorBorder
    : focused
      ? tk.violetLight
      : isValid
        ? tk.successBorder
        : tk.border;
  const backgroundColor = hasError
    ? tk.errorBg
    : focused
      ? tk.fieldFocusedBg
      : isValid
        ? tk.successBg
        : tk.surface;

  return (
    <View style={[authFormFieldStyles.fieldContainer, containerStyle]} collapsable={false}>
      {label ? (
        <Text style={[authFormFieldStyles.fieldLabel, { color: labelColor }]}>
          {label}
        </Text>
      ) : null}
      <Pressable
        onPress={onPress}
        style={[
          authFormFieldStyles.fieldBox,
          { borderColor, backgroundColor },
          focused && authFormFieldStyles.fieldBoxFocused,
          !editable && authFormFieldStyles.fieldBoxDisabled,
        ]}
      >
        {icon ? <View style={authFormFieldStyles.fieldIcon}>{icon}</View> : null}
        <TextInput
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={tk.textMuted}
          selectionColor={tk.selectionColor}
          cursorColor={tk.cursorColor}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          editable={editable}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          spellCheck={spellCheck}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlurProp?.();
          }}
          onChangeText={onChange}
          style={[
            authFormFieldStyles.fieldInput,
            { color: tk.textPrimary },
            icon ? { paddingLeft: 6 } : undefined,
            suffix || isValid ? { paddingRight: 6 } : undefined,
          ]}
          textAlignVertical="center"
          pointerEvents={editable ? "auto" : "none"}
        />
        {isValid && !suffix ? (
          <View style={authFormFieldStyles.fieldSuffix}>
            <Ionicons name="checkmark-circle" size={20} color={tk.success} />
          </View>
        ) : suffix ? (
          <View style={authFormFieldStyles.fieldSuffix}>{suffix}</View>
        ) : null}
      </Pressable>
      {hasError ? (
        <Text style={[authFormFieldStyles.errorText, { color: tk.error }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export const authFormFieldStyles = StyleSheet.create({
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    color: tk.fieldLabel,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  fieldBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tk.border,
    backgroundColor: tk.surface,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 14,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  fieldBoxFocused: {
    borderColor: tk.violetLight,
    backgroundColor: tk.fieldFocusedBg,
    shadowColor: palette.softViolet,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 3,
  },
  fieldBoxDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  fieldInput: {
    height: 50,
    paddingVertical: 0,
    fontSize: 15,
    flex: 1,
  },
  fieldIcon: {
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  fieldSuffix: {
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 12,
    marginTop: 6,
    fontWeight: "500",
  },
  passwordToggle: {
    justifyContent: "center",
    alignItems: "center",
    height: 50,
    width: 34,
  },
});
