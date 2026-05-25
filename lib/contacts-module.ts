import { requireOptionalNativeModule } from "expo-modules-core";

let _module: typeof import("expo-contacts") | null | undefined;

function isContactsModuleReady(
  mod: typeof import("expo-contacts"),
): mod is typeof import("expo-contacts") {
  return (
    typeof mod.getPermissionsAsync === "function" &&
    typeof mod.requestPermissionsAsync === "function" &&
    typeof mod.getContactsAsync === "function"
  );
}

/** Load expo-contacts only when the native module exists in this binary. */
export async function getContactsModule(): Promise<typeof import("expo-contacts") | null> {
  if (_module !== undefined) return _module;

  if (!requireOptionalNativeModule("ExpoContacts")) {
    _module = null;
    return null;
  }

  try {
    const mod = await import("expo-contacts");
    if (!isContactsModuleReady(mod)) {
      _module = null;
      return null;
    }
    if (typeof mod.isAvailableAsync === "function") {
      const available = await mod.isAvailableAsync().catch(() => false);
      if (!available) {
        _module = null;
        return null;
      }
    }
    _module = mod;
    return mod;
  } catch {
    _module = null;
    return null;
  }
}
