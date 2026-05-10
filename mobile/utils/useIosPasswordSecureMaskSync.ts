import { type RefObject, useLayoutEffect } from "react";
import { Platform, type TextInput } from "react-native";

/**
 * iOS Password AutoFill ("Use Strong Password") can populate the UITextField before JS
 * props fully reconcile, so masking can disagree with React until the next update.
 * Re-apply native `secureTextEntry` synchronously whenever visibility or text changes.
 */
export function useIosPasswordSecureMaskSync(
  inputRef: RefObject<TextInput | null>,
  passwordVisible: boolean,
  value: string,
): void {
  useLayoutEffect(() => {
    if (Platform.OS !== "ios") return;
    inputRef.current?.setNativeProps({ secureTextEntry: !passwordVisible });
  }, [passwordVisible, value, inputRef]);
}
