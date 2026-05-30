import { useMemo } from "react";
import { useTheme } from "./theme-context";

/** Home screen palette — Figma FINAL HOME TENTATIVE (node 138:1929). */
export type HomePalette = {
  canvas: string;
  /** Hero wave gradient top (#EDF4F3). */
  waveTop: string;
  /** Hero wave gradient bottom (#D2EFED). */
  waveBottom: string;
  /** @deprecated Use waveTop/waveBottom — kept for callers migrating. */
  waveBlue: string;
  heroSurface: string;
  heroBorder: string;
  /** Brown body text (#493d32). */
  ink: string;
  inkMuted: string;
  /** “BALANCE OVERVIEW” label (#457d80). */
  balanceLabel: string;
  moneyIn: string;
  /** Owed-to-you face / shadow / label */
  moneyInSoft: string;
  moneyInShadow: string;
  moneyInText: string;
  moneyOut: string;
  moneyOutSoft: string;
  moneyOutShadow: string;
  moneyOutText: string;
  oweBandBg: string;
  oweBandAccent: string;
  sectionTitle: string;
  sectionSub: string;
  boxFill: string;
  boxBorder: string;
  boxFillActive: string;
  txAmount: string;
  coconutShell: string;
  coconutStraw: string;
  splitAction: string;
  splitActionText: string;
  navLine: string;
  navInactive: string;
  navIconInactive: string;
  navActiveLabel: string;
};

const light: HomePalette = {
  canvas: "#F6F0E2",
  waveTop: "#EDF4F3",
  waveBottom: "#D2EFED",
  waveBlue: "#D2EFED",
  heroSurface: "#FFFFFF",
  heroBorder: "#E5E7EB",
  ink: "#493D32",
  inkMuted: "#795D59",
  balanceLabel: "#457D80",
  /** Owed to you — bold green */
  moneyIn: "#15803D",
  moneyInSoft: "#D3F698",
  moneyInShadow: "#83AB42",
  moneyInText: "#15803D",
  /** You owe — bold red */
  moneyOut: "#DC2626",
  moneyOutSoft: "#FFBCAC",
  moneyOutShadow: "#D27455",
  moneyOutText: "#DC2626",
  oweBandBg: "#FFBCAC",
  oweBandAccent: "#DC2626",
  sectionTitle: "#493D32",
  sectionSub: "#795D59",
  boxFill: "#FFFFFF",
  boxBorder: "transparent",
  boxFillActive: "#FAFAF9",
  txAmount: "#323232",
  coconutShell: "#493D32",
  coconutStraw: "#F4531D",
  splitAction: "#FFBF58",
  splitActionText: "#323232",
  navLine: "#D6CBB1",
  navInactive: "#795D59",
  navIconInactive: "#A2918F",
  navActiveLabel: "#000000",
};

const dark: HomePalette = {
  canvas: "#0D0F13",
  waveTop: "#1A3044",
  waveBottom: "#152535",
  waveBlue: "#1A3044",
  heroSurface: "#17191F",
  heroBorder: "rgba(255,255,255,0.1)",
  ink: "#F2F4F8",
  inkMuted: "#9CA3AF",
  balanceLabel: "#6BA8AB",
  moneyIn: "#4ADE80",
  moneyInSoft: "rgba(131, 171, 66, 0.35)",
  moneyInShadow: "#4A6B28",
  moneyInText: "#4ADE80",
  moneyOut: "#F87171",
  moneyOutSoft: "rgba(210, 116, 85, 0.35)",
  moneyOutShadow: "#8B3D2E",
  moneyOutText: "#F87171",
  oweBandBg: "rgba(255, 188, 172, 0.22)",
  oweBandAccent: "#F87171",
  sectionTitle: "#F2F4F8",
  sectionSub: "#9CA3AF",
  boxFill: "#1D2028",
  boxBorder: "rgba(255,255,255,0.06)",
  boxFillActive: "#242833",
  txAmount: "#F2F4F8",
  coconutShell: "#3D3530",
  coconutStraw: "#F4531D",
  splitAction: "#E8A84A",
  splitActionText: "#F2F4F8",
  navLine: "rgba(255,255,255,0.12)",
  navInactive: "#9CA3AF",
  navIconInactive: "#9CA3AF",
  navActiveLabel: "#F2F4F8",
};

export function getHomePalette(isDark: boolean): HomePalette {
  return isDark ? dark : light;
}

export function getHomeHeadlineLabel(
  settled: boolean,
  netPositive: boolean,
): string {
  if (settled) return "Settled";
  return netPositive ? "You're owed" : "You owe";
}

export function getHomeAccentColor(
  palette: HomePalette,
  settled: boolean,
  netPositive: boolean,
): string {
  if (settled) return palette.moneyIn;
  return netPositive ? palette.moneyIn : palette.moneyOut;
}

export function getHomeAmountColor(
  palette: HomePalette,
  settled: boolean,
  netPositive: boolean,
): string {
  if (settled) return palette.ink;
  return netPositive ? palette.moneyInText : palette.moneyOutText;
}

export function useHomePalette(): HomePalette {
  const { isDark } = useTheme();
  return useMemo(() => getHomePalette(isDark), [isDark]);
}
