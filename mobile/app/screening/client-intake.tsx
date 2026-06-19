import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CLIENT_RECORD_SUBTITLE,
  CLIENT_RECORD_TITLE,
  FACILITY_ACCOUNT_LABEL,
} from "../../constants/accountModel";
import { useTheme } from "../../contexts/ThemeContext";
import {
  ApiError,
  createScreeningDraft,
  putScreeningClient,
  type ScreeningClientPayload,
} from "../../services/backendApi";
import {
  formatClientAddress,
  formatGovernmentId,
  formatClientFullName,
} from "../../utils/clientDisplay";
import { ageFromIsoBirthdate } from "../../utils/profileDisplay";
import {
  normalizeGenderForApi,
  normalizePhilippineMobile,
  signupBirthdateToIso,
} from "../../utils/signupHelpers";
import {
  CLIENT_INTAKE_MAX,
  sanitizeClientIntakeInput,
  type ClientIntakeInputKind,
} from "../../utils/clientIntakeInput";
import { PROFILE_GENDER_OPTIONS } from "../../constants/profileGender";
import { BirthdatePickerField } from "../components/BirthdatePickerField";

const GOVERNMENT_ID_OPTIONS = [
  { key: "national_id", label: "National ID" },
  { key: "passport", label: "Passport" },
  { key: "drivers_license", label: "Driver's license" },
  { key: "other", label: "Other" },
] as const;

const STEPS = [
  {
    id: "identity",
    title: "Identity",
    subtitle: "Legal name and demographics",
    icon: "person-outline" as const,
  },
  {
    id: "address",
    title: "Current address",
    subtitle: "Where the patient currently lives",
    icon: "home-outline" as const,
  },
  {
    id: "contact",
    title: "Contact number",
    subtitle: "Primary phone for follow-up",
    icon: "call-outline" as const,
  },
  {
    id: "emergency",
    title: "Emergency contact",
    subtitle: "Optional — person to reach in an emergency",
    icon: "people-outline" as const,
  },
  {
    id: "id",
    title: "Government ID",
    subtitle: "Optional — national ID or passport",
    icon: "card-outline" as const,
  },
  {
    id: "review",
    title: "Review & confirm",
    subtitle: "Verify details before starting the session",
    icon: "checkmark-circle-outline" as const,
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];
const STEP_COUNT = STEPS.length;

type FormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  birthdate: string;
  gender: string | null;
  street: string;
  barangay: string;
  city: string;
  contactNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  governmentIdType: string | null;
  governmentIdNumber: string;
};

const EMPTY_FORM: FormState = {
  firstName: "",
  middleName: "",
  lastName: "",
  birthdate: "",
  gender: null,
  street: "",
  barangay: "",
  city: "",
  contactNumber: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  governmentIdType: null,
  governmentIdNumber: "",
};

function normalizeClientPhone(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return normalizePhilippineMobile(trimmed) ?? (trimmed.replace(/\D/g, "").length >= 7 ? trimmed : undefined);
}

