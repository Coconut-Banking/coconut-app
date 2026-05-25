import { HOME_LAYOUT } from "./home-typography";

/** Horizontal padding for home content (Figma 22pt + safe area on notched devices). */
export function homeHorizontalPadding(insets: { left: number; right: number }): number {
  return Math.max(HOME_LAYOUT.horizontalPadding, insets.left + 8, insets.right + 8);
}

/** Space reserved on the right for stacked FABs. */
export function homeListPaddingRight(horizontal: number): number {
  return horizontal + HOME_LAYOUT.fabSize + 12;
}
