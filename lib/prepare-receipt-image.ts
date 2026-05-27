/**
 * Normalize receipt upload metadata before POST /api/receipt/parse.
 * Resizes on-device when expo-image-manipulator is linked in the dev build.
 * Falls back to original uri if the native module is missing (rebuild with `npm run ios`).
 * HEIC→JPEG conversion still runs on coconut-web when needed.
 */
import { requireOptionalNativeModule } from "expo-modules-core";
import { Image } from "react-native";

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

type ManipulatorModule = typeof import("expo-image-manipulator");

let manipulatorCache: ManipulatorModule | null | undefined;

/** @internal test helper */
export function __resetManipulatorCacheForTests() {
  manipulatorCache = undefined;
}

async function loadImageManipulator(): Promise<ManipulatorModule | null> {
  if (manipulatorCache !== undefined) return manipulatorCache;

  // require() throws in LogBox even inside try/catch when the native binary lacks the module.
  if (!requireOptionalNativeModule("ExpoImageManipulator")) {
    manipulatorCache = null;
    return null;
  }

  try {
    // Safe to require once the native binary includes ExpoImageManipulator.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-image-manipulator") as ManipulatorModule;
    if (typeof mod.manipulateAsync !== "function") {
      manipulatorCache = null;
      return null;
    }
    manipulatorCache = mod;
    return mod;
  } catch {
    manipulatorCache = null;
    return null;
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
    const actions: Parameters<ManipulatorModule["manipulateAsync"]>[1] =
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
