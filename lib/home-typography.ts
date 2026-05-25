/**
 * Figma FINAL HOME TENTATIVE (node 138:1929) — typography & layout tokens.
 * Load matching font files (see HOME_FONTS below) for true 1:1; until then Inter is used as fallback.
 */
import { Platform, TextStyle } from "react-native";
import { font } from "./theme";

/** Add .otf/.ttf under assets/fonts/ and register in app/_layout.tsx useFonts(). */
export const HOME_FONTS = {
  /** Labels, hints, “BALANCE OVERVIEW” (Figma: SF Pro Display Bold — use Inter Bold). */
  display: "HomeSFProDisplay",
  /** “owed to you”, section titles, dates (Figma: Neue Montreal). */
  ui: "HomeNeueMontreal",
  /** Money amounts, merchant names, tab labels (Figma: Neue Plak). */
  money: "HomeNeuePlak",
} as const;

const fallback = {
  display: font.bold,
  uiMedium: font.medium,
  uiRegular: font.regular,
  moneyRegular: font.regular,
  moneyBold: font.bold,
};

function homeFamily(role: keyof typeof HOME_FONTS, weight: "regular" | "medium" | "bold"): string {
  const name = HOME_FONTS[role];
  const loaded = (globalThis as { __HOME_FONTS_LOADED__?: boolean }).__HOME_FONTS_LOADED__;
  if (!loaded) {
    if (weight === "bold") return font.bold;
    if (weight === "medium") return font.medium;
    return font.regular;
  }
  if (role === "display") return name;
  if (role === "ui") return weight === "medium" ? `${name}-Medium` : `${name}-Regular`;
  return weight === "bold" ? `${name}-Bold` : `${name}-Regular`;
}

/** Figma 402×874 reference width — scale spacing on other phones if needed. */
export const HOME_LAYOUT = {
  screenWidth: 402,
  horizontalPadding: 22,
  bandMaxWidth: 322,
  bandHeight: 40,
  bandRadius: 8,
  bandGap: 8,
  heroHeight: 226,
  txRowHeight: 48,
  txRowRadius: 4,
  searchFabSize: 32,
  searchFabRadius: 18,
  fabSize: 50,
  listPaddingRight: 76,
} as const;

export const homeType = {
  balanceLabel: {
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: 0.48,
    fontFamily: homeFamily("display", "bold"),
    textTransform: "uppercase" as const,
  },
  netAmount: {
    fontSize: 32,
    lineHeight: 45,
    letterSpacing: 0.96,
    fontFamily: homeFamily("money", "regular"),
  },
  bandAmount: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.48,
    fontFamily: homeFamily("money", "regular"),
  },
  bandLabel: {
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: 0.32,
    fontFamily: homeFamily("ui", "regular"),
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: 0.48,
    fontFamily: homeFamily("ui", "medium"),
    textTransform: "uppercase" as const,
  },
  swipeHint: {
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 0.36,
    fontFamily: homeFamily("ui", "medium"),
  },
  txMerchant: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.36,
    fontFamily: homeFamily("money", "regular"),
  },
  txDate: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.3,
    fontFamily: homeFamily("ui", "medium"),
  },
  txAmount: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.48,
    fontFamily: homeFamily("money", "regular"),
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.36,
    fontFamily: homeFamily("money", "regular"),
  },
} satisfies Record<string, TextStyle>;

export { fallback as homeFontFallback };
