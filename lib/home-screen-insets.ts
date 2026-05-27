import { Platform } from "react-native";
import { HOME_LAYOUT } from "./home-typography";

/** Matches CoconutTabBar: paddingTop 8 + row ~56 + label gap + bottom safe pad. */
export function homeTabBarHeight(bottomInset: number): number {
  const bottomPad = Math.max(bottomInset, Platform.OS === "ios" ? 10 : 8) + 10;
  return 8 + 56 + bottomPad + 6;
}

/** FlatList bottom padding so the last tx row clears the tab bar + FAB column. */
export function homeListBottomPadding(bottomInset: number): number {
  return homeTabBarHeight(bottomInset) + 40;
}

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

/**
 * Figma frame: avatar top y=64 on 874pt artboard (status bar included in frame).
 * Map to device: small gap below safe area, not double-counting inset in wave height.
 */
export function homeAvatarTopOffset(topInset: number): number {
  return Math.max(topInset, 47) + 8;
}

/** Figma: notification shell top y=72. */
export function homeNotifTopOffset(topInset: number): number {
  return Math.max(topInset, 47) + 16;
}

/** Space for avatar (64) + gap before balance label (Figma label y≈150, avatar bottom ≈128). */
export function homeHeaderContentHeight(topInset: number): number {
  return homeAvatarTopOffset(topInset) + 64 + 18;
}
