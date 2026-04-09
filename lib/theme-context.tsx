import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useColorScheme } from "react-native";
import { themeStorageGet, themeStorageSet } from "./theme-storage";
import {
  colors,
  getDarkThemeByVariant,
  type ThemeColors,
  type ThemeMode,
  type ThemeVariant,
} from "./colors";

const STORAGE_KEY = "@coconut_theme_mode";
const STORAGE_VARIANT_KEY = "@coconut_theme_variant";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  variant: ThemeVariant;
  setVariant: (variant: ThemeVariant) => void;
  theme: ThemeColors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "auto",
  setMode: () => {},
  variant: "forest",
  setVariant: () => {},
  theme: colors.light,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [variant, setVariantState] = useState<ThemeVariant>("forest");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([themeStorageGet(STORAGE_KEY), themeStorageGet(STORAGE_VARIANT_KEY)]).then(([v, vv]) => {
      if (v === "light" || v === "dark" || v === "auto") setModeState(v);
      else setModeState("auto");
      if (vv === "forest" || vv === "midnight" || vv === "espresso") setVariantState(vv);
      setLoaded(true);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    void themeStorageSet(STORAGE_KEY, m);
  };
  const setVariant = (v: ThemeVariant) => {
    setVariantState(v);
    void themeStorageSet(STORAGE_VARIANT_KEY, v);
  };

  // Auto mode follows device setting; defaults to dark when device preference is unset.
  const isDark = mode === "dark" || (mode === "auto" && systemScheme !== "light");
  const theme = isDark ? getDarkThemeByVariant(variant) : colors.light;

  const value = useMemo(
    () => ({ mode, setMode, variant, setVariant, theme, isDark }),
    [mode, variant, theme, isDark]
  );

  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
