import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

type Mode = "camera" | "preview";
type CaptureSource = "camera" | "library" | null;

export default function PhlegmCaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ audioDone?: string; audioUris?: string; checklist?: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const cameraRef = useRef<CameraView | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("camera");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [captureSource, setCaptureSource] = useState<CaptureSource>(null);

  const shutterSize = windowWidth < 380 ? 68 : 78;
  const shutterRing = windowWidth < 380 ? 56 : 64;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const hasCameraPermission = cameraPermission?.granted === true;

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        checklist: params.checklist ?? "",
        imageUri,
      },
    } as any);
  };

  const skipPhlegmToReview = () => {
    setErrorText(null);
    goToReview("");
  };

  const showPreview = (uri: string, source: "camera" | "library") => {
    setErrorText(null);
    setPhotoUri(uri);
    setCaptureSource(source);
    setMode("preview");
  };

  const retake = () => {
    setPhotoUri(null);
    setCaptureSource(null);
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
    showPreview(uri, "library");
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
    showPreview(photo.uri, "camera");
  };

  const fromLibraryPreview = mode === "preview" && captureSource === "library";

  return (
    <>
      <StatusBar style="light" backgroundColor="#0B1530" translucent={false} />
      <SafeAreaView className="flex-1 bg-navy" edges={["top", "right", "bottom", "left"]}>
      <View className="flex-row items-center justify-between px-4 pb-3.5 pt-2 sm:px-5 md:px-6">
        <Pressable
          onPress={() => router.back()}
          className="size-11 items-center justify-center rounded-full bg-white/5 active:bg-white/10"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#ffffff" />
        </Pressable>

        <View className="min-w-0 flex-1 items-center px-2">
          <Text
            className="text-center text-sm font-bold text-white sm:text-base"
            numberOfLines={2}
          >
            {headerTitle}
          </Text>
          <Text className="mt-0.5 text-center text-xs font-semibold text-white/55 sm:text-sm">
            Optional sputum / phlegm photo
          </Text>
        </View>

        <View className="size-11" />
      </View>

      <View className="min-h-0 flex-1 px-4 pb-4 sm:px-5 md:px-6">
        <View className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
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
            <View className="flex-1 items-center justify-center px-5">
              <Ionicons name="camera" size={windowWidth < 380 ? 32 : 36} color="rgba(255,255,255,0.8)" />
              <Text className="mt-2.5 text-center text-base font-bold text-white sm:text-lg">
                Camera unavailable
              </Text>
              <Text className="mt-2 max-w-sm text-center text-xs leading-5 text-white/70 sm:text-sm">
                {helperText}
              </Text>

              <View className="h-3.5" />

              <Pressable
                onPress={() => requestCameraPermission()}
                className="items-center justify-center rounded-2xl bg-white px-4 py-3 active:bg-white/90"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-navy">Enable camera</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text className="mt-3 max-w-md self-center text-center text-xs leading-5 text-white/75 sm:text-sm">
          {hasCameraPermission ? "Optional step — add a photo or skip." : helperText}
        </Text>
        {!!errorText && (
          <Text className="mt-2 text-center text-xs font-bold text-red-400 sm:text-sm">{errorText}</Text>
        )}
      </View>

      <View className="px-4 pt-3 pb-6 sm:px-5 sm:pb-8 md:px-6">
        {mode === "preview" ? (
          fromLibraryPreview ? (
            <View className="gap-3">
              <Text className="text-center text-xs text-white/70 sm:text-sm">
                Image uploaded — review and proceed when ready.
              </Text>
              <Pressable
                onPress={() => {
                  if (!photoUri) return;
                  goToReview(photoUri);
                }}
                className="items-center justify-center rounded-2xl bg-white py-3.5 active:bg-white/90 sm:py-4"
                accessibilityRole="button"
                accessibilityLabel="Proceed to review"
              >
                <Text className="text-sm font-bold text-navy sm:text-base">Proceed</Text>
              </Pressable>
              <Pressable
                onPress={retake}
                className="items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-3.5 active:bg-white/10 sm:py-4"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-white sm:text-base">Choose another</Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row gap-3">
              <Pressable
                onPress={retake}
                className="flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-3.5 active:bg-white/10 sm:py-4"
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-white sm:text-base">Retake</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!photoUri) return;
                  goToReview(photoUri);
                }}
                className="flex-1 items-center justify-center rounded-2xl bg-white py-3.5 active:bg-white/90 sm:py-4"
                accessibilityRole="button"
                accessibilityLabel="Proceed to review"
              >
                <Text className="text-sm font-bold text-navy sm:text-base">Proceed</Text>
              </Pressable>
            </View>
          )
        ) : (
          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-2">
              <Pressable
                onPress={pickFromLibrary}
                className="h-14 w-24 items-center justify-center rounded-2xl border border-white/10 bg-white/5 active:bg-white/10 sm:h-14"
                accessibilityRole="button"
              >
                <Ionicons name="cloud-upload-outline" size={20} color="#ffffff" />
                <Text className="mt-1 text-xs font-bold text-white">Upload</Text>
              </Pressable>

              <Pressable
                onPress={takePhoto}
                className="items-center justify-center rounded-full bg-white active:bg-white/90"
                style={{ width: shutterSize, height: shutterSize, borderRadius: shutterSize / 2 }}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
              >
                <View
                  className="rounded-full border-2 border-navy/15 bg-navy/5"
                  style={{
                    width: shutterRing,
                    height: shutterRing,
                    borderRadius: shutterRing / 2,
                  }}
                />
              </Pressable>

              <View className="h-14 w-24 opacity-0 sm:h-14" pointerEvents="none" />
            </View>

            <Pressable
              onPress={skipPhlegmToReview}
              className="mt-1 self-center rounded-lg py-2 px-3 active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel="Skip phlegm sample, continue with cough only"
              hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
            >
              <Text className="text-center text-xs font-semibold text-white/55 underline decoration-white/30">
                Skip — no sample
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
    </>
  );
}
