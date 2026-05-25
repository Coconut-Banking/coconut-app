import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { font } from "../../lib/theme";
import { useCoconutShell } from "../../lib/coconut-shell";

type Step = { key: string; label: string };

type Props = {
  steps: Step[];
  currentIndex: number;
};

export function CoconutProgressSteps({ steps, currentIndex }: Props) {
  const shell = useCoconutShell();

  return (
    <View style={styles.wrap}>
      {steps.map((step, i) => {
        const active = i === currentIndex;
        const done = i < currentIndex;
        const fill = active || done ? shell.cta : shell.boxFill;
        return (
          <Animated.View
            key={step.key}
            entering={FadeIn.duration(220)}
            style={styles.seg}
          >
            <View style={[styles.track, { backgroundColor: shell.boxFill }]}>
              <View style={[styles.fill, { backgroundColor: fill, width: done ? "100%" : active ? "55%" : "0%" }]} />
            </View>
            <Text
              style={[
                styles.label,
                { color: active ? shell.ink : shell.inkMuted },
                active && { fontFamily: font.bold },
              ]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  seg: { flex: 1, gap: 6 },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  label: {
    fontSize: 10,
    fontFamily: font.medium,
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
