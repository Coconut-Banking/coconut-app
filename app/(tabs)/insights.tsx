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
import { colors, font, fontSize, shadow, radii, space } from "../../lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-lemon.vercel.app";

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
  const { transactions, linked, loading } = useTransactions();
  const { subscriptions, loading: subsLoading } = useSubscriptions();
  const { summary: groupsSummary } = useGroupsSummary();

  const monthlySpend = useMemo(() => deriveMonthlySpend(transactions), [transactions]);
  const subsTotal = useMemo(
    () => subscriptions.reduce((s, sub) => s + sub.amount, 0),
    [subscriptions]
  );
  const topCategories = useMemo(
    () => deriveTopCategories(transactions),
    [transactions]
  );
  const sharedNet = groupsSummary
    ? groupsSummary.totalOwedToMe - groupsSummary.totalIOwe
    : 0;

  const openSettings = () => router.push("/(tabs)/settings");

  if (!linked) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="analytics-outline" size={48} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Connect your bank</Text>
        <Text style={styles.emptySubtitle}>
          Link your account to see spending insights and subscriptions.
        </Text>
        <TouchableOpacity
          style={styles.connectButton}
          onPress={() => Linking.openURL(`${API_URL.replace(/\/$/, "")}/connect-from-app`)}
        >
          <Text style={styles.connectButtonText}>Connect in web app</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading insights...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <Text style={styles.title}>Insights</Text>
        <TouchableOpacity onPress={openSettings} style={styles.settingsBtn} hitSlop={12}>
          <Ionicons name="settings-outline" size={22} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Summary cards */}
      <View style={styles.cardsRow}>
        <View style={[styles.card, { backgroundColor: colors.redBg }]}>
          <Ionicons name="trending-down" size={20} color={colors.red} />
          <Text style={styles.cardValue}>${monthlySpend.toLocaleString()}</Text>
          <Text style={styles.cardLabel}>This month</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.purpleBg }]}>
          <Ionicons name="refresh" size={20} color={colors.purple} />
          <Text style={styles.cardValue}>${subsTotal.toFixed(0)}</Text>
          <Text style={styles.cardLabel}>Subscriptions</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.primaryLight, marginBottom: 24 }]}>
        <Ionicons name="people" size={20} color={colors.primary} />
        <Text
          style={[
            styles.cardValue,
            sharedNet > 0 && { color: colors.green },
            sharedNet < 0 && { color: colors.amber },
          ]}
        >
          {sharedNet >= 0 ? "+" : ""}${sharedNet.toFixed(0)}
        </Text>
        <Text style={styles.cardLabel}>Shared net</Text>
      </View>

      {/* Top categories */}
      {topCategories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top spending</Text>
          <View style={styles.categoryList}>
            {topCategories.map((cat, i) => (
              <View key={cat.name} style={styles.categoryRow}>
                <Text style={styles.categoryIndex}>{i + 1}</Text>
                <Text style={styles.categoryName} numberOfLines={1}>
                  {cat.name}
                </Text>
                <Text style={styles.categoryAmount}>${cat.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Subscriptions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscriptions</Text>
        {subsLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : subscriptions.length === 0 ? (
          <Text style={styles.emptyText}>No subscriptions detected yet</Text>
        ) : (
          <View style={styles.subList}>
            {subscriptions.map((sub) => (
              <View key={sub.id} style={styles.subRow}>
                <View style={styles.subIcon}>
                  <Ionicons name="refresh" size={16} color={colors.purple} />
                </View>
                <View style={styles.subInfo}>
                  <Text style={styles.subMerchant} numberOfLines={1}>
                    {sub.merchant}
                  </Text>
                  <Text style={styles.subMeta}>
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
