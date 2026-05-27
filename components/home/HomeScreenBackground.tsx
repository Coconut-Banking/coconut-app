import React from "react";
import { StyleSheet, View } from "react-native";

/** Figma canvas — cream body; mint hero comes only from HomeHeroBackdrop. */
const CANVAS_BOTTOM = "#F6F0E2";

/**
 * Full-screen cream fill. Do not paint a mint gradient under the status bar here —
 * that duplicated HomeHeroBackdrop and made the top look stretched on notched iPhones.
 */
export const HomeScreenBackground = React.memo(function HomeScreenBackground() {
  return <View style={styles.fill} pointerEvents="none" />;
});

export { CANVAS_BOTTOM };

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CANVAS_BOTTOM,
  },
});
