import { View, Image, StyleSheet, Platform } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const logoSource = require("../../assets/coconut-mark.jpg") as number;

type Props = {
  size?: number;
  /** Slight lift on auth screens */
  elevated?: boolean;
};

export function CoconutMark({ size = 72, elevated = false }: Props) {
  return (
    <View style={[styles.shadowHost, elevated && styles.elevated, { width: size, height: size }]}>
      <Image
        source={logoSource}
        style={{ width: size, height: size, borderRadius: size * 0.22 }}
        accessibilityLabel="Coconut logo"
      />
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
