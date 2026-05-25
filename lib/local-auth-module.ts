import { requireOptionalNativeModule } from "expo-modules-core";

let _module: typeof import("expo-local-authentication") | null | undefined;

/** Load expo-local-authentication only when the native module exists in this binary. */
export async function getLocalAuthenticationModule(): Promise<
  typeof import("expo-local-authentication") | null
> {
  if (_module !== undefined) return _module;

  if (!requireOptionalNativeModule("ExpoLocalAuthentication")) {
    _module = null;
    return null;
  }

  try {
    const mod = await import("expo-local-authentication");
    if (typeof mod.hasHardwareAsync !== "function") {
      _module = null;
      return null;
    }
    _module = mod;
    return mod;
  } catch {
    _module = null;
    return null;
  }
}