function optionalField(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildPayload(form: FormState): ScreeningClientPayload | { error: string } {
  const fn = form.firstName.trim();
  const ln = form.lastName.trim();
  if (!fn || !ln) {
    return { error: "First and last name are required." };
  }

  const birthIso = signupBirthdateToIso(form.birthdate);
  if (!birthIso) {
    return { error: "Enter a valid birthdate (MM / DD / YYYY)." };
  }

  const age = ageFromIsoBirthdate(birthIso);
  if (age !== null && age < 13) {
    return { error: "Person screened must be at least 13 years old." };
  }

  if (!form.gender) {
    return { error: "Select sex for the patient record." };
  }

  const phone = normalizeClientPhone(form.contactNumber);
  if (!phone) {
    return { error: "Enter a valid contact number." };
  }

  const idNumber = form.governmentIdNumber.trim();
  if (idNumber.length > 0 && !form.governmentIdType) {
    return { error: "Select an ID type when entering a government ID or passport number." };
  }

  const ecPhone = normalizeClientPhone(form.emergencyContactPhone);
  if (form.emergencyContactPhone.trim() && !ecPhone) {
    return { error: "Enter a valid emergency contact phone number." };
  }

  const mn = form.middleName.trim();
  return {
    firstName: fn,
    ...(mn.length > 0 ? { middleName: mn } : {}),
    lastName: ln,
    birthdate: birthIso,
    gender: normalizeGenderForApi(form.gender),
    ...(optionalField(form.street) ? { street: optionalField(form.street) } : {}),
    ...(optionalField(form.barangay) ? { barangay: optionalField(form.barangay) } : {}),
    ...(optionalField(form.city) ? { city: optionalField(form.city) } : {}),
    contactNumber: phone,
    ...(optionalField(form.emergencyContactName)
      ? { emergencyContactName: optionalField(form.emergencyContactName) }
      : {}),
    ...(ecPhone ? { emergencyContactPhone: ecPhone } : {}),
    ...(optionalField(form.emergencyContactRelation)
      ? { emergencyContactRelation: optionalField(form.emergencyContactRelation) }
      : {}),
    ...(form.governmentIdType ? { governmentIdType: form.governmentIdType } : {}),
    ...(idNumber.length > 0 ? { governmentIdNumber: idNumber } : {}),
  };
}

function validateStep(stepId: StepId, form: FormState): string | null {
  switch (stepId) {
    case "identity": {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        return "First and last name are required.";
      }
      const birthIso = signupBirthdateToIso(form.birthdate);
      if (!birthIso) return "Enter a valid birthdate (MM / DD / YYYY).";
      const age = ageFromIsoBirthdate(birthIso);
      if (age !== null && age < 13) return "Person screened must be at least 13 years old.";
      if (!form.gender) return "Select sex for the patient record.";
      return null;
    }
    case "address":
      return null;
    case "contact":
      return normalizeClientPhone(form.contactNumber) ? null : "Enter a valid contact number.";
    case "emergency": {
      if (!form.emergencyContactPhone.trim()) return null;
      return normalizeClientPhone(form.emergencyContactPhone)
        ? null
        : "Enter a valid emergency contact phone number.";
    }
    case "id": {
      const idNumber = form.governmentIdNumber.trim();
      if (idNumber.length > 0 && !form.governmentIdType) {
        return "Select an ID type when entering a number.";
      }
      return null;
    }
    case "review": {
      const payload = buildPayload(form);
      return "error" in payload ? payload.error : null;
    }
    default:
      return null;
  }
}

