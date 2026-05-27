import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";

/** Connect / loading / no-results — rendered as FlatList ListEmptyComponent (not in header). */
export const HomeBankTransactionsEmpty = React.memo(function HomeBankTransactionsEmpty({
  loading,
  linked,
  useDemoUi,
  searchQuery,
  txSource,
  onConnectBank,
}: {
  loading: boolean;
  linked: boolean;
  useDemoUi: boolean;
  searchQuery: string;
  txSource: "all" | "receipts";
  onConnectBank?: () => void;
}) {
  const { theme } = useTheme();
  const home = useHomePalette();

  if (useDemoUi) return null;

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}>
        <ActivityIndicator color={home.ink} />
        <Text style={[styles.sub, { color: theme.textTertiary }]}>Loading transactions…</Text>
      </View>
    );
  }

  if (!linked) {
    return (
      <View style={[styles.card, styles.cardTall, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}>
        <View style={[styles.icon, { backgroundColor: home.moneyInSoft }]}>
          <Ionicons name="card" size={28} color={home.moneyInText} />
        </View>
        <Text style={[styles.title, { color: home.ink }]}>Connect bank</Text>
        <Text style={[styles.sub, { color: theme.textTertiary }]}>
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
    );
  }

  if (searchQuery.trim()) {
    return (
      <View style={[styles.card, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}>
        <Text style={[styles.sub, { color: theme.textTertiary }]}>No results</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}>
      <Text style={[styles.sub, { color: theme.textTertiary }]}>
        {txSource === "receipts" ? "No email receipts matched yet" : "No transactions"}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: "center",
    gap: 8,
    minHeight: 120,
    justifyContent: "center",
  },
  cardTall: {
    minHeight: 200,
    paddingVertical: 28,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: font.bold,
    marginTop: 4,
  },
  sub: {
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
});
