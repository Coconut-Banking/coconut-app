import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { themeStorageGet, themeStorageSet } from "./theme-storage";
import {
  colors,
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
  mode: "light",
  setMode: () => {},
  variant: "forest",
  setVariant: () => {},
  theme: colors.light,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [variant, setVariantState] = useState<ThemeVariant>("forest");

  useEffect(() => {
    Promise.all([themeStorageGet(STORAGE_KEY), themeStorageGet(STORAGE_VARIANT_KEY)]).then(
      ([storedMode, storedVariant]) => {
        // Light mode only — migrate any saved dark/auto preference.
        if (storedMode !== "light") {
          void themeStorageSet(STORAGE_KEY, "light");
        }
        if (storedVariant === "forest" || storedVariant === "midnight" || storedVariant === "espresso") {
          setVariantState(storedVariant);
        }
      },
    );
  }, []);

  const setMode = (_m: ThemeMode) => {
    void themeStorageSet(STORAGE_KEY, "light");
  };
  const setVariant = (v: ThemeVariant) => {
    setVariantState(v);
    void themeStorageSet(STORAGE_VARIANT_KEY, v);
  };

  const mode: ThemeMode = "light";
  const isDark = false;
  const theme = colors.light;

  const value = useMemo(
    () => ({ mode, setMode, variant, setVariant, theme, isDark }),
    [variant, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
