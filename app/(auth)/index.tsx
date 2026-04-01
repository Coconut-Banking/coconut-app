import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "../../lib/theme-context";
import { font, radii, shadow } from "../../lib/theme";
import { CoconutMark } from "../../components/brand/CoconutMark";

export default function WelcomeScreen() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.brand}>
          <CoconutMark size={64} elevated />
          <Text style={[styles.appName, { color: theme.text }]}>Coconut</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500).duration(800)} style={styles.hero}>
          <Text style={[styles.heroText, { color: theme.text }]}>
            {"Split.\nSettle.\nDone."}
          </Text>
          <Text style={[styles.heroSub, { color: theme.textTertiary }]}>
            The fastest way to split expenses and settle up with friends.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(800).duration(800)} style={styles.ctaWrap}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.push("/(auth)/sign-in")}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
          </TouchableOpacity>
          <Text style={[styles.footnote, { color: theme.textQuaternary }]}>
            Free to use · No hidden fees
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
  },
  brand: {
    marginBottom: "auto" as unknown as number,
  },
  appName: {
    fontSize: 28,
    fontFamily: font.bold,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 8,
  },
  hero: {
    marginVertical: "auto" as unknown as number,
  },
  heroText: {
    fontSize: 52,
    fontFamily: font.black,
    fontWeight: "900",
    lineHeight: 54,
    letterSpacing: -1.5,
    marginBottom: 16,
  },
  heroSub: {
    fontSize: 17,
    fontFamily: font.regular,
    lineHeight: 26,
    maxWidth: 300,
  },
  ctaWrap: {
    marginTop: "auto" as unknown as number,
  },
  primaryBtn: {
    height: 56,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  primaryBtnText: {
    fontSize: 17,
    fontFamily: font.semibold,
    fontWeight: "600",
    color: "#fff",
  },
  footnote: {
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: "center",
    marginTop: 16,
  },
});
