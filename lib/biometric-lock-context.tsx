import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ENABLED_KEY = "coconut.biometric_lock_enabled_v1";

/** Don't re-lock if the app was backgrounded for less than this. */
const GRACE_PERIOD_MS = 30_000;

type BiometricType = "fingerprint" | "facial" | "iris" | null;

interface BiometricLockContextValue {
  isLocked: boolean;
  enabled: boolean;
  hydrated: boolean;
  biometricAvailable: boolean;
  biometricType: BiometricType;
  setEnabled: (v: boolean) => void;
  unlock: () => void;
}

const BiometricLockContext = createContext<BiometricLockContextValue>({
  isLocked: false,
  enabled: false,
  hydrated: false,
  biometricAvailable: false,
  biometricType: null,
  setEnabled: () => {},
  unlock: () => {},
});

let _LocalAuthentication: typeof import("expo-local-authentication") | null = null;

async function getLocalAuth() {
  if (_LocalAuthentication) return _LocalAuthentication;
  try {
    const mod = await import("expo-local-authentication");
    // Verify the native module is actually functional (not stubbed in Expo Go)
    if (typeof mod.hasHardwareAsync !== "function") return null;
    _LocalAuthentication = mod;
    return _LocalAuthentication;
  } catch {
    return null;
  }
}

export function BiometricLockProvider({
  children,
  isSignedIn,
}: {
  children: React.ReactNode;
  isSignedIn?: boolean;
}) {
  const [enabled, setEnabledState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>(null);

  // Hydrate stored preference + hardware state once on mount.
  // Intentionally has NO dependency on isSignedIn — the previous version
  // used [isSignedIn] which caused cancellation races when Clerk loaded
  // (isSignedIn flipped false→true mid-await, aborting the first run).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedEnabled, localAuth] = await Promise.all([
        AsyncStorage.getItem(ENABLED_KEY).catch(() => null),
        getLocalAuth(),
      ]);
      if (cancelled) return;

      const isEnabled = storedEnabled === "true";
      setEnabledState(isEnabled);

      if (localAuth) {
        try {
          const hasHw = typeof localAuth.hasHardwareAsync === "function"
            ? await localAuth.hasHardwareAsync().catch(() => false)
            : false;
          const enrolled = hasHw ? await localAuth.isEnrolledAsync().catch(() => false) : false;
          if (!cancelled) {
            setBiometricAvailable(hasHw && enrolled);
            if (hasHw && enrolled) {
              const types = await localAuth.supportedAuthenticationTypesAsync().catch(() => [] as number[]);
              const FACIAL = localAuth.AuthenticationType.FACIAL_RECOGNITION as number;
              const FINGER = localAuth.AuthenticationType.FINGERPRINT as number;
              const IRIS = localAuth.AuthenticationType.IRIS as number;
              if (!cancelled) {
                if (types.includes(FACIAL)) {
                  setBiometricType("facial");
                } else if (types.includes(FINGER)) {
                  setBiometricType("fingerprint");
                } else if (types.includes(IRIS)) {
                  setBiometricType("iris");
                }
              }
            }
          }
        } catch {
          // Native biometric module unavailable (e.g. Expo Go)
        }
      }

      if (!cancelled) {
        if (isEnabled && localAuth) setIsLocked(true);
        setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !isSignedIn) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "background") {
        backgroundedAt.current = Date.now();
      } else if (state === "active" && backgroundedAt.current !== null) {
        const elapsed = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (elapsed >= GRACE_PERIOD_MS) {
          setIsLocked(true);
        }
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [enabled, isSignedIn]);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    void AsyncStorage.setItem(ENABLED_KEY, v ? "true" : "false");
    if (!v) setIsLocked(false);
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  return (
    <BiometricLockContext.Provider
      value={{ isLocked, enabled, hydrated, biometricAvailable, biometricType, setEnabled, unlock }}
    >
      {children}
    </BiometricLockContext.Provider>
  );
}

export function useBiometricLock() {
  return useContext(BiometricLockContext);
}
