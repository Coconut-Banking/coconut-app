import { NativeModules, Platform } from "react-native";

const { ProximityReaderDiscoveryModule } = NativeModules;

/**
 * Returns true if ProximityReaderDiscovery is available on this device.
 * Requires iOS 18.0+ and the com.apple.developer.proximity-reader.payment.acceptance entitlement.
 */
export function isProximityReaderDiscoveryAvailable(): boolean {
  return Platform.OS === "ios" && !!ProximityReaderDiscoveryModule;
}

/**
 * Presents Apple's official "How to use Tap to Pay on iPhone" merchant education UI.
 * Uses ProximityReaderDiscovery (iOS 18+) — satisfies Apple checklist §4.3 (marketing guidelines).
 *
 * Throws "UNSUPPORTED" on iOS < 18, "NO_WINDOW" if no active window, or "ERROR" for SDK errors.
 * Callers should catch and fall back to the custom education screen on failure.
 */
export async function presentProximityReaderEducation(): Promise<void> {
  if (Platform.OS !== "ios") {
    throw Object.assign(new Error("ProximityReaderDiscovery is iOS only"), { code: "UNSUPPORTED" });
  }
  if (!ProximityReaderDiscoveryModule) {
    throw Object.assign(new Error("ProximityReaderDiscoveryModule not available"), { code: "UNSUPPORTED" });
  }
  return ProximityReaderDiscoveryModule.presentEducation();
}
