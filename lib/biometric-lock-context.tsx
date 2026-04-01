import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ENABLED_KEY = "coconut.biometric_lock_enabled_v1";

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
    _LocalAuthentication = await import("expo-local-authentication");
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
        const hasHw = await localAuth.hasHardwareAsync().catch(() => false);
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
      }

      if (isEnabled && isSignedIn) {
        setIsLocked(true);
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  useEffect(() => {
    if (!enabled || !isSignedIn) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        setIsLocked(true);
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
