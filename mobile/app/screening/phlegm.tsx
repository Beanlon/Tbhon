import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

type Mode = "camera" | "preview";

export default function PhlegmCaptureScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [mode, setMode] = useState<Mode>("camera");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const hasCameraPermission = cameraPermission?.granted === true;

  useEffect(() => {
    // Kick off permission prompt on first load for smoother UX.
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canShowCamera = hasCameraPermission && mode === "camera";

  const headerTitle = mode === "preview" ? "Review photo" : "Capture phlegm";

  const helperText = useMemo(() => {
    if (!hasCameraPermission) return "We need camera access to take a photo.";
    if (mode === "preview") return "Make sure the sample is well-lit and in focus.";
    return "Use good lighting. Keep the container centered in the frame.";
  }, [hasCameraPermission, mode]);

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: true,
      aspect: [4, 5],
    });

    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setPhotoUri(uri);
    setMode("preview");
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;

    const photo = await cameraRef.current.takePictureAsync({
      quality: 1,
      skipProcessing: false,
    });

    if (!photo?.uri) return;
    setPhotoUri(photo.uri);
    setMode("preview");
  };

  const retake = () => {
    setPhotoUri(null);
    setMode("camera");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1530" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: 54,
          paddingHorizontal: 18,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
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
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
          })}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#E8EEFF" />
        </Pressable>

        <Text style={{ color: "#E8EEFF", fontWeight: "800", fontSize: 16 }}>{headerTitle}</Text>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
          })}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color="#E8EEFF" />
        </Pressable>
      </View>

      {/* Preview / Camera */}
      <View style={{ flex: 1, paddingHorizontal: 18, paddingBottom: 16 }}>
        <View
          style={{
            flex: 1,
            borderRadius: 18,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
          }}
        >
          {mode === "preview" && photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : canShowCamera ? (
            <CameraView ref={(r) => (cameraRef.current = r)} style={{ width: "100%", height: "100%" }} facing="back" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
              <Ionicons name="camera" size={36} color="rgba(232,238,255,0.8)" />
              <Text
                style={{
                  marginTop: 10,
                  color: "#E8EEFF",
                  fontWeight: "800",
                  fontSize: 16,
                  textAlign: "center",
                }}
              >
                Camera unavailable
              </Text>
              <Text style={{ marginTop: 8, color: "rgba(232,238,255,0.70)", fontSize: 13, textAlign: "center", lineHeight: 18 }}>
                {helperText}
              </Text>

              <View style={{ height: 14 }} />

              <Pressable
                onPress={() => requestCameraPermission()}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? "rgba(255,255,255,0.92)" : "#FFFFFF",
                  borderRadius: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  alignItems: "center",
                  justifyContent: "center",
                })}
                accessibilityRole="button"
              >
                <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 13 }}>Enable camera</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Helper text */}
        <Text style={{ marginTop: 12, color: "rgba(232,238,255,0.75)", fontSize: 13, textAlign: "center", lineHeight: 18 }}>
          {helperText}
        </Text>
      </View>

      {/* Bottom actions */}
      <View style={{ paddingHorizontal: 18, paddingBottom: 22, paddingTop: 10 }}>
        {mode === "preview" ? (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={retake}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              })}
              accessibilityRole="button"
            >
              <Text style={{ color: "#E8EEFF", fontWeight: "800", fontSize: 14 }}>Retake</Text>
            </Pressable>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? "rgba(255,255,255,0.92)" : "#FFFFFF",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
              })}
              accessibilityRole="button"
            >
              <Text style={{ color: "#0B1530", fontWeight: "900", fontSize: 14 }}>Use photo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {/* Upload (side) */}
            <Pressable
              onPress={pickFromLibrary}
              style={({ pressed }) => ({
                width: 92,
                height: 56,
                borderRadius: 16,
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              })}
              accessibilityRole="button"
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#E8EEFF" />
              <Text style={{ marginTop: 4, color: "#E8EEFF", fontWeight: "800", fontSize: 12 }}>Upload</Text>
            </Pressable>

            {/* Shutter */}
            <Pressable
              onPress={takePhoto}
              style={({ pressed }) => ({
                width: 78,
                height: 78,
                borderRadius: 39,
                backgroundColor: pressed ? "rgba(255,255,255,0.92)" : "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              })}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: "rgba(11,21,48,0.06)",
                  borderWidth: 2,
                  borderColor: "rgba(11,21,48,0.12)",
                }}
              />
            </Pressable>

            {/* Spacer / hint */}
            <View style={{ width: 92, height: 56, borderRadius: 16, opacity: 0 }} />
          </View>
        )}
      </View>
    </View>
  );
}

