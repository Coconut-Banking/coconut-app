import { Platform, type ScrollViewProps } from "react-native";

/**
 * iOS adds automatic safe-area content inset on ScrollView/FlatList by default,
 * which leaves a blank band under the status bar (shows white canvas gradient).
 */
export const EDGE_TO_EDGE_SCROLL_PROPS: Pick<
  ScrollViewProps,
  "contentInsetAdjustmentBehavior" | "automaticallyAdjustsScrollIndicatorInsets" | "scrollIndicatorInsets"
> =
  Platform.OS === "ios"
    ? {
        contentInsetAdjustmentBehavior: "never",
        automaticallyAdjustsScrollIndicatorInsets: false,
        scrollIndicatorInsets: { top: 0, left: 0, bottom: 0, right: 0 },
      }
    : {};
