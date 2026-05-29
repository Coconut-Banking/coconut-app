import React, { type ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";

/** Warm tint over frosted glass — matches Home coconut shell (#493D32). */
const GLASS_TINT = "rgba(73, 61, 50, 0.22)";

type Props = {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Liquid glass pill/circle behind FAB content.
 * iOS 26+: native UIGlassEffect via expo-glass-effect.
 * Other platforms: frosted fallback.
 */
export function FabGlassSurface({ style, children }: Props) {
  const flat = StyleSheet.flatten(style) ?? {};
  const radius =
    typeof flat.borderRadius === "number" ? flat.borderRadius : 25;

  const nativeGlass =
    Platform.OS === "ios" && isGlassEffectAPIAvailable();

  return (
    <View
      style={[
        styles.shell,
        { borderRadius: radius },
        !nativeGlass && styles.fallback,
        style,
      ]}
    >
      {Platform.OS === "ios" ? (
        <GlassView
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
          glassEffectStyle="regular"
          tintColor={GLASS_TINT}
          isInteractive
          colorScheme="light"
        />
      ) : null}
      <View style={styles.foreground} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(255, 255, 255, 0.55)",
  },
  fallback: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    ...Platform.select({
      ios: {
        shadowColor: "#493D32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  foreground: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 1,
  },
});
