import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { type DateFilterPreset } from "./HomeSpeedDialSearch";
import { useHomePalette } from "../../lib/home-theme";
import { SnapPress } from "../ui";
import type { TxSourceTab } from "../../lib/transaction-filters";

export function HomeTransactionsFooter() {
  const home = useHomePalette();
  return (
    <SnapPress
      onPress={() => router.navigate("/(tabs)/bank")}
      style={[styles.seeAll, { backgroundColor: home.boxFill }]}
      haptic="light"
    >
      <Text style={[styles.seeAllText, { color: home.ink }]}>See all</Text>
      <Ionicons name="arrow-forward" size={16} color={home.inkMuted} />
    </SnapPress>
  );
}

export const HomeBankTransactionsSection = React.memo(function HomeBankTransactionsSection({
  transactionCount,
  loading,
  linked,
  useDemoUi,
  searchQuery,
  onSearchQueryChange,
  dateFilter,
  onDateFilterChange,
  txSource,
  onTxSourceChange,
  onSubmitSearch,
  onConnectBank,
  searchActive,
  onSearchActivate,
}: {
  transactionCount: number;
  loading: boolean;
  linked: boolean;
  useDemoUi: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  dateFilter: DateFilterPreset;
  onDateFilterChange: (p: DateFilterPreset) => void;
  txSource: TxSourceTab;
  onTxSourceChange: (tab: TxSourceTab) => void;
  onSubmitSearch?: () => void;
  onConnectBank?: () => void;
  searchActive?: boolean;
  onSearchActivate?: () => void;
}) {
  const { theme } = useTheme();
  const home = useHomePalette();
  const hasRows = transactionCount > 0;

  return (
    <Animated.View entering={FadeIn.duration(400).delay(120)} style={styles.section}>
      {!searchActive ? (
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: home.sectionTitle }]}>BANK TRANSACTIONS</Text>
          {onSearchActivate ? (
            <TouchableOpacity
              onPress={onSearchActivate}
              style={[styles.searchFab, { backgroundColor: home.coconutShell }]}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Search transactions"
            >
              <Ionicons name="search" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!searchActive && hasRows ? (
        <View style={styles.swipeHint}>
          <Ionicons name="hand-left-outline" size={13} color={home.sectionSub} />
          <Text style={[styles.swipeHintText, { color: home.sectionSub }]}>
            Swipe right on any transaction to split it
          </Text>
        </View>
      ) : null}

      {loading && !hasRows ? (
        <View style={[styles.empty, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}>
          <ActivityIndicator color={home.ink} />
          <Text style={[styles.emptySub, { color: theme.textTertiary }]}>Loading…</Text>
        </View>
      ) : null}

      {!loading && !useDemoUi && !linked ? (
        <View style={[styles.empty, styles.emptyFun, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}>
          <View style={[styles.emptyIcon, { backgroundColor: home.moneyInSoft }]}>
            <Ionicons name="card" size={28} color={home.moneyInText} />
          </View>
          <Text style={[styles.emptyTitle, { color: home.ink }]}>Connect bank</Text>
          <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
            Link an account to see transactions.
          </Text>
          {onConnectBank ? (
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: home.coconutShell }]}
              onPress={onConnectBank}
              activeOpacity={0.88}
            >
              <Text style={styles.ctaText}>Connect</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!loading && !hasRows && (linked || useDemoUi) && searchQuery.trim() ? (
        <View style={[styles.empty, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}>
          <Text style={[styles.emptySub, { color: theme.textTertiary }]}>No results</Text>
        </View>
      ) : null}

      {!loading && !hasRows && (linked || useDemoUi) && !searchQuery.trim() ? (
        <View style={[styles.empty, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}>
          <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
            {txSource === "receipts" ? "No email receipts matched yet" : "No transactions"}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
    marginTop: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    minHeight: 32,
  },
  title: {
    fontSize: 16,
    fontFamily: font.medium,
    letterSpacing: 0.48,
    textTransform: "uppercase",
    flex: 1,
  },
  searchFab: {
    width: 32,
    height: 32,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  swipeHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingLeft: 0,
  },
  swipeHintText: {
    fontSize: 12,
    fontFamily: font.medium,
    letterSpacing: 0.36,
    flex: 1,
  },
  empty: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyFun: {
    paddingVertical: 28,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: font.bold,
    marginTop: 4,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 280,
  },
  cta: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radii.md,
  },
  ctaText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: font.bold,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 100,
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radii.md,
  },
  seeAllText: {
    fontSize: 15,
    fontFamily: font.semibold,
  },
});
