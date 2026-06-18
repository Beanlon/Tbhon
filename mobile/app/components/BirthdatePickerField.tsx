import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BIRTHDATE_MIN,
  birthdateMaximum,
  birthdateStringToLocalDate,
  defaultSignupBirthdateDate,
  formatBirthdateDisplayFromDate,
} from "../../utils/signupHelpers";

const IOS_BIRTHDATE_SHEET_OFFSET = 340;

export type BirthdatePickerFieldColors = {
  inputBorder: string;
  inputBg: string;
  text: string;
  textMuted: string;
  card: string;
  border: string;
  primary: string;
  modalOverlay: string;
};

type BirthdatePickerFieldProps = {
  value: string;
  onChange: (displayValue: string) => void;
  placeholder?: string;
  colors: BirthdatePickerFieldColors;
  disabled?: boolean;
  isDark?: boolean;
};

export function BirthdatePickerField({
  value,
  onChange,
  placeholder = "MM / DD / YYYY",
  colors,
  disabled = false,
  isDark = false,
}: BirthdatePickerFieldProps) {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => defaultSignupBirthdateDate());
  const iosBackdropOpacity = useRef(new Animated.Value(0)).current;
  const iosSheetY = useRef(new Animated.Value(IOS_BIRTHDATE_SHEET_OFFSET)).current;

  const animateIosOpen = useCallback(() => {
    Animated.parallel([
      Animated.timing(iosBackdropOpacity, {
        toValue: 0.45,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(iosSheetY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [iosBackdropOpacity, iosSheetY]);

  const animateIosClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(iosBackdropOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(iosSheetY, {
        toValue: IOS_BIRTHDATE_SHEET_OFFSET,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setPickerOpen(false);
    });
  }, [iosBackdropOpacity, iosSheetY]);

  const openPicker = useCallback(() => {
    if (disabled) return;
    Keyboard.dismiss();
    const initial = birthdateStringToLocalDate(value) ?? defaultSignupBirthdateDate();
    setPickerDate(initial);
    if (Platform.OS === "ios") {
      iosBackdropOpacity.setValue(0);
      iosSheetY.setValue(IOS_BIRTHDATE_SHEET_OFFSET);
    }
    setPickerOpen(true);
  }, [disabled, value, iosBackdropOpacity, iosSheetY]);

  useEffect(() => {
    if (pickerOpen && Platform.OS === "ios") {
      animateIosOpen();
    }
  }, [pickerOpen, animateIosOpen]);

  const onAndroidChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      setPickerOpen(false);
      if (event.type === "set" && date) {
        onChange(formatBirthdateDisplayFromDate(date));
      }
    },
    [onChange],
  );

  const confirmIos = useCallback(() => {
    onChange(formatBirthdateDisplayFromDate(pickerDate));
    animateIosClose();
  }, [pickerDate, onChange, animateIosClose]);

  return (
    <>
      <Pressable onPress={openPicker} disabled={disabled} accessibilityRole="button">
        <View pointerEvents="none">
          <TextInput
            value={value}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            editable={false}
            className="rounded-xl border px-4 py-3.5 pr-12 text-base"
            style={{
              borderColor: colors.inputBorder,
              backgroundColor: colors.inputBg,
              color: colors.text,
              opacity: disabled ? 0.65 : 1,
            }}
          />
          <View className="absolute bottom-0 right-4 top-0 justify-center">
            <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
          </View>
        </View>
      </Pressable>

      {pickerOpen && Platform.OS === "android" ? (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          onChange={onAndroidChange}
          minimumDate={BIRTHDATE_MIN}
          maximumDate={birthdateMaximum()}
        />
      ) : null}

      <Modal
        visible={pickerOpen && Platform.OS === "ios"}
        transparent
        animationType="none"
        onRequestClose={animateIosClose}
      >
        <View style={styles.modalRoot}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: colors.modalOverlay, opacity: iosBackdropOpacity },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={animateIosClose} />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateY: iosSheetY }],
              },
            ]}
          >
            <View
              style={[
                styles.sheetHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <Pressable onPress={animateIosClose} hitSlop={8}>
                <Text style={{ fontSize: 16, color: colors.textMuted }}>Cancel</Text>
              </Pressable>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
                Date of birth
              </Text>
              <Pressable onPress={confirmIos} hitSlop={8}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.primary }}>
                  Done
                </Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={pickerDate}
              mode="date"
              display="spinner"
              themeVariant={isDark ? "dark" : "light"}
              onChange={(_, d) => {
                if (d) setPickerDate(d);
              }}
              minimumDate={BIRTHDATE_MIN}
              maximumDate={birthdateMaximum()}
            />
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sheetHeader: {
    marginBottom: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
