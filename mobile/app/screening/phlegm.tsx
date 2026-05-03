import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

// Type definitions
type Mode = "camera" | "preview";

export default function PhlegmCaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ audioDone?: string; audioUris?: string }>();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("camera");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Camera permissions
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const hasCameraPermission = cameraPermission?.granted === true;

  // Request camera permission on mount
  useEffect(() => {
    // Kick off permission prompt on first load for smoother UX.
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computed values
  const canShowCamera = hasCameraPermission && mode === "camera";

  const headerTitle = mode === "preview" ? "Preview" : "Capture phlegm";

  const helperText = useMemo(() => {
    if (!hasCameraPermission) return "We need camera access to take a photo.";
    return "Use good lighting. Keep the container centered in the frame.";
  }, [hasCameraPermission]);

  const goToReview = (imageUri: string) => {
    setErrorText(null);
    router.replace({
      pathname: "/screening/review",
      params: {
        audioDone: params.audioDone ?? "0",
        audioUris: params.audioUris ?? "[]",
        imageUri,
      },
    } as any);
  };

  const showPreview = (uri: string) => {
    setErrorText(null);
    setPhotoUri(uri);
    setMode("preview");
  };

  const retake = () => {
    setPhotoUri(null);
    setMode("camera");
  };

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
    if (!uri) {
      setErrorText("No image selected. Please try again.");
      return;
    }
    showPreview(uri);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;

    const photo = await cameraRef.current.takePictureAsync({
      quality: 1,
      skipProcessing: false,
    });

    if (!photo?.uri) {
      setErrorText("Couldn’t capture a photo. Try Upload instead.");
      return;
    }
    showPreview(photo.uri);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1530" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: Math.max(insets.top, 16) + 8,
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
            <CameraView
              ref={(r) => {
                cameraRef.current = r;
              }}
              style={{ width: "100%", height: "100%" }}
              facing="back"
            />
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
        {!!errorText && (
          <Text style={{ marginTop: 8, color: "rgba(255,120,120,0.95)", fontSize: 12, textAlign: "center", fontWeight: "700" }}>
            {errorText}
          </Text>
        )}
      </View>

      {/* Bottom actions */}
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 16) + 18,
        }}
      >
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
              onPress={() => {
                if (!photoUri) return;
                goToReview(photoUri);
              }}
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

