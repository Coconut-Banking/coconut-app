import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useHomePalette } from "../../lib/home-theme";

/** Figma canvas bottom — hero mint at top (no white strip under status bar). */
const CANVAS_BOTTOM = "#F6F0E2";

export const HomeScreenBackground = React.memo(function HomeScreenBackground() {
  const home = useHomePalette();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const padW = width * 0.5;
  const padH = height * 0.5;
  const topColor = home.waveTop;
  const bleedTop = insets.top;

  return (
    <View
      style={[StyleSheet.absoluteFill, bleedTop > 0 ? { top: -bleedTop, height: height + bleedTop } : null]}
      pointerEvents="none"
    >
      <Svg width={width} height={height + bleedTop}>
        <Defs>
          <LinearGradient
            id="homeCanvas"
            x1="0.25"
            y1="0.5"
            x2="0.75"
            y2="0.5"
            gradientUnits="objectBoundingBox"
            gradientTransform="matrix(0, 0.09, -0.09, 0, 0.55, 0.36)"
          >
            <Stop offset="0" stopColor={topColor} />
            <Stop offset="1" stopColor={CANVAS_BOTTOM} />
          </LinearGradient>
        </Defs>
        {/* Match layer0.bounds inset (-0.5×) so the fade is softer like Figma */}
        <Rect
          x={-padW}
          y={-padH}
          width={width + padW * 2}
          height={height + padH * 2}
          fill="url(#homeCanvas)"
        />
      </Svg>
    </View>
  );
});

export { CANVAS_BOTTOM };
