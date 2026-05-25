import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useHomePalette } from "../../lib/home-theme";

/** Figma Union — gradient #EDF4F3 → #D2EFED, ~226pt tall wave. */
const WAVE_HEIGHT = 226;

export const HomeHeroBackdrop = React.memo(function HomeHeroBackdrop({
  topInset = 0,
}: {
  /** Extend wave under status bar so there is no white gap. */
  topInset?: number;
}) {
  const home = useHomePalette();
  const { width } = useWindowDimensions();
  const w = width + 4;
  const h = WAVE_HEIGHT + topInset;

  const d = [
    `M -2 0`,
    `H ${w - 2}`,
    `V ${h * 0.5}`,
    `C ${w * 0.82} ${h * 0.92} ${w * 0.18} ${h * 0.78} -2 ${h * 0.62}`,
    `Z`,
  ].join(" ");

  return (
    <View style={[styles.wrap, { height: h, marginTop: -topInset }]} pointerEvents="none">
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
  );
});

export const HOME_HERO_WAVE_HEIGHT = WAVE_HEIGHT;

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: -2,
    right: -2,
  },
});
