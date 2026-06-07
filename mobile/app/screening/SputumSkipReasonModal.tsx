import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  SPUTUM_SKIP_MODAL_MESSAGE,
  SPUTUM_SKIP_MODAL_TITLE,
  SPUTUM_SKIP_REASONS,
  type SputumSkipReason,
} from "../../constants/iotScreening";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (reason: SputumSkipReason) => void;
};

export function SputumSkipReasonModal({ visible, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        className="flex-1 justify-end bg-black/55"
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable
          className="rounded-t-3xl border border-white/10 bg-[#0B1530] px-5 pb-8 pt-5"
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

          <View className="gap-2">
            {SPUTUM_SKIP_REASONS.map((reason) => (
              <Pressable
                key={reason}
                onPress={() => onConfirm(reason)}
                className="rounded-xl border border-white/12 bg-white/6 px-4 py-3.5 active:bg-white/10"
                accessibilityRole="button"
              >
                <Text className="text-sm font-semibold leading-5 text-white">{reason}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onCancel}
            className="mt-4 items-center rounded-xl py-3 active:opacity-80"
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-white/55">Cancel — return to smear capture</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
