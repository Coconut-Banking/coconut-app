import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

const DEMO_MODE_KEY = "@coconut/demo_mode";

interface DemoModeContextValue {
  isDemoOn: boolean;
  setIsDemoOn: (on: boolean) => void;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoOn, setIsDemoOnState] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(DEMO_MODE_KEY).then((v) => {
      setIsDemoOnState(v === "true");
    });
  }, []);

  const setIsDemoOn = useCallback((on: boolean) => {
    setIsDemoOnState(on);
    SecureStore.setItemAsync(DEMO_MODE_KEY, on ? "true" : "false");
  }, []);

  return (
    <DemoModeContext.Provider value={{ isDemoOn, setIsDemoOn }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const ctx = useContext(DemoModeContext);
  if (!ctx) throw new Error("useDemoMode must be inside DemoModeProvider");
  return ctx;
}
