import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

const DEMO_MODE_KEY = "coconut.demo_mode";

/** When true, first launch (no stored preference) opens the app in demo mode — handy for simulator QA. */
const START_IN_DEMO = process.env.EXPO_PUBLIC_START_IN_DEMO === "true";

interface DemoModeContextValue {
  isDemoOn: boolean;
  setIsDemoOn: (on: boolean) => void;
  /** False until we've read SecureStore (or applied START_IN_DEMO). Root auth gate should wait on this. */
  demoModeHydrated: boolean;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoOn, setIsDemoOnState] = useState(false);
  const [demoModeHydrated, setDemoModeHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await SecureStore.getItemAsync(DEMO_MODE_KEY);
        if (cancelled) return;
        if (v === null && START_IN_DEMO) {
          setIsDemoOnState(true);
          await SecureStore.setItemAsync(DEMO_MODE_KEY, "true");
        } else {
          setIsDemoOnState(v === "true");
        }
      } catch {
        if (!cancelled) setIsDemoOnState(START_IN_DEMO);
      } finally {
        if (!cancelled) setDemoModeHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setIsDemoOn = useCallback((on: boolean) => {
    setIsDemoOnState(on);
    SecureStore.setItemAsync(DEMO_MODE_KEY, on ? "true" : "false").catch(() => {});
  }, []);

  return (
    <DemoModeContext.Provider value={{ isDemoOn, setIsDemoOn, demoModeHydrated }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const ctx = useContext(DemoModeContext);
  if (!ctx) throw new Error("useDemoMode must be inside DemoModeProvider");
  return ctx;
}
