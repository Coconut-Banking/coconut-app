import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useHomePalette } from "../../lib/home-theme";
import { HOME_LAYOUT } from "../../lib/home-typography";

/** Figma Union — gradient wave; fixed 226pt curve (status bar is a flat fill above, not extra wave). */
const WAVE_HEIGHT = HOME_LAYOUT.heroHeight;

export const HomeHeroBackdrop = React.memo(function HomeHeroBackdrop({
  topInset = 0,
}: {
  /** Status-bar fill above the wave (mint), not added to wave curve height. */
  topInset?: number;
}) {
  const home = useHomePalette();
  const { width } = useWindowDimensions();
  const w = width + 4;
  const h = WAVE_HEIGHT;

  const d = [
    `M -2 0`,
    `H ${w - 2}`,
    `V ${h * 0.5}`,
    `C ${w * 0.82} ${h * 0.92} ${w * 0.18} ${h * 0.78} -2 ${h * 0.62}`,
    `Z`,
  ].join(" ");

  return (
    <View style={[styles.wrap, { height: topInset + h }]} pointerEvents="none">
      {topInset > 0 ? (
        <View
          style={[styles.statusFill, { height: topInset, backgroundColor: home.waveTop }]}
        />
      ) : null}
      <View style={[styles.waveLayer, { top: topInset, height: h }]}>
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Defs>
            <LinearGradient id="heroWave" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={home.waveTop} />
              <Stop offset="1" stopColor={home.waveBottom} />
            </LinearGradient>
          </Defs>
          <Path d={d} fill="url(#heroWave)" />
        </Svg>
      </View>
    </View>
  );
});

/** Total hero block height for layout (status bar + Figma wave). */
export function homeHeroBlockHeight(topInset: number): number {
  return topInset + WAVE_HEIGHT;
}

export const HOME_HERO_WAVE_HEIGHT = WAVE_HEIGHT;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  statusFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  waveLayer: {
    position: "absolute",
    left: -2,
    right: -2,
    overflow: "hidden",
  },
});
