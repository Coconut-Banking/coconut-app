import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

export const SCROLL_COLLAPSE_THRESHOLD = 16;

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

/** Wire to a screen's primary vertical ScrollView / FlatList — collapses FAB labels on scroll. */
export function useFabScrollCollapse() {
  const { setCollapsed } = useFabScroll();

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setCollapsed(e.nativeEvent.contentOffset.y > SCROLL_COLLAPSE_THRESHOLD);
    },
    [setCollapsed],
  );

  useEffect(() => () => setCollapsed(false), [setCollapsed]);

  return onScroll;
}
