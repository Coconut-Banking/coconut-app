import React, { useMemo } from "react";
import { DefaultTheme, ThemeProvider as NavThemeProvider } from "@react-navigation/native";
import { useTheme } from "../lib/theme-context";

/** Keeps @react-navigation Screen backgrounds in sync with Coconut theme (avoids gray/white gaps). */
export function NavigationThemeBridge({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const navTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: false,
      colors: {
        ...DefaultTheme.colors,
        primary: theme.primary,
        background: theme.background,
        card: theme.surface,
        text: theme.text,
        border: theme.border,
      },
    }),
    [theme],
  );
  return <NavThemeProvider value={navTheme}>{children}</NavThemeProvider>;
}
