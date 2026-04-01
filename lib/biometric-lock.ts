let _LocalAuthentication: typeof import("expo-local-authentication") | null = null;

async function getLocalAuth() {
  if (_LocalAuthentication) return _LocalAuthentication;
  try {
    _LocalAuthentication = await import("expo-local-authentication");
    return _LocalAuthentication;
  } catch {
    return null;
  }
}

export async function authenticate(
  promptMessage = "Authenticate to continue"
): Promise<{ success: boolean }> {
  const localAuth = await getLocalAuth();
  if (!localAuth) return { success: false };
  try {
    const result = await localAuth.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    return { success: result.success };
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
