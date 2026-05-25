import React, { useMemo } from "react";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "@react-navigation/native";
import { useTheme } from "../lib/theme-context";

/** Keeps @react-navigation Screen backgrounds in sync with Coconut theme (avoids gray/white gaps). */
export function NavigationThemeBridge({ children }: { children: React.ReactNode }) {
  const { theme, isDark } = useTheme();
  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      dark: isDark,
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: theme.primary,
        background: theme.background,
        card: theme.surface,
        text: theme.text,
        border: theme.border,
      },
    }),
    [theme, isDark],
  );
  return <NavThemeProvider value={navTheme}>{children}</NavThemeProvider>;
}
