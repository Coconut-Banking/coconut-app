import { useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font, radii } from "../../lib/theme";
import { markTapToPayEducationCompleted } from "../../lib/tap-to-pay-onboarding";

const SECTIONS: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  title: string;
  body: string;
}[] = [
  {
    icon: "wifi-outline",
    color: "#3B82F6",
    title: "Tap a contactless card",
    body: "Hold the card near the top of your iPhone and wait for the checkmark.",
  },
  {
    icon: "phone-portrait-outline",
    color: "#1F2328",
    title: "Apple Pay & digital wallets",
    body: "Customers hold their phone or watch near yours — same as a card.",
  },
  {
    icon: "keypad-outline",
    color: "#F59E0B",
    title: "PIN entry (where required)",
    body: "The customer enters their PIN on the on-screen pad if needed.",
  },
  {
    icon: "refresh-circle-outline",
    color: "#EF4444",
    title: "If a card can't be read",
    body: "Ask the customer to try again or use an alternative payment method.",
  },
  {
    icon: "shield-checkmark-outline",
    color: "#8B5CF6",
    title: "Powered by Stripe",
    body: "Payments are processed securely by Stripe Terminal — no card data stored.",
  },
];

/** In-app merchant education (Apple checklist §4). Also linked from Settings. */
export default function TapToPayEducationScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ fromTerms?: string }>();

  const done = useCallback(async () => {
    await markTapToPayEducationCompleted();
    router.push("/(tabs)/add-expense");
  }, [router]);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/settings");
  }, [router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={back} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Tap to Pay guide</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.body}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroIconWrap, { backgroundColor: theme.surfaceSecondary }]}>
            <Ionicons name="phone-portrait" size={32} color={theme.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>How it works</Text>
            {params.fromTerms === "1" ? (
              <Text style={[styles.heroSub, { color: theme.positive }]}>Terms accepted — you're ready to collect.</Text>
            ) : (
              <Text style={[styles.heroSub, { color: theme.textTertiary }]}>Accept contactless payments right from your iPhone.</Text>
            )}
          </View>
        </View>

        {/* Sections */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {SECTIONS.map((s, i) => (
            <View key={s.title}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: s.color + "18" }]}>
                  <Ionicons name={s.icon} size={20} color={s.color} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>{s.title}</Text>
                  <Text style={[styles.rowBody, { color: theme.textTertiary }]} numberOfLines={2}>{s.body}</Text>
                </View>
              </View>
              {i < SECTIONS.length - 1 ? (
                <View style={[styles.sep, { backgroundColor: theme.borderLight }]} />
              ) : null}
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: theme.primary }]}
          onPress={done}
          activeOpacity={0.9}
        >
          <Ionicons name="phone-portrait-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.ctaText}>Add an expense to collect</Text>
        </TouchableOpacity>

        {Platform.OS !== "web" ? (
          <Text style={[styles.note, { color: theme.textQuaternary }]}>
            Requires a dev or production build with Stripe Terminal.
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: font.semibold },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    justifyContent: "space-between",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: font.bold,
    letterSpacing: -0.4,
  },
  heroSub: {
    fontSize: 14,
    fontFamily: font.regular,
    marginTop: 2,
    lineHeight: 20,
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: "hidden",
    flex: 1,
    marginVertical: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontFamily: font.semibold },
  rowBody: { fontSize: 13, fontFamily: font.regular, marginTop: 1, lineHeight: 18 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 70 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: radii.xl,
  },
  ctaText: { color: "#fff", fontSize: 17, fontFamily: font.semibold },
  note: { marginTop: 10, fontSize: 12, fontFamily: font.regular, textAlign: "center" },
});
