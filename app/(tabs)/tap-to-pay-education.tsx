import { useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font, radii, space } from "../../lib/theme";
import { markTapToPayEducationCompleted } from "../../lib/tap-to-pay-onboarding";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Contactless cards",
    body: "Hold the customer’s contactless card or device near the top of your iPhone. Wait for the checkmark—don’t remove the card too early.",
  },
  {
    title: "Apple Pay & digital wallets",
    body: "Customers can pay with Apple Pay and other digital wallets the same way: they hold their phone or watch near the top of your iPhone until the payment completes.",
  },
  {
    title: "PIN (where supported)",
    body: "In regions that require a PIN, the customer enters it on the on-screen PIN pad. Accessibility options on that screen follow system settings.",
  },
  {
    title: "If a card can’t be read",
    body: "If Tap to Pay can’t read a card, offer another way to pay—for example a payment link or a physical card reader if you use one. Requirements vary by region.",
  },
  {
    title: "iOS 18+ discovery",
    body: "On supported versions of iOS, Apple may show system discovery and education for Tap to Pay. Your Payment Service Provider (Stripe) integrates with these experiences where available.",
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
    <>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={back} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Tap to Pay guide</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {params.fromTerms === "1" ? (
            <View style={[styles.banner, { backgroundColor: theme.successLight, borderColor: theme.border }]}>
              <Ionicons name="checkmark-circle" size={22} color={theme.positive} />
              <Text style={[styles.bannerText, { color: theme.text }]}>
                Terms accepted. Review these tips once—then collect from an expense or settlement.
              </Text>
            </View>
          ) : null}

          <Text style={[styles.lead, { color: theme.textSecondary }]}>
            Use this guide when accepting payments with Tap to Pay on iPhone. You can open it anytime from
            Settings.
          </Text>

          {SECTIONS.map((s) => (
            <View
              key={s.title}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
            >
              <Text style={[styles.cardTitle, { color: theme.text }]}>{s.title}</Text>
              <Text style={[styles.cardBody, { color: theme.textSecondary }]}>{s.body}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.primary }]}
            onPress={done}
            activeOpacity={0.9}
          >
            <TapToPayCtaIcon color="#fff" />
            <Text style={styles.ctaText}>Add an expense to collect</Text>
          </TouchableOpacity>

          {Platform.OS !== "web" ? (
            <Text style={[styles.note, { color: theme.textQuaternary }]}>
              Requires a dev or production build with Stripe Terminal native modules (not Expo Go).
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function TapToPayCtaIcon({ color }: { color: string }) {
  return <Ionicons name="phone-portrait-outline" size={20} color={color} style={{ marginRight: 8 }} />;
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
  headerTitle: { fontSize: 17, fontFamily: font.semibold, fontWeight: "600" },
  scroll: { padding: space.lg, paddingBottom: 40 },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerText: { flex: 1, fontSize: 15, fontFamily: font.medium, lineHeight: 22 },
  lead: { fontSize: 16, fontFamily: font.regular, lineHeight: 24, marginBottom: 20 },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 17, fontFamily: font.semibold, fontWeight: "600", marginBottom: 8 },
  cardBody: { fontSize: 15, fontFamily: font.regular, lineHeight: 22 },
  cta: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: radii.xl,
  },
  ctaText: { color: "#fff", fontSize: 17, fontFamily: font.semibold, fontWeight: "600" },
  note: { marginTop: 16, fontSize: 12, fontFamily: font.regular, textAlign: "center", lineHeight: 18 },
});
