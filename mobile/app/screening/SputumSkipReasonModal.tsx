import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  SPUTUM_SKIP_MODAL_MESSAGE,
  SPUTUM_SKIP_MODAL_TITLE,
  SPUTUM_SKIP_REASON_MAX_LENGTH,
  SPUTUM_SKIP_REASON_PLACEHOLDER,
  SPUTUM_SKIP_REASON_SUGGESTIONS,
} from "../../constants/iotScreening";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  initialText?: string;
  onDraftChange?: (reason: string) => void;
};

export function SputumSkipReasonModal({
  visible,
  onCancel,
  onConfirm,
  initialText = "",
  onDraftChange,
}: Props) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (visible) setText(initialText);
  }, [initialText, visible]);

  const updateText = (value: string) => {
    setText(value);
    onDraftChange?.(value);
  };

  const trimmed = text.trim();
  const canConfirm = trimmed.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(trimmed.slice(0, SPUTUM_SKIP_REASON_MAX_LENGTH));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <Pressable
          className="flex-1 justify-end bg-black/55"
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Pressable
            className="max-h-[85%] rounded-t-3xl border border-white/10 bg-[#0B1530] px-5 pb-8 pt-5"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-4 flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-lg font-bold text-white">{SPUTUM_SKIP_MODAL_TITLE}</Text>
                <Text className="mt-2 text-sm leading-5 text-white/65">{SPUTUM_SKIP_MODAL_MESSAGE}</Text>
              </View>
              <Pressable
                onPress={onCancel}
                className="size-9 items-center justify-center rounded-full bg-white/8 active:bg-white/12"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.75)" />
              </Pressable>
            </View>

            <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-white/50">Reason</Text>
            <TextInput
              value={text}
              onChangeText={updateText}
              placeholder={SPUTUM_SKIP_REASON_PLACEHOLDER}
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
              numberOfLines={3}
              maxLength={SPUTUM_SKIP_REASON_MAX_LENGTH}
              className="mb-1 min-h-[88px] rounded-xl border border-white/12 bg-white/6 px-4 py-3 text-sm leading-5 text-white"
              style={{ textAlignVertical: "top" }}
              accessibilityLabel="Reason for no smear image"
            />
            <Text className="mb-4 text-right text-xs text-white/40">
              {text.length}/{SPUTUM_SKIP_REASON_MAX_LENGTH}
            </Text>

            <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-white/50">
              Quick suggestions (optional)
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-4"
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
              keyboardShouldPersistTaps="handled"
            >
              {SPUTUM_SKIP_REASON_SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => updateText(suggestion)}
                  className="rounded-full border border-white/12 bg-white/6 px-3.5 py-2 active:bg-white/10"
                  accessibilityRole="button"
                  accessibilityLabel={`Use suggestion: ${suggestion}`}
                >
                  <Text className="text-xs font-semibold text-white/85">{suggestion}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={handleConfirm}
              disabled={!canConfirm}
              className="mb-3 items-center rounded-xl py-3.5 active:opacity-90"
              style={{
                backgroundColor: canConfirm ? "rgba(91, 79, 196, 0.95)" : "rgba(255,255,255,0.08)",
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
            >
              <Text
                className="text-sm font-bold"
                style={{ color: canConfirm ? "#FFFFFF" : "rgba(255,255,255,0.35)" }}
              >
                Continue without smear
              </Text>
            </Pressable>

            <Pressable
              onPress={onCancel}
              className="items-center rounded-xl py-3 active:opacity-80"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-white/55">Cancel — return to review</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
