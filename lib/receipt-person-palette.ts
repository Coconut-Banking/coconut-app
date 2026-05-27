/**
 * Person accent colors for receipt split — aligned with Coconut Figma / home palette.
 * Teal accent (#457D80), earth tones, and semantic greens/reds from Home Flow.
 */
export const RECEIPT_PERSON_ACCENTS = [
  "#457D80",
  "#345300",
  "#493D32",
  "#795D59",
  "#790C00",
  "#D27455",
] as const;

export function receiptPersonAccent(index: number): string {
  return RECEIPT_PERSON_ACCENTS[index % RECEIPT_PERSON_ACCENTS.length];
}

export function receiptPersonTint(accent: string, isDark: boolean): string {
  return `${accent}${isDark ? "33" : "1A"}`;
}

export function receiptPersonAvatarBg(accent: string, isDark: boolean): string {
  return `${accent}${isDark ? "40" : "22"}`;
}
