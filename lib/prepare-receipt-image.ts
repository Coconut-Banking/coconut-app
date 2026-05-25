/**
 * Normalize receipt upload metadata before POST /api/receipt/parse.
 * Resizes on-device when expo-image-manipulator is linked in the dev build.
 * Falls back to original uri if the native module is missing (rebuild with `npm run ios`).
 * HEIC→JPEG conversion still runs on coconut-web when needed.
 */
import { Image } from "react-native";

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

type ManipulatorModule = typeof import("expo-image-manipulator");

let manipulatorCache: ManipulatorModule | null | undefined;

async function loadImageManipulator(): Promise<ManipulatorModule | null> {
  if (manipulatorCache !== undefined) return manipulatorCache;
  try {
    // Defer loading so missing native module does not break receipt tab at startup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    manipulatorCache = require("expo-image-manipulator") as ManipulatorModule;
    return manipulatorCache;
  } catch {
    try {
      manipulatorCache = await import("expo-image-manipulator");
      return manipulatorCache;
    } catch {
      manipulatorCache = null;
      return null;
    }
  }
}

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

  const ImageManipulator = await loadImageManipulator();
  if (!ImageManipulator) {
    return { uri, mimeType, name };
  }

  try {
    const { width, height } = await getImageDimensions(uri);
    const maxEdge = Math.max(width, height);
    const actions: ManipulatorModule["Action"][] =
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
