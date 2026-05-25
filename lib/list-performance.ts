import { Platform, type FlatListProps } from "react-native";

/** Shared FlatList tuning for smooth scrolling across main feeds. */
export const FLAT_LIST_PERF: Pick<
  FlatListProps<unknown>,
  | "initialNumToRender"
  | "maxToRenderPerBatch"
  | "windowSize"
  | "updateCellsBatchingPeriod"
  | "removeClippedSubviews"
> = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === "android",
};
