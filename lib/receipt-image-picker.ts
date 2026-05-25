import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

/** Picker options that request JPEG-compatible assets on iOS (avoids HEIC upload failures). */
export function receiptImagePickerOptions(
  overrides?: ImagePicker.ImagePickerOptions
): ImagePicker.ImagePickerOptions {
  return {
    mediaTypes: ["images"],
    quality: 0.75,
    exif: false,
    ...(Platform.OS === "ios"
      ? {
          preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        }
      : {}),
    ...overrides,
  };
}
