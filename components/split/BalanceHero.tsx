import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { GroupsSummary } from "../../hooks/useGroups";
import { font, shadow, prototype } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";

const emptySummary: GroupsSummary = {
  groups: [],
  friends: [],
  totalOwedToMe: 0,
  totalIOwe: 0,
  netBalance: 0,
  totalsByCurrency: [],
};

export const BalanceHero = React.memo(function BalanceHero({ summary }: { summary: GroupsSummary | null }) {
  const s = summary ?? emptySummary;
  const rows = s.totalsByCurrency ?? [];
  const multi = rows.length > 1;

  const nonZeroRows = rows.filter((r) => Math.abs(r.net) >= 0.005);
  const allSettled = nonZeroRows.length === 0;

  if (allSettled) {
    return (
      <View style={styles.heroCard}>
        <Text style={styles.heroKicker}>Overall</Text>
        <Text style={[styles.heroAmount, { color: "#8A9098" }]}>
          {formatSplitCurrencyAmount(0, rows.length === 1 ? rows[0].currency : "USD")}
        </Text>
        <Text style={[styles.heroSub, { color: "#8A9098" }]}>All settled up</Text>
      </View>
    );
  }

  if (multi) {
    return (
      <View style={styles.heroCard}>
        <Text style={styles.heroKicker}>Overall</Text>
        <View style={styles.multiLines}>
          {nonZeroRows.map((row) => {
            const isPos = row.net > 0;
            return (
              <View key={row.currency} style={styles.multiRow}>
                <Text
                  style={[
                    styles.multiAmt,
                    isPos ? styles.heroAmtIn : styles.heroAmtOut,
                  ]}
                >
                  {isPos ? "+" : "−"}{formatSplitCurrencyAmount(row.net, row.currency)}
                </Text>
                <Text style={[styles.multiLabel, isPos ? { color: prototype.green } : { color: prototype.red }]}>
                  {isPos ? "owed to you" : "you owe"}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  const net = s.netBalance ?? 0;
  const isPos = net >= 0;
  const singleCur = rows.length === 1 ? rows[0].currency : "USD";

  return (
    <View style={styles.heroCard}>
      <View
        style={[
          styles.heroGlow,
          {
            backgroundColor: isPos
              ? "rgba(62, 187, 116, 0.14)"
              : "rgba(248, 113, 113, 0.10)",
          },
        ]}
        pointerEvents="none"
      />
      <Text style={styles.heroKicker}>
        {isPos ? "You're owed" : "You owe"}
      </Text>
      <Text style={[styles.heroAmount, isPos ? styles.heroAmtIn : styles.heroAmtOut]}>
        {isPos ? "+" : "−"}{formatSplitCurrencyAmount(net, singleCur)}
      </Text>
      <Text style={styles.heroSub}>
        {isPos ? "overall" : "overall"}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    overflow: "hidden",
    position: "relative",
    ...shadow.md,
  },
  heroGlow: {
    position: "absolute",
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  heroKicker: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: "#8A9098",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    fontFamily: font.medium,
    color: "#4B5563",
  },
  heroAmount: {
    fontSize: 44,
    fontFamily: font.black,
    letterSpacing: -2,
    lineHeight: 48,
    marginBottom: 4,
  },
  heroAmtIn: { color: prototype.green },
  heroAmtOut: { color: prototype.red },
  multiLines: {
    gap: 12,
    marginTop: 4,
  },
  multiRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  multiAmt: {
    fontSize: 28,
    fontFamily: font.black,
    letterSpacing: -1,
  },
  multiLabel: {
    fontSize: 13,
    fontFamily: font.medium,
  },
});
