import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as SecureStore from "expo-secure-store";

const SETUP_COMPLETE_KEY = "coconut.setup_complete";

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
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(SETUP_COMPLETE_KEY);
        if (!cancelled) {
          setSetupComplete(stored === "true");
        }
      } catch {
        // SecureStore unavailable — fall back to not-complete
      } finally {
        if (!cancelled) setSetupHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const markSetupComplete = useCallback(() => {
    setSetupComplete(true);
    void SecureStore.setItemAsync(SETUP_COMPLETE_KEY, "true");
  }, []);

  const resetSetup = useCallback(() => {
    setSetupComplete(false);
    void SecureStore.deleteItemAsync(SETUP_COMPLETE_KEY);
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
