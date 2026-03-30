import { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTransactions } from "../../hooks/useTransactions";
import { useSubscriptions } from "../../hooks/useSubscriptions";
import { useGroupsSummary } from "../../hooks/useGroups";
import { useTheme } from "../../lib/theme-context";
import { colors, font, fontSize, shadow, radii, space } from "../../lib/theme";
import { MerchantLogo } from "../../components/merchant/MerchantLogo";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-app.dev";

function deriveMonthlySpend(transactions: { amount: number; date: string }[]): number {
  const thisMonth = new Date().toISOString().slice(0, 7);
  return transactions
    .filter((tx) => tx.date.startsWith(thisMonth))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

function deriveTopCategories(
  transactions: { amount: number; category?: string }[],
  limit = 5
): { name: string; amount: number }[] {
  const byCat: Record<string, number> = {};
  for (const tx of transactions) {
    const cat = (tx.category ?? "Other").replace(/_/g, " ");
    byCat[cat] = (byCat[cat] ?? 0) + Math.abs(tx.amount);
  }
  return Object.entries(byCat)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, amount]) => ({ name, amount }));
}

export default function InsightsScreen() {
  const { theme } = useTheme();
  const { transactions, linked, loading } = useTransactions();
  const { subscriptions, loading: subsLoading } = useSubscriptions();
  const { summary: groupsSummary } = useGroupsSummary({ contacts: true });

  const monthlySpend = useMemo(() => deriveMonthlySpend(transactions), [transactions]);
  const subsTotal = useMemo(
    () => subscriptions.reduce((s, sub) => s + sub.amount, 0),
    [subscriptions]
  );
  const topCategories = useMemo(
    () => deriveTopCategories(transactions),
    [transactions]
  );
  const sharedNetText =
    groupsSummary?.netBalance != null
      ? `${groupsSummary.netBalance >= 0 ? "+" : ""}$${Math.abs(groupsSummary.netBalance).toFixed(0)}`
      : (groupsSummary?.totalsByCurrency?.length ?? 0) > 1
        ? "Multiple currencies"
        : "$0";
  const sharedNetTone =
    groupsSummary?.netBalance != null
      ? groupsSummary.netBalance > 0
        ? 1
        : groupsSummary.netBalance < 0
          ? -1
          : 0
      : 0;

  const openSettings = () => router.push("/(tabs)/settings");

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textTertiary }]}>Loading insights...</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3D8E62" />
        <Text style={styles.loadingText}>Loading insights...</Text>
      </View>
    );
  }

  if (!linked) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="analytics-outline" size={48} color={theme.textQuaternary} />
        <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>Connect your bank</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textTertiary }]}>
          Link your account to see spending insights and subscriptions.
        </Text>
        <TouchableOpacity
          style={[styles.connectButton, { backgroundColor: theme.primary }]}
          onPress={() => Linking.openURL(`${API_URL.replace(/\/$/, "")}/connect-from-app`)}
        >
          <Text style={styles.connectButtonText}>Connect in web app</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Insights</Text>
        <TouchableOpacity onPress={openSettings} style={styles.settingsBtn} hitSlop={12}>
          <Ionicons name="settings-outline" size={22} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Summary cards */}
      <View style={styles.cardsRow}>
        <View style={[styles.card, { backgroundColor: "#FEE2E2" }]}>
          <Ionicons name="trending-down" size={20} color="#DC2626" />
          <Text style={[styles.cardValue, { color: theme.text }]}>${monthlySpend.toLocaleString()}</Text>
          <Text style={[styles.cardLabel, { color: theme.textTertiary }]}>This month</Text>
        </View>
        <View style={[styles.card, { backgroundColor: "#F3E8FF" }]}>
          <Ionicons name="refresh" size={20} color="#7C3AED" />
          <Text style={[styles.cardValue, { color: theme.text }]}>${subsTotal.toFixed(0)}</Text>
          <Text style={[styles.cardLabel, { color: theme.textTertiary }]}>Subscriptions</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.primaryLight, marginBottom: 24 }]}>
        <Ionicons name="people" size={20} color={theme.primary} />
        <Text
          style={[
            styles.cardValue,
            { color: theme.text },
            sharedNetTone > 0 && { color: theme.positive },
            sharedNetTone < 0 && { color: "#B45309" },
          ]}
        >
          {sharedNetText}
        </Text>
        <Text style={[styles.cardLabel, { color: theme.textTertiary }]}>Shared net</Text>
      </View>

      {/* Top categories */}
      {topCategories.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Top spending</Text>
          <View style={[styles.categoryList, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {topCategories.map((cat, i) => (
              <View key={cat.name} style={[styles.categoryRow, { borderBottomColor: theme.borderLight }]}>
                <Text style={[styles.categoryIndex, { color: theme.textQuaternary }]}>{i + 1}</Text>
                <Text style={[styles.categoryName, { color: theme.text }]} numberOfLines={1}>
                  {cat.name}
                </Text>
                <Text style={[styles.categoryAmount, { color: theme.text }]}>${cat.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Subscriptions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Subscriptions</Text>
        {subsLoading ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : subscriptions.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textQuaternary }]}>No subscriptions detected yet</Text>
        ) : (
          <View style={[styles.subList, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {subscriptions.map((sub) => (
              <View key={sub.id} style={[styles.subRow, { borderBottomColor: theme.borderLight }]}>
                <MerchantLogo
                  merchantName={sub.merchant}
                  size={36}
                  backgroundColor={colors.purpleBg}
                  borderColor={theme.borderLight}
                />
                <View style={styles.subInfo}>
                  <Text style={[styles.subMerchant, { color: theme.text }]} numberOfLines={1}>
                    {sub.merchant}
                  </Text>
                  <Text style={[styles.subMeta, { color: theme.textTertiary }]}>
                    ${sub.amount.toFixed(2)}/{sub.frequency}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: { fontSize: 24, fontWeight: "700", fontFamily: font.bold, color: colors.text },
  settingsBtn: { padding: 4 },
  cardsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    borderRadius: radii.xl,
    padding: 16,
    ...shadow.md,
  },
  cardValue: { fontSize: 18, fontWeight: "700", fontFamily: font.bold, color: colors.text, marginTop: 8 },
  cardLabel: { fontSize: 12, fontFamily: font.regular, color: colors.textTertiary, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "600", fontFamily: font.semibold, color: colors.textSecondary, marginBottom: 12 },
  categoryList: { backgroundColor: colors.surface, borderRadius: radii.md, ...shadow.md },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  categoryIndex: {
    width: 24,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: font.semibold,
    color: colors.textMuted,
  },
  categoryName: { flex: 1, fontSize: 15, fontFamily: font.regular, color: colors.text },
  categoryAmount: { fontSize: 15, fontWeight: "600", fontFamily: font.semibold, color: colors.text },
  subList: { backgroundColor: colors.surface, borderRadius: radii.md, ...shadow.md },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  subIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.purpleBg,
    alignItems: "center",
    justifyContent: "center",
  },
  subInfo: { flex: 1, marginLeft: 12 },
  subMerchant: { fontSize: 15, fontWeight: "500", fontFamily: font.medium, color: colors.text },
  subMeta: { fontSize: 12, fontFamily: font.regular, color: colors.textTertiary, marginTop: 2 },
  emptyText: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: "600", fontFamily: font.semibold, color: colors.textSecondary, marginTop: 16 },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: font.regular,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 32,
  },
  connectButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radii.lg,
    marginTop: 24,
  },
  connectButtonText: { color: "#fff", fontWeight: "600", fontFamily: font.semibold, fontSize: 16 },
  loadingText: { fontSize: 14, fontFamily: font.regular, color: colors.textTertiary, marginTop: 12 },
});
