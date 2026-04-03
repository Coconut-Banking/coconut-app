import { useEffect, useRef } from "react";
import { NativeModules } from "react-native";

const SHAKE_THRESHOLD = 2.5;
const SHAKE_COOLDOWN_MS = 3000;

export function useShakeDetector(onShake: () => void) {
  const lastShake = useRef(0);
  const cbRef = useRef(onShake);
  cbRef.current = onShake;

  useEffect(() => {
    // Accelerometer (expo-sensors) requires a custom dev build.
    // Guard by checking the native module exists before requiring the package.
    if (!NativeModules.ExponentAccelerometer) return;

    let sub: { remove: () => void } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Accelerometer } = require("expo-sensors") as typeof import("expo-sensors");
      Accelerometer.setUpdateInterval(100);
      sub = Accelerometer.addListener(({ x, y, z }) => {
        const total = Math.sqrt(x * x + y * y + z * z);
        const now = Date.now();
        if (total > SHAKE_THRESHOLD && now - lastShake.current > SHAKE_COOLDOWN_MS) {
          lastShake.current = now;
          cbRef.current();
        }
      });
    } catch {
      // no-op
    }
    return () => sub?.remove();
  }, []);
}