export default function ClientIntakeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ from?: string; sessionId?: string }>();
  const attachSessionId =
    typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : "";
  const isAttachMode = attachSessionId.length > 0;
  const isLateAttach =
    isAttachMode && (params.from === "details" || params.from === "review");

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const currentStep = STEPS[stepIndex];
  const progressPct = Math.min(100, Math.round(((stepIndex + 1) / STEP_COUNT) * 100));
  const isReview = currentStep.id === "review";
  const isOptionalStep = currentStep.id === "address" || currentStep.id === "emergency" || currentStep.id === "id";

  const patchForm = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const goBack = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex((i) => i - 1);
  };

  const goNext = () => {
    const error = validateStep(currentStep.id, form);
    if (error) {
      Alert.alert(currentStep.title, error);
      return;
    }
    if (stepIndex < STEP_COUNT - 1) {
      setStepIndex((i) => i + 1);
    }
  };

  const handleSubmit = async () => {
    const payload = buildPayload(form);
    if ("error" in payload) {
      Alert.alert(CLIENT_RECORD_TITLE, payload.error);
      return;
    }

    setSubmitting(true);
    try {
      if (isAttachMode) {
        await putScreeningClient(attachSessionId, payload);
        if (params.from === "details") {
          router.replace({
            pathname: "/screening/details",
            params: { sessionId: attachSessionId },
          } as any);
        } else {
          router.replace({
            pathname: "/screening/checklist",
            params: { sessionId: attachSessionId },
          } as any);
        }
        return;
      }
      const { sessionId } = await createScreeningDraft();
      await putScreeningClient(sessionId, payload);
      router.replace({
        pathname: "/screening/checklist",
        params: {
          sessionId,
          from: typeof params.from === "string" ? params.from : "client-intake",
        },
      } as any);
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Could not save patient details.";
      Alert.alert(CLIENT_RECORD_TITLE, message);
    } finally {
      setSubmitting(false);
    }
  };

  const reviewPayload = useMemo(() => {
    const payload = buildPayload(form);
    return "error" in payload ? null : payload;
  }, [form]);

  const inputStyle = {
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    color: colors.text,
  };

  return (
    <>
      <StatusBar style={colors.statusBar} translucent backgroundColor="transparent" />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top", "right", "bottom", "left"]}>
        <View className="flex-row items-center justify-between border-b px-4 pb-3.5 pt-2 sm:px-5" style={{ borderColor: colors.border }}>
          <Pressable
            onPress={goBack}
            className="size-11 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surfaceAlt }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>

          <View className="min-w-0 flex-1 items-center px-2">
            <Text className="text-center text-sm font-bold sm:text-base" style={{ color: colors.text }}>
              {CLIENT_RECORD_TITLE}
            </Text>
            <Text className="mt-0.5 text-center text-xs font-semibold sm:text-sm" style={{ color: colors.textMuted }}>
              {isLateAttach
                ? "Attach to session"
                : `Step ${stepIndex + 1} of ${STEP_COUNT} · ${FACILITY_ACCOUNT_LABEL}`}
            </Text>
          </View>

          <View className="size-11" />
        </View>

        <View className="h-1.5 w-full" style={{ backgroundColor: colors.surfaceAlt }}>
          <View className="h-1.5 rounded-full" style={{ width: `${progressPct}%`, backgroundColor: colors.primary }} />
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            className="flex-1 px-5"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <View className="pb-2 pt-6">
              <View className="mb-4 flex-row items-center gap-3">
                <View className="size-11 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.primaryLight }}>
                  <Ionicons name={currentStep.icon} size={22} color={colors.primary} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-xl font-bold leading-7" style={{ color: colors.text }}>
                    {currentStep.title}
                  </Text>
                  <Text className="mt-1 text-sm leading-5" style={{ color: colors.textMuted }}>
                    {currentStep.subtitle}
                  </Text>
                </View>
              </View>

              {stepIndex === 0 ? (
                <View
                  className="mb-2 rounded-2xl border px-4 py-3"
                  style={{ borderColor: colors.border, backgroundColor: colors.primaryLight }}
                >
                  <Text className="text-sm leading-6" style={{ color: colors.textSecondary }}>
                    {CLIENT_RECORD_SUBTITLE}
                  </Text>
                </View>
              ) : null}
            </View>

            {currentStep.id === "identity" ? (
              <StepCard colors={colors}>
                <Field label="First name" colors={colors}>
                  <IntakeTextInput
                    kind="name"
                    value={form.firstName}
                    onChangeValue={(v) => patchForm({ firstName: v })}
                    maxLength={CLIENT_INTAKE_MAX.name}
                    placeholder="First name"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="words"
                    textContentType="givenName"
                  />
                </Field>
                <Field label="Middle name (optional)" colors={colors}>
                  <IntakeTextInput
                    kind="name"
                    value={form.middleName}
                    onChangeValue={(v) => patchForm({ middleName: v })}
                    maxLength={CLIENT_INTAKE_MAX.name}
                    placeholder="Middle name"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="words"
                    textContentType="middleName"
                  />
                </Field>
                <Field label="Last name" colors={colors}>
                  <IntakeTextInput
                    kind="name"
                    value={form.lastName}
                    onChangeValue={(v) => patchForm({ lastName: v })}
                    maxLength={CLIENT_INTAKE_MAX.name}
                    placeholder="Last name"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="words"
                    textContentType="familyName"
                  />
                </Field>
                <Field label="Date of birth" colors={colors}>
                  <BirthdatePickerField
                    value={form.birthdate}
                    onChange={(v) => patchForm({ birthdate: v })}
                    placeholder="MM / DD / YYYY"
                    colors={colors}
                    isDark={isDark}
                  />
                </Field>
                <Field label="Sex" colors={colors}>
                  <ChipRow
                    options={PROFILE_GENDER_OPTIONS}
                    value={form.gender}
                    onChange={(gender) => patchForm({ gender: gender || null })}
                    colors={colors}
                  />
                </Field>
              </StepCard>
            ) : null}

            {currentStep.id === "address" ? (
              <StepCard colors={colors}>
                <OptionalHint colors={colors}>
                  All address fields are optional. Leave blank if the patient prefers not to share or details are unknown.
                </OptionalHint>
                <Field label="Street / house no." colors={colors}>
                  <IntakeTextInput
                    kind="address"
                    value={form.street}
                    onChangeValue={(v) => patchForm({ street: v })}
                    maxLength={CLIENT_INTAKE_MAX.address}
                    placeholder="Street, house or unit number"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="words"
                    textContentType="streetAddressLine1"
                  />
                </Field>
                <Field label="Barangay" colors={colors}>
                  <IntakeTextInput
                    kind="address"
                    value={form.barangay}
                    onChangeValue={(v) => patchForm({ barangay: v })}
                    maxLength={CLIENT_INTAKE_MAX.barangay}
                    placeholder="Barangay"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="words"
                  />
                </Field>
                <Field label="City / municipality" colors={colors}>
                  <IntakeTextInput
                    kind="address"
                    value={form.city}
                    onChangeValue={(v) => patchForm({ city: v })}
                    maxLength={CLIENT_INTAKE_MAX.city}
                    placeholder="City or municipality"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="words"
                    textContentType="addressCity"
                  />
                </Field>
              </StepCard>
            ) : null}

            {currentStep.id === "contact" ? (
              <StepCard colors={colors}>
                <Field label="Mobile number" colors={colors}>
                  <IntakeTextInput
                    kind="phone"
                    value={form.contactNumber}
                    onChangeValue={(v) => patchForm({ contactNumber: v })}
                    maxLength={CLIENT_INTAKE_MAX.phone}
                    placeholder="09171234567"
                    colors={colors}
                    style={inputStyle}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                  />
                </Field>
                <Text className="text-sm leading-5" style={{ color: colors.textMuted }}>
                  Used for follow-up or referral coordination. This is required before starting the session.
                </Text>
              </StepCard>
            ) : null}

            {currentStep.id === "emergency" ? (
              <StepCard colors={colors}>
                <OptionalHint colors={colors}>
                  You can skip this step if no emergency contact is available right now.
                </OptionalHint>
                <Field label="Full name" colors={colors}>
                  <IntakeTextInput
                    kind="name"
                    value={form.emergencyContactName}
                    onChangeValue={(v) => patchForm({ emergencyContactName: v })}
                    maxLength={CLIENT_INTAKE_MAX.name}
                    placeholder="Emergency contact name"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="words"
                    textContentType="name"
                  />
                </Field>
                <Field label="Relationship" colors={colors}>
                  <IntakeTextInput
                    kind="name"
                    value={form.emergencyContactRelation}
                    onChangeValue={(v) => patchForm({ emergencyContactRelation: v })}
                    maxLength={60}
                    placeholder="e.g. Spouse, parent, sibling"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="words"
                  />
                </Field>
                <Field label="Phone number" colors={colors}>
                  <IntakeTextInput
                    kind="phone"
                    value={form.emergencyContactPhone}
                    onChangeValue={(v) => patchForm({ emergencyContactPhone: v })}
                    maxLength={CLIENT_INTAKE_MAX.phone}
                    placeholder="09171234567"
                    colors={colors}
                    style={inputStyle}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                  />
                </Field>
              </StepCard>
            ) : null}

            {currentStep.id === "id" ? (
              <StepCard colors={colors}>
                <OptionalHint colors={colors}>
                  Record a government-issued ID or passport if available.
                </OptionalHint>
                <Field label="ID type" colors={colors}>
                  <ChipRow
                    options={GOVERNMENT_ID_OPTIONS.map((o) => o.label)}
                    value={
                      form.governmentIdType
                        ? GOVERNMENT_ID_OPTIONS.find((o) => o.key === form.governmentIdType)?.label ?? null
                        : null
                    }
                    onChange={(label) => {
                      if (!label) {
                        patchForm({ governmentIdType: null });
                        return;
                      }
                      const match = GOVERNMENT_ID_OPTIONS.find((o) => o.label === label);
                      patchForm({ governmentIdType: match?.key ?? null });
                    }}
                    colors={colors}
                  />
                </Field>
                <Field label="ID or passport number" colors={colors}>
                  <IntakeTextInput
                    kind="id"
                    value={form.governmentIdNumber}
                    onChangeValue={(v) => patchForm({ governmentIdNumber: v })}
                    maxLength={CLIENT_INTAKE_MAX.id}
                    placeholder="Number on the ID document"
                    colors={colors}
                    style={inputStyle}
                    autoCapitalize="characters"
                  />
                </Field>
              </StepCard>
            ) : null}

            {currentStep.id === "review" && reviewPayload ? (
              <View className="gap-3">
                <ReviewSection title="Identity" colors={colors} onEdit={() => setStepIndex(0)}>
                  <ReviewRow label="Name" value={formatClientFullName(reviewPayload)} colors={colors} />
                  <ReviewRow
                    label="Date of birth"
                    value={`${reviewPayload.birthdate}${
                      ageFromIsoBirthdate(reviewPayload.birthdate) !== null
                        ? ` (${ageFromIsoBirthdate(reviewPayload.birthdate)} yrs)`
                        : ""
                    }`}
                    colors={colors}
                  />
                  <ReviewRow label="Sex" value={reviewPayload.gender} colors={colors} />
                </ReviewSection>

                <ReviewSection title="Address" colors={colors} onEdit={() => setStepIndex(1)}>
                  <ReviewRow
                    label="Current address"
                    value={formatClientAddress(reviewPayload) ?? "Not provided"}
                    colors={colors}
                    muted={!formatClientAddress(reviewPayload)}
                  />
                </ReviewSection>

                <ReviewSection title="Contact" colors={colors} onEdit={() => setStepIndex(2)}>
                  <ReviewRow label="Phone" value={reviewPayload.contactNumber} colors={colors} />
                </ReviewSection>

                <ReviewSection title="Emergency contact" colors={colors} onEdit={() => setStepIndex(3)}>
                  {reviewPayload.emergencyContactName ||
                  reviewPayload.emergencyContactRelation ||
                  reviewPayload.emergencyContactPhone ? (
                    <>
                      <ReviewRow
                        label="Name"
                        value={reviewPayload.emergencyContactName ?? "—"}
                        colors={colors}
                        muted={!reviewPayload.emergencyContactName}
                      />
                      <ReviewRow
                        label="Relationship"
                        value={reviewPayload.emergencyContactRelation ?? "—"}
                        colors={colors}
                        muted={!reviewPayload.emergencyContactRelation}
                      />
                      <ReviewRow
                        label="Phone"
                        value={reviewPayload.emergencyContactPhone ?? "—"}
                        colors={colors}
                        muted={!reviewPayload.emergencyContactPhone}
                      />
                    </>
                  ) : (
                    <ReviewRow label="Status" value="Not provided" colors={colors} muted />
                  )}
                </ReviewSection>

                <ReviewSection title="Government ID" colors={colors} onEdit={() => setStepIndex(4)}>
                  <ReviewRow
                    label="Document"
                    value={
                      formatGovernmentId({
                        ...reviewPayload,
                        clientId: "",
                        sessionId: "",
                      }) ?? "Not provided"
                    }
                    colors={colors}
                    muted={!formatGovernmentId({ ...reviewPayload, clientId: "", sessionId: "" })}
                  />
                </ReviewSection>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

        <View className="border-t px-5 pb-8 pt-4" style={{ borderColor: colors.border }}>
          {isReview ? (
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitting}
              className="items-center justify-center rounded-2xl py-4"
              style={{ backgroundColor: submitting ? colors.surfaceAlt : colors.primary }}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-bold text-white">
                {isLateAttach ? "Save patient details" : "Continue to checklist"}
              </Text>
              )}
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={goNext}
                className="items-center justify-center rounded-2xl py-4"
                style={{ backgroundColor: colors.primary }}
                accessibilityRole="button"
              >
                <Text className="text-base font-bold text-white">Continue</Text>
              </Pressable>
              {isOptionalStep ? (
                <Pressable
                  onPress={goNext}
                  className="mt-3 items-center justify-center py-2"
                  accessibilityRole="button"
                  accessibilityLabel="Skip this step"
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.textMuted }}>
                    Skip this step
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

function IntakeTextInput({
  kind,
  value,
  onChangeValue,
  colors,
  style,
  ...rest
}: {
  kind: ClientIntakeInputKind;
  value: string;
  onChangeValue: (value: string) => void;
  colors: { textMuted: string };
  style: { borderColor: string; backgroundColor: string; color: string };
} & Omit<ComponentProps<typeof TextInput>, "value" | "onChangeText" | "style">) {
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChangeValue(sanitizeClientIntakeInput(kind, text))}
      placeholderTextColor={colors.textMuted}
      autoCorrect={false}
      className="rounded-xl border px-4 py-3.5 text-base"
      style={style}
      {...rest}
    />
  );
}

