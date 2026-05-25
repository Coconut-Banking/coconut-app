import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { HomeScreenBackground } from "../home/HomeScreenBackground";
import { useTheme } from "../../lib/theme-context";

type Props = {
  children: React.ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  /** Show Figma canvas gradient (light mode only). */
  gradient?: boolean;
};

/** Standard screen chrome: safe area + optional coconut gradient. */
export function CoconutScreen({ children, edges = ["top"], style, gradient = true }: Props) {
  const { isDark } = useTheme();

  return (
    <View style={[styles.root, style]}>
      {gradient && !isDark ? <HomeScreenBackground /> : null}
      <SafeAreaView style={styles.safe} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  safe: { flex: 1, backgroundColor: "transparent" },
});
