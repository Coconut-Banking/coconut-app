/**
 * Coconut shell — Figma home palette extended app-wide (light + dark).
 */
import { useMemo } from "react";
import { Platform, ViewStyle } from "react-native";
import { getHomePalette, type HomePalette } from "./home-theme";
import { useTheme } from "./theme-context";

export type CoconutShell = HomePalette & {
  /** App canvas (gradient bottom color). */
  canvas: string;
  /** Primary CTA fill (#493D32). */
  cta: string;
  ctaPressed: string;
  /** Mint wash for hero / amount fields. */
  mintWash: string;
  mintWashDeep: string;
  /** Card surfaces */
  card: string;
  cardBorder: string;
  /** Input */
  inputBg: string;
  inputBorder: string;
  /** Semantic */
  success: string;
  error: string;
};

const lightShell: Omit<CoconutShell, keyof HomePalette> & Partial<HomePalette> = {
  cta: "#493D32",
  ctaPressed: "#3A3229",
  mintWash: "#EDF4F3",
  mintWashDeep: "#D2EFED",
  card: "#FFFFFF",
  cardBorder: "rgba(73, 61, 50, 0.08)",
  inputBg: "#FFFFFF",
  inputBorder: "rgba(73, 61, 50, 0.12)",
  success: "#345300",
  error: "#790C00",
};

const darkShell: Omit<CoconutShell, keyof HomePalette> & Partial<HomePalette> = {
  cta: "#E8E0D4",
  ctaPressed: "#D4CCC0",
  mintWash: "rgba(237, 244, 243, 0.12)",
  mintWashDeep: "rgba(210, 239, 237, 0.18)",
  card: "#1D2028",
  cardBorder: "rgba(255,255,255,0.08)",
  inputBg: "#1D2028",
  inputBorder: "rgba(255,255,255,0.12)",
  success: "#A8E06A",
  error: "#FFB4A8",
};

export function getCoconutShell(isDark: boolean): CoconutShell {
  const home = getHomePalette(isDark);
  const extra = isDark ? darkShell : lightShell;
  return { ...home, ...extra, canvas: home.canvas };
}

export function useCoconutShell(): CoconutShell {
  const { isDark } = useTheme();
  return useMemo(() => getCoconutShell(isDark), [isDark]);
}

/** Soft “bubbly” card shadow used on expense / home cards. */
export const coconutBubbleShadow = Platform.select<ViewStyle>({
  ios: {
    shadowColor: "#493D32",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  android: { elevation: 6 },
  default: {},
});

export const coconutBubbleCard: ViewStyle = {
  backgroundColor: "#FFFFFF",
  borderRadius: 20,
  borderWidth: 1,
  borderColor: "rgba(73, 61, 50, 0.06)",
  overflow: "hidden",
  ...coconutBubbleShadow,
};

export const COCONUT_LAYOUT = {
  screenPaddingX: 20,
  cardRadius: 20,
  chipRadius: 14,
  pillRadius: 999,
  bandRadius: 8,
} as const;