function StepCard({
  colors,
  children,
}: {
  colors: { card: string; cardBorder: string };
  children: ReactNode;
}) {
  return (
    <View
      className="rounded-2xl border p-4"
      style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
    >
      {children}
    </View>
  );
}

function OptionalHint({
  colors,
  children,
}: {
  colors: { primaryLight: string; textSecondary: string; border: string };
  children: ReactNode;
}) {
  return (
    <View
      className="mb-4 rounded-xl border px-3.5 py-3"
      style={{ borderColor: colors.border, backgroundColor: colors.primaryLight }}
    >
      <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
        {children}
      </Text>
    </View>
  );
}

function ReviewSection({
  title,
  colors,
  onEdit,
  children,
}: {
  title: string;
  colors: { card: string; cardBorder: string; primary: string; text: string };
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <View
      className="rounded-2xl border p-4"
      style={{ borderColor: colors.cardBorder, backgroundColor: colors.card }}
    >
      <View className="mb-3 flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold uppercase tracking-wide" style={{ color: colors.text }}>
          {title}
        </Text>
        <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
          <Text className="text-sm font-bold" style={{ color: colors.primary }}>
            Edit
          </Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function ReviewRow({
  label,
  value,
  colors,
  muted,
}: {
  label: string;
  value: string;
  colors: { text: string; textMuted: string; textSecondary: string };
  muted?: boolean;
}) {
  return (
    <View className="mb-2.5">
      <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>
        {label}
      </Text>
      <Text
        className="mt-1 text-sm leading-5"
        style={{ color: muted ? colors.textMuted : colors.textSecondary }}
      >
        {value}
      </Text>
    </View>
  );
}

function ChipRow({
  options,
  value,
  onChange,
  colors,
}: {
  options: readonly string[];
  value: string | null;
  onChange: (value: string) => void;
  colors: {
    primary: string;
    primaryLight: string;
    inputBorder: string;
    inputBg: string;
    text: string;
  };
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(active ? "" : opt)}
            className="rounded-full border px-4 py-2.5"
            style={{
              borderColor: active ? colors.primary : colors.inputBorder,
              backgroundColor: active ? colors.primaryLight : colors.inputBg,
            }}
          >
            <Text className="text-sm font-semibold" style={{ color: active ? colors.primary : colors.text }}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({
  label,
  colors,
  children,
}: {
  label: string;
  colors: { text: string };
  children: ReactNode;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-bold" style={{ color: colors.text }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
