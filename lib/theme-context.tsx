import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, type ThemeColors, type ThemeMode } from "./colors";

const STORAGE_KEY = "@coconut_theme_mode";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: ThemeColors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "auto",
  setMode: () => {},
  theme: colors.light,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "auto") setModeState(v);
      setLoaded(true);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m);
  };

  // Auto mode follows device setting; defaults to dark when device preference is unset
  const isDark = mode === "dark" || (mode === "auto" && systemScheme !== "light");
  const theme = isDark ? colors.dark : colors.light;

  const value = useMemo(() => ({ mode, setMode, theme, isDark }), [mode, theme, isDark]);

  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
