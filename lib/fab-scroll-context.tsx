import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type FabScrollContextValue = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

const FabScrollContext = createContext<FabScrollContextValue | null>(null);

export function FabScrollProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
  }, []);

  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed, setCollapsed]);

  return <FabScrollContext.Provider value={value}>{children}</FabScrollContext.Provider>;
}

export function useFabScroll(): FabScrollContextValue {
  const ctx = useContext(FabScrollContext);
  if (!ctx) {
    return { collapsed: false, setCollapsed: () => {} };
  }
  return ctx;
}
