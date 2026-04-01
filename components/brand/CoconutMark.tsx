/**
 * App mark — matches web `app/icon.svg` (rounded square + coconut silhouette).
 * Use instead of the 🥥 emoji so the login screen always shows a real logo.
 */
import { View, StyleSheet, Platform } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

type Props = {
  size?: number;
  /** Slight lift on auth screens */
  elevated?: boolean;
};

export function CoconutMark({ size = 72, elevated = false }: Props) {
  return (
    <View style={[styles.shadowHost, elevated && styles.elevated, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" accessibilityLabel="Coconut logo">
        <Rect width={32} height={32} rx={8} fill="#1F2328" />
        <Path
          d="M16 8c-2 4-4 8-4 12 0 4 2 6 4 8 2-2 4-4 4-8s-2-8-4-12z"
          fill="#FFFFFF"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowHost: {
    marginBottom: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#1F2328",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  elevated: {
    ...Platform.select({
      ios: {
        shadowOpacity: 0.55,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
      default: {},
    }),
  },
});
