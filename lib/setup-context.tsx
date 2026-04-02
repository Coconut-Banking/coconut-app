import React, { createContext, useContext, useState, useCallback } from "react";

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

  const markSetupComplete = useCallback(() => {
    setSetupComplete(true);
  }, []);

  const resetSetup = useCallback(() => {
    setSetupComplete(false);
  }, []);

  return (
    <SetupContext.Provider value={{ setupComplete, setupHydrated: true, markSetupComplete, resetSetup }}>
      {children}
    </SetupContext.Provider>
  );
}

export function useSetup() {
  return useContext(SetupContext);
}
