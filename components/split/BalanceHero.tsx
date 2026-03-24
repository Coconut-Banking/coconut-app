import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GroupsSummary } from "../../hooks/useGroups";
import { font, shadow, prototype } from "../../lib/theme";

const emptySummary: GroupsSummary = {
  groups: [],
  friends: [],
  totalOwedToMe: 0,
  totalIOwe: 0,
  netBalance: 0,
};

/**
 * Matches `MobileAppPage.tsx` `HomeScreen` balance card — wired to real `GroupsSummary`.
 */
export function BalanceHero({ summary }: { summary: GroupsSummary | null }) {
  const s = summary ?? emptySummary;
  const net = s.netBalance ?? 0;
  const totalOwed = s.totalOwedToMe ?? 0;
  const totalOwing = s.totalIOwe ?? 0;
  const isPos = net >= 0;
  const hasNet = net !== 0;

  return (
    <View style={styles.heroCard}>
      <View
        style={[
          styles.heroGlow,
          {
            backgroundColor: hasNet
              ? isPos
                ? "rgba(62, 187, 116, 0.14)"
                : "rgba(248, 113, 113, 0.10)"
              : "transparent",
          },
        ]}
        pointerEvents="none"
      />
      <Text style={styles.heroKicker}>
        {hasNet ? (isPos ? "You're owed" : "You owe") : "All settled up"}
      </Text>
      <Text style={[styles.heroAmount, hasNet ? (isPos ? styles.heroAmtIn : styles.heroAmtOut) : { color: "#8A9098" }]}>
        ${Math.abs(net).toFixed(2)}
      </Text>
      <Text style={styles.heroSub}>{hasNet ? (isPos ? "overall. Keep it up." : "overall. Settle up.") : "overall. Keep it up."}</Text>
      <View style={styles.heroStatsRow}>
        <View style={styles.heroStatBox}>
          <View style={styles.heroStatLblRow}>
            <Ionicons name="arrow-down-left-box" size={12} color={prototype.green} />
            <Text style={styles.heroStatLbl}>Owed to you</Text>
          </View>
          <Text style={[styles.heroStatVal, { color: prototype.green }]}>${totalOwed.toFixed(2)}</Text>
        </View>
        <View style={styles.heroStatBox}>
          <View style={styles.heroStatLblRow}>
            <Ionicons name="arrow-up-right-box" size={12} color={prototype.red} />
            <Text style={styles.heroStatLbl}>You owe</Text>
          </View>
          <Text style={[styles.heroStatVal, { color: prototype.red }]}>${totalOwing.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
}

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
    marginBottom: 20,
  },
  heroAmount: {
    fontSize: 44,
    fontFamily: font.black,
    letterSpacing: -2,
    lineHeight: 48,
    marginBottom: 20,
  },
  heroAmtIn: { color: prototype.green },
  heroAmtOut: { color: prototype.red },
  heroStatsRow: { flexDirection: "row", gap: 10 },
  heroStatBox: {
    flex: 1,
    backgroundColor: "#F7F3F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E9E2DD",
  },
  heroStatLblRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  heroStatLbl: { fontSize: 10, fontFamily: font.medium, color: "#8A9098" },
  heroStatVal: { fontSize: 17, fontFamily: font.black, letterSpacing: -0.5 },
});
