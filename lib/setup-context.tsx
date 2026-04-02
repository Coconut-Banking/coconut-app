import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SETUP_KEY = "coconut_setup_complete_v1";
const FORCE_SETUP = process.env.EXPO_PUBLIC_FORCE_SETUP === "true";

interface SetupContextValue {
  setupComplete: boolean;
  setupHydrated: boolean;
  markSetupComplete: () => void;
  resetSetup: () => void;
}

const SetupContext = createContext<SetupContextValue>({
  setupComplete: false,
  setupHydrated: false,
  markSetupComplete: () => {},
  resetSetup: () => {},
});

export function SetupProvider({ children }: { children: React.ReactNode }) {
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupHydrated, setSetupHydrated] = useState(false);

  useEffect(() => {
    if (FORCE_SETUP) {
      void AsyncStorage.removeItem(SETUP_KEY);
      setSetupComplete(false);
      setSetupHydrated(true);
      return;
    }
    AsyncStorage.getItem(SETUP_KEY)
      .then((v) => setSetupComplete(v === "true"))
      .catch(() => {})
      .finally(() => setSetupHydrated(true));
  }, []);

  const markSetupComplete = useCallback(() => {
    setSetupComplete(true);
    void AsyncStorage.setItem(SETUP_KEY, "true");
  }, []);

  const resetSetup = useCallback(() => {
    setSetupComplete(false);
    void AsyncStorage.removeItem(SETUP_KEY);
  }, []);

  return (
    <SetupContext.Provider value={{ setupComplete, setupHydrated, markSetupComplete, resetSetup }}>
      {children}
    </SetupContext.Provider>
  );
}

export function useSetup() {
  return useContext(SetupContext);
}
