import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import type { ReceiptItem } from "../lib/receipt-split";
import { colors, font, radii, darkUI } from "../lib/theme";

type Props = {
  loading?: boolean;
  error?: string | null;
  merchantName?: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  tip: number;
  extras: Array<{ name: string; amount: number }>;
  total: number;
};

export function ItemizedReceiptPreview({
  loading,
  error,
  merchantName,
  items,
  subtotal,
  tax,
  tip,
  extras,
  total,
}: Props) {
  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Loading line items…</Text>
      </View>
    );
  }
  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }
  if (!loading && items.length === 0 && total <= 0) {
    return (
      <View style={styles.box}>
        <Text style={styles.muted}>No line items returned for this receipt.</Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      {merchantName ? (
        <Text style={styles.merchant} numberOfLines={1}>
          {merchantName}
        </Text>
      ) : null}
      {items.map((row) => (
        <View key={row.id} style={styles.lineRow}>
          <Text style={styles.lineName} numberOfLines={2}>
            {row.quantity > 1 ? `${row.quantity} × ` : ""}
            {row.name}
          </Text>
          <Text style={styles.lineAmt}>${row.totalPrice.toFixed(2)}</Text>
        </View>
      ))}
      {extras.map((e, i) => (
        <View key={`ex-${i}`} style={styles.lineRow}>
          <Text style={styles.lineMuted}>{e.name}</Text>
          <Text style={styles.lineAmt}>${e.amount.toFixed(2)}</Text>
        </View>
      ))}
      {subtotal > 0 || items.length > 0 ? (
        <View style={[styles.lineRow, styles.subRow]}>
          <Text style={styles.lineMuted}>Subtotal</Text>
          <Text style={styles.lineAmt}>${subtotal.toFixed(2)}</Text>
        </View>
      ) : null}
      {tax > 0 ? (
        <View style={styles.lineRow}>
          <Text style={styles.lineMuted}>Tax</Text>
          <Text style={styles.lineAmt}>${tax.toFixed(2)}</Text>
        </View>
      ) : null}
      {tip > 0 ? (
        <View style={styles.lineRow}>
          <Text style={styles.lineMuted}>Tip</Text>
          <Text style={styles.lineAmt}>${tip.toFixed(2)}</Text>
        </View>
      ) : null}
      <View style={[styles.lineRow, styles.totalRow]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmt}>${total.toFixed(2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: darkUI.cardElevated,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: darkUI.stroke,
  },
  merchant: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: darkUI.label,
    marginBottom: 10,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  subRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: darkUI.sep,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: darkUI.sep,
    marginBottom: 0,
  },
  lineName: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 14,
    color: darkUI.label,
  },
  lineMuted: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 13,
    color: darkUI.labelMuted,
  },
  lineAmt: {
    fontFamily: font.medium,
    fontSize: 14,
    color: darkUI.label,
  },
  totalLabel: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: darkUI.label,
  },
  totalAmt: {
    fontFamily: font.bold,
    fontSize: 16,
    color: darkUI.label,
  },
  loadingWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  muted: {
    fontFamily: font.regular,
    fontSize: 13,
    color: darkUI.labelMuted,
  },
  error: {
    fontFamily: font.regular,
    fontSize: 13,
    color: "#B91C1C",
    marginBottom: 8,
  },
});
