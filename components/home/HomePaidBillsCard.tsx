import React, { useCallback, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";
import { font, radii, space } from "../../lib/theme";
import { useBills, type BillRow } from "../../hooks/useBills";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { useDemoMode } from "../../lib/demo-mode-context";

function PaidBillRow({ bill }: { bill: BillRow }) {
  const { theme } = useTheme();
  const home = useHomePalette();
  const when = bill.paidAt
    ? new Date(bill.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

  return (
    <View style={[styles.row, { borderTopColor: home.boxBorder }]}>
      <View style={[styles.check, { backgroundColor: home.moneyInSoft }]}>
        <Ionicons name="checkmark" size={14} color={home.moneyInText} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {bill.label}
        </Text>
        <Text style={[styles.rowSub, { color: theme.textTertiary }]} numberOfLines={1}>
          {bill.groupName}
          {when ? ` · ${when}` : ""}
        </Text>
      </View>
      <Text style={[styles.amount, { color: theme.text }]}>
        {formatSplitCurrencyAmount(bill.amount, bill.currency)}
      </Text>
    </View>
  );
}

/** Shown on home only when the user has at least one paid bill. */
export const HomePaidBillsCard = React.memo(function HomePaidBillsCard() {
  const { theme } = useTheme();
  const home = useHomePalette();
  const { isDemoOn } = useDemoMode();
  const { bills, loading, refetch } = useBills("paid");

  useEffect(() => {
    if (!isDemoOn) void refetch();
  }, [isDemoOn, refetch]);

  const onSeeAll = useCallback(() => {
    router.push("/(tabs)/shared");
  }, []);

  if (isDemoOn) return null;
  if (!loading && bills.length === 0) return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: home.boxFill, borderColor: home.boxBorder },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: home.balanceLabel }]}>PAID BILLS</Text>
        {bills.length > 0 ? (
          <TouchableOpacity onPress={onSeeAll} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: theme.textSecondary }]}>Shared</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {loading && bills.length === 0 ? (
        <ActivityIndicator style={{ marginVertical: space.sm }} color={theme.primary} />
      ) : (
        bills.slice(0, 3).map((b) => <PaidBillRow key={b.id} bill={b} />)
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    marginBottom: 14,
    maxWidth: 322,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: 0.5,
  },
  seeAll: {
    fontSize: 13,
    fontFamily: font.semibold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontFamily: font.semibold },
  rowSub: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  amount: { fontSize: 15, fontFamily: font.bold },
});
