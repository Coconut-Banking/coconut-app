import React, { useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";
import { font } from "../../lib/theme";
import type { BillRow } from "../../hooks/useBills";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";

function billStatusLabel(bill: BillRow): string {
  if (bill.status === "collecting") return "Open";
  if (bill.paidAt || bill.status === "paid" || bill.status === "settled_off_link") {
    return "Paid";
  }
  if (bill.isPayer) return "To pay";
  return "Waiting";
}

export const HomeActivityBillRow = React.memo(function HomeActivityBillRow({
  bill,
  showSep,
  onOpenDetail,
}: {
  bill: BillRow;
  showSep: boolean;
  onOpenDetail?: (bill: BillRow) => void;
}) {
  const { theme } = useTheme();
  const home = useHomePalette();
  const collecting = bill.status === "collecting";
  const paid = Boolean(bill.paidAt || bill.status === "paid" || bill.status === "settled_off_link");
  const status = billStatusLabel(bill);
  const guestTotal = bill.collectGuestCount ?? 0;
  const guestDone = bill.collectGuestsSubmitted ?? 0;

  const onPress = useCallback(() => {
    if (collecting && bill.receiptId) {
      router.push({
        pathname: "/(tabs)/receipt",
        params: { resumeReceiptId: bill.receiptId },
      });
      return;
    }
    if (collecting) {
      router.push("/(tabs)/receipt");
      return;
    }
    onOpenDetail?.(bill);
  }, [bill, collecting, onOpenDetail]);

  return (
    <View>
      <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={onPress}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor: paid ? home.moneyInSoft : "#F5F3F2",
            },
          ]}
        >
          <Ionicons
            name={paid ? "checkmark" : "receipt-outline"}
            size={16}
            color={paid ? home.moneyInText : theme.textSecondary}
          />
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {bill.label}
          </Text>
          <Text style={[styles.sub, { color: theme.textTertiary }]} numberOfLines={1}>
            {collecting
              ? guestTotal > 0
                ? `${guestDone} of ${guestTotal} picked items · tap to continue`
                : "Waiting for guests · tap to continue"
              : paid
                ? `${bill.groupName} · tap for receipt`
                : `${bill.groupName}${bill.isPayer ? ` · to ${bill.receiverName}` : ` · from ${bill.payerName}`}`}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amt, { color: theme.text }]}>
            {formatSplitCurrencyAmount(bill.amount, bill.currency)}
          </Text>
          <Text
            style={[
              styles.badge,
              {
                color: paid ? home.moneyInText : bill.isPayer ? home.moneyOutText : theme.textTertiary,
              },
            ]}
          >
            {status}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textQuaternary} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {showSep ? <View style={[styles.sep, { backgroundColor: theme.borderLight }]} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, marginLeft: 12, minWidth: 0 },
  title: { fontSize: 15, fontFamily: font.semibold },
  sub: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  right: { alignItems: "flex-end", marginLeft: 8 },
  amt: { fontSize: 15, fontFamily: font.bold },
  badge: { fontSize: 11, fontFamily: font.semibold, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
});
