/**
 * Normalize receipt upload metadata before POST /api/receipt/parse.
 * Resizes on-device (web does this in useReceiptSplit; mobile was uploading full resolution).
 * HEIC→JPEG conversion still runs on coconut-web when needed.
 */
import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

function getImageDimensions(
  uri: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

export async function prepareReceiptImageForUpload(
  uri: string,
  opts?: { mimeType?: string; name?: string }
): Promise<{ uri: string; mimeType: string; name: string }> {
  const mimeType = opts?.mimeType ?? "image/jpeg";
  const name = opts?.name ?? "receipt.jpg";

  if (mimeType === "application/pdf") {
    return { uri, mimeType, name };
  }

  try {
    const { width, height } = await getImageDimensions(uri);
    const maxEdge = Math.max(width, height);
    const actions: ImageManipulator.Action[] =
      maxEdge <= MAX_EDGE
        ? []
        : width >= height
          ? [{ resize: { width: MAX_EDGE } }]
          : [{ resize: { height: MAX_EDGE } }];

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: JPEG_QUALITY,
      format:
        actions.length > 0
          ? ImageManipulator.SaveFormat.JPEG
          : mimeType === "image/png"
            ? ImageManipulator.SaveFormat.PNG
            : ImageManipulator.SaveFormat.JPEG,
    });

    const outMime =
      result.uri.endsWith(".png") || mimeType === "image/png"
        ? "image/png"
        : "image/jpeg";
    return {
      uri: result.uri,
      mimeType: outMime,
      name:
        outMime === "image/png"
          ? name.replace(/\.[^.]+$/, "") + ".png"
          : name.replace(/\.[^.]+$/, "") + ".jpg",
    };
  } catch {
    return { uri, mimeType, name };
  }
}
