import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { Image } from "expo-image";

export default function ReviewInputsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ audioDone?: string; audioUris?: string; imageUri?: string }>();

  const audioDone = params.audioDone === "1";
  const imageDone = typeof params.imageUri === "string" && params.imageUri.length > 0;
  const imageUri = imageDone ? (params.imageUri as string) : null;
  const audioUris = typeof params.audioUris === "string" ? params.audioUris : "[]";

  const [audioOpen, setAudioOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const StatusPill = ({ done }: { done: boolean }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: "800", color: done ? "#10B981" : "#F59E0B" }}>{done ? "✓" : "—"}</Text>
      <Ionicons name={done ? "checkmark-circle" : "alert-circle"} size={18} color={done ? "#10B981" : "#F59E0B"} />
    </View>
  );

  const AccordionRow = ({
    label,
    done,
    open,
    onToggle,
    children,
  }: {
    label: string;
    done: boolean;
    open: boolean;
    onToggle: () => void;
    children?: React.ReactNode;
  }) => (
    <View>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 14,
          opacity: pressed ? 0.8 : 1,
        })}
        accessibilityRole="button"
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={18} color="#0B1530" />
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#0B1530" }}>{label}</Text>
        </View>
        <StatusPill done={done} />
      </Pressable>

      {open && (
        <View style={{ paddingBottom: 14 }}>
          {children}
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 16) + 8,
          paddingHorizontal: 18,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: "#F1F1F1",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(11,21,48,0.06)" : "rgba(11,21,48,0.04)",
          })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#0B1530" />
        </Pressable>

        <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 16 }}>Review inputs</Text>

        <View style={{ width: 44, height: 44 }} />
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 18 }}>
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#EFEFEF",
            backgroundColor: "#FFFFFF",
            paddingHorizontal: 16,
          }}
        >
          <AccordionRow
            label="Recorded audio"
            done={audioDone}
            open={audioOpen}
            onToggle={() => setAudioOpen((v) => !v)}
          >
            <Text style={{ color: "#475569", fontSize: 13, lineHeight: 18 }}>
              {audioDone
                ? "Audio recorded (3 coughs). Playback will appear once we wire real audio file recording."
                : "No audio recorded yet."}
            </Text>
          </AccordionRow>
          <View style={{ height: 1, backgroundColor: "#F3F3F3" }} />
          <AccordionRow
            label="Uploaded image"
            done={imageDone}
            open={imageOpen}
            onToggle={() => setImageOpen((v) => !v)}
          >
            {imageUri ? (
              <View
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "#EFEFEF",
                  backgroundColor: "#F8FAFC",
                  height: 220,
                }}
              >
                <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              </View>
            ) : (
              <Text style={{ color: "#475569", fontSize: 13, lineHeight: 18 }}>No image selected yet.</Text>
            )}
          </AccordionRow>
        </View>

        <View style={{ height: 16 }} />

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={() => router.replace({ pathname: "/screening/recording" as any })}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: pressed ? "rgba(11,21,48,0.08)" : "rgba(11,21,48,0.05)",
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(11,21,48,0.08)",
            })}
            accessibilityRole="button"
          >
            <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 13 }}>Re-record</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace({ pathname: "/screening/phlegm", params: { audioDone: audioDone ? "1" : "0" } } as any)}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: pressed ? "rgba(11,21,48,0.08)" : "rgba(11,21,48,0.05)",
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(11,21,48,0.08)",
            })}
            accessibilityRole="button"
          >
            <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 13 }}>Retake</Text>
          </Pressable>
        </View>
      </View>

      {/* Analyze */}
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 16) + 18,
        }}
      >
        <Pressable
          onPress={() => {
            router.push({
              pathname: "/screening/processing",
                params: { audioDone: audioDone ? "1" : "0", audioUris, imageUri: imageUri ?? "" },
            } as any);
          }}
          disabled={!audioDone || !imageDone}
          style={({ pressed }) => ({
            backgroundColor: !audioDone || !imageDone ? "rgba(11,21,48,0.20)" : pressed ? "rgba(11,21,48,0.92)" : "#0B1530",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            justifyContent: "center",
          })}
          accessibilityRole="button"
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Analyze</Text>
        </Pressable>
      </View>
    </View>
  );
}

