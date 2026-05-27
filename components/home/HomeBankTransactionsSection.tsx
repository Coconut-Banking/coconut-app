import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { font, radii } from "../../lib/theme";
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

/** Section chrome only — empty/loading/connect UI lives in HomeBankTransactionsEmpty (ListEmptyComponent). */
export const HomeBankTransactionsSection = React.memo(function HomeBankTransactionsSection({
  hasTransactions,
  searchActive,
  onSearchActivate,
}: {
  hasTransactions: boolean;
  searchActive?: boolean;
  onSearchActivate?: () => void;
}) {
  const home = useHomePalette();

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

      {!searchActive && hasTransactions ? (
        <View style={styles.swipeHint}>
          <Ionicons name="hand-left-outline" size={13} color={home.sectionSub} />
          <Text style={[styles.swipeHintText, { color: home.sectionSub }]}>
            Swipe right on any transaction to split it
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
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 16,
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
