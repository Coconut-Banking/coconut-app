let _LocalAuthentication: typeof import("expo-local-authentication") | null = null;

async function getLocalAuth() {
  if (_LocalAuthentication) return _LocalAuthentication;
  try {
    _LocalAuthentication = await import("expo-local-authentication");
    return _LocalAuthentication;
  } catch (e) {
    console.warn("[biometric] failed to import expo-local-authentication:", e);
    return null;
  }
}

export type BiometricStatus = {
  available: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  biometricType: "fingerprint" | "facial" | "iris" | null;
};

export async function checkBiometricStatus(): Promise<BiometricStatus> {
  const localAuth = await getLocalAuth();
  if (!localAuth) {
    console.log("[biometric] module not available");
    return { available: false, hasHardware: false, isEnrolled: false, biometricType: null };
  }

  const hasHardware = await localAuth.hasHardwareAsync().catch(() => false);
  const isEnrolled = hasHardware ? await localAuth.isEnrolledAsync().catch(() => false) : false;

  let biometricType: BiometricStatus["biometricType"] = null;
  if (hasHardware && isEnrolled) {
    const types = await localAuth.supportedAuthenticationTypesAsync().catch(() => [] as number[]);
    const FACIAL = localAuth.AuthenticationType.FACIAL_RECOGNITION as number;
    const FINGER = localAuth.AuthenticationType.FINGERPRINT as number;
    const IRIS = localAuth.AuthenticationType.IRIS as number;
    if (types.includes(FACIAL)) biometricType = "facial";
    else if (types.includes(FINGER)) biometricType = "fingerprint";
    else if (types.includes(IRIS)) biometricType = "iris";
  }

  console.log("[biometric] status:", { hasHardware, isEnrolled, biometricType });
  return { available: hasHardware && isEnrolled, hasHardware, isEnrolled, biometricType };
}

export type AuthResult = {
  success: boolean;
  error?: string;
  errorCode?: string;
};

/**
 * Attempt biometric (or device-owner) authentication.
 *
 * @param biometricOnly  When true, uses LAPolicy.deviceOwnerAuthenticationWithBiometrics
 *                       (no passcode fallback). Use this for the "enable Face ID" flow so
 *                       the user sees the actual Face ID prompt (and iOS asks for permission
 *                       the first time).
 *                       When false (default), allows passcode fallback — suitable for the
 *                       unlock screen where we just need the user to prove device ownership.
 */
export async function authenticate(
  promptMessage = "Authenticate to continue",
  options?: { biometricOnly?: boolean },
): Promise<AuthResult> {
  const localAuth = await getLocalAuth();
  if (!localAuth) {
    return { success: false, error: "Biometric module not available", errorCode: "MODULE_UNAVAILABLE" };
  }

  const biometricOnly = Boolean(options?.biometricOnly);

  try {
    console.log("[biometric] authenticateAsync:", { promptMessage, biometricOnly });
    const result = await localAuth.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: biometricOnly,
      ...(biometricOnly ? { fallbackLabel: "" } : {}),
    });
    console.log("[biometric] authenticateAsync result:", result);
    if (result.success) return { success: true };
    const errMsg = "error" in result ? String(result.error) : "Authentication failed";
    return {
      success: false,
      error: errMsg,
      errorCode: errMsg,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[biometric] authenticateAsync threw:", msg);
    return { success: false, error: msg, errorCode: "EXCEPTION" };
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
