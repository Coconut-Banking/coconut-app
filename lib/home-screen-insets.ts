import { HOME_LAYOUT } from "./home-typography";

/** Figma frame FINAL HOME TENTATIVE is 402×874 (node 138:1929). */
export const HOME_FIGMA_WIDTH = HOME_LAYOUT.screenWidth;

/** Transaction rows / section title: x≈22–23px on a 402pt-wide frame. */
export const HOME_TX_HORIZONTAL = HOME_LAYOUT.horizontalPadding;

/** Owed bands: 322pt wide, centered → ~40px side inset on 402pt. */
export function homeBalanceSideInset(screenWidth: number): number {
  return Math.max(
    HOME_TX_HORIZONTAL,
    Math.round((screenWidth - HOME_LAYOUT.bandMaxWidth) / 2),
  );
}

/** Legacy helper — use the larger of safe area and Figma tx inset. */
export function homeHorizontalPadding(insets: { left: number; right: number }): number {
  return Math.max(HOME_TX_HORIZONTAL, insets.left + 8, insets.right + 8);
}

/** Right padding for list content (tx inset + FAB column). */
export function homeListPaddingRight(horizontal: number): number {
  return horizontal + HOME_LAYOUT.fabSize + 12;
}

/** Figma: coconut notification shell ~24px from right edge (x=330 on 402w frame). */
export const HOME_NOTIF_RIGHT = 24;

/** Figma: profile top y=64 on full frame — ~5–8pt below typical status bar in mock. */
export function homeAvatarTopOffset(topInset: number): number {
  return topInset + 5;
}

/** Figma: notification group top y=72. */
export function homeNotifTopOffset(topInset: number): number {
  return topInset + 13;
}
