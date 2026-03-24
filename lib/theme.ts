import { Platform, TextStyle, ViewStyle } from "react-native";

// ── Colors ──────────────────────────────────────────────────────────────────

/**
 * App shell tokens aligned to neutral website phone mock.
 * Brand CTAs use `colors.primary` from theme context (same green).
 */
export const darkUI = {
  bg: "#F5F3F2",
  bgElevated: "#F7F3F0",
  card: "#FFFFFF",
  cardHover: "#FFFFFF",
  /** Inputs / numpad tiles */
  cardElevated: "#F7F3F0",
  stroke: "#E3DBD8",
  strokeSoft: "#EEE8E4",
  sep: "#EEE8E4",
  label: "#1F2328",
  labelSecondary: "#4B5563",
  labelMuted: "#8A9098",
  moneyIn: "#3A7D44",
  moneyOut: "#C23934",
  moneyInBg: "#EEF5F0",
  moneyOutBg: "#FCEDEC",
} as const;

/** Shared demo / semantic accents (money positive matches MVP green). */
export const prototype = {
  green: "#3A7D44",
  greenBg: "#EEF5F0",
  greenMid: "#DCEADE",
  red: "#C23934",
  redBg: "#FCEDEC",
  sep: "#EEE8E4",
  card2: "#FFFFFF",
  card3: "#F7F3F0",
  blue: "#4A6CF7",
  blueBg: "#EEF2FF",
  amber: "#F59E0B",
  amberBg: "#FEF3C7",
} as const;

export const colors = {
  // Neutral website phone shell
  primary: "#1F2328",
  primaryLight: "#F3EEEA",
  primaryMuted: "#E3DBD8",
  primaryDark: "#1F2328",

  // Surfaces
  bg: "#F7FAF8",
  surface: "#FFFFFF",
  surfaceRaised: "#FAFAFA",
  surfaceSecondary: "#F9FAFB",

  // Text
  text: "#1F2937",
  textSecondary: "#374151",
  textTertiary: "#6B7280",
  textMuted: "#9CA3AF",
  textFaint: "#C4C4C4",

  // Borders
  border: "#E5E7EB",
  borderLight: "#F3F4F6",
  borderSubtle: "#F0F0F0",

  // Semantic
  green: "#059669",
  greenBg: "#D1FAE5",
  greenSurface: "#F0FDF4",
  greenBorder: "#BBF7D0",
  greenDark: "#065F46",

  red: "#DC2626",
  redBg: "#FEE2E2",
  redSurface: "#FEF2F2",
  redBorder: "#FECACA",

  amber: "#B45309",
  amberBg: "#FFFBEB",
  amberBorder: "#FDE68A",
  amberDark: "#92400E",

  purple: "#7C3AED",
  purpleBg: "#F3E8FF",

  blue: "#4A6CF7",
  blueBg: "#EEF2FF",

  overlay: "rgba(0,0,0,0.4)",
  overlayDark: "rgba(0,0,0,0.5)",
} as const;

export const ACCENT_PALETTE = [
  "#1F2328",
  "#4A6CF7",
  "#E8507A",
  "#F59E0B",
  "#10A37F",
  "#8B5CF6",
  "#FF5A5F",
  "#00674B",
] as const;

export function accentColor(i: number) {
  return ACCENT_PALETTE[i % ACCENT_PALETTE.length];
}

// ── Spacing (8pt grid) ──────────────────────────────────────────────────────

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
} as const;

// ── Border Radii ────────────────────────────────────────────────────────────

export const radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  "2xl": 20,
  full: 9999,
} as const;

// ── Font families ───────────────────────────────────────────────────────────

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
  black: "Inter_900Black",
} as const;

// ── Font sizes ──────────────────────────────────────────────────────────────

export const fontSize = {
  "2xs": 10,
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 15,
  xl: 16,
  "2xl": 18,
  "3xl": 20,
  "4xl": 22,
  "5xl": 24,
  "6xl": 28,
} as const;

// ── Pre-built text styles ───────────────────────────────────────────────────

export const type = {
  hero: {
    fontFamily: font.black,
    fontSize: fontSize["6xl"],
    color: colors.text,
    letterSpacing: -0.8,
  } as TextStyle,
  title: {
    fontFamily: font.bold,
    fontSize: fontSize["5xl"],
    color: colors.text,
    letterSpacing: -0.5,
  } as TextStyle,
  heading: {
    fontFamily: font.bold,
    fontSize: fontSize["3xl"],
    color: colors.text,
  } as TextStyle,
  subheading: {
    fontFamily: font.semibold,
    fontSize: fontSize.xl,
    color: colors.text,
  } as TextStyle,
  body: {
    fontFamily: font.regular,
    fontSize: fontSize.lg,
    color: colors.text,
  } as TextStyle,
  bodyMedium: {
    fontFamily: font.medium,
    fontSize: fontSize.lg,
    color: colors.text,
  } as TextStyle,
  bodySemibold: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    color: colors.text,
  } as TextStyle,
  caption: {
    fontFamily: font.medium,
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  } as TextStyle,
  captionBold: {
    fontFamily: font.bold,
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  } as TextStyle,
  label: {
    fontFamily: font.bold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  } as TextStyle,
  amount: {
    fontFamily: font.extrabold,
    fontSize: fontSize.xl,
    color: colors.text,
  } as TextStyle,
  amountLg: {
    fontFamily: font.black,
    fontSize: fontSize["5xl"],
    color: colors.text,
    letterSpacing: -1,
  } as TextStyle,
  button: {
    fontFamily: font.bold,
    fontSize: fontSize.lg,
    color: "#fff",
  } as TextStyle,
  buttonSm: {
    fontFamily: font.bold,
    fontSize: fontSize.base,
    color: "#fff",
  } as TextStyle,
  chip: {
    fontFamily: font.semibold,
    fontSize: fontSize.base,
  } as TextStyle,
} as const;

// ── Shadows ─────────────────────────────────────────────────────────────────

export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  } as ViewStyle,
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  } as ViewStyle,
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  } as ViewStyle,
  colored: (color: string): ViewStyle => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  }),
} as const;

// ── Common view styles ──────────────────────────────────────────────────────

export const card: ViewStyle = {
  backgroundColor: colors.surface,
  borderRadius: radii.xl,
  ...shadow.md,
};

export const cardFlat: ViewStyle = {
  backgroundColor: colors.surface,
  borderRadius: radii.xl,
  borderWidth: 1,
  borderColor: colors.borderLight,
};

export const pill: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: 4,
  backgroundColor: colors.primary,
  paddingHorizontal: space.lg,
  paddingVertical: 9,
  borderRadius: radii["2xl"],
};

export const input: ViewStyle = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radii.md,
  paddingHorizontal: space.lg,
  paddingVertical: space.md,
};

export const fab: ViewStyle = {
  position: "absolute",
  bottom: 28,
  right: space.xl,
  width: 52,
  height: 52,
  borderRadius: 26,
  backgroundColor: colors.primary,
  alignItems: "center",
  justifyContent: "center",
  ...shadow.colored(colors.primary),
};
