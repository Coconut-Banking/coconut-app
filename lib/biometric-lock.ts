import { NativeModules } from "react-native";

let _LocalAuthentication: typeof import("expo-local-authentication") | null = null;

async function getLocalAuth() {
  if (_LocalAuthentication) return _LocalAuthentication;
  // Guard: native module not registered in Expo Go — skip to avoid crash
  if (!NativeModules.ExpoLocalAuthentication) return null;
  try {
    _LocalAuthentication = await import("expo-local-authentication");
    return _LocalAuthentication;
  } catch {
    return null;
  }
}

export async function checkBiometricStatus(): Promise<{
  available: boolean;
  hasHardware: boolean;
}> {
  const localAuth = await getLocalAuth();
  if (!localAuth) return { available: false, hasHardware: false };
  try {
    const [hasHardware, enrolled] = await Promise.all([
      localAuth.hasHardwareAsync(),
      localAuth.isEnrolledAsync(),
    ]);
    return { available: hasHardware && enrolled, hasHardware };
  } catch {
    return { available: false, hasHardware: false };
  }
}

export async function authenticate(
  promptMessage = "Authenticate to continue",
  options?: { biometricOnly?: boolean }
): Promise<{ success: boolean; error?: string; errorCode?: string }> {
  const localAuth = await getLocalAuth();
  if (!localAuth || typeof localAuth.authenticateAsync !== "function") return { success: false };
  try {
    const result = await localAuth.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: options?.biometricOnly ?? false,
    });
    if (result.success) return { success: true };
    return { success: false, error: result.error };
  } catch {
    return { success: false };
  }
}

export function getBiometricLabel(
  biometricType: "fingerprint" | "facial" | "iris" | null
): string {
  switch (biometricType) {
    case "facial":
      return "Face ID";
    case "fingerprint":
      return "Touch ID";
    case "iris":
      return "Iris";
    default:
      return "Biometrics";
  }
}
