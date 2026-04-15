import { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import type { ReceiptItem } from "../lib/receipt-split";
import type { ThemeColors } from "../lib/colors";
import { font, radii } from "../lib/theme";
import { useTheme } from "../lib/theme-context";

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

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    box: {
      backgroundColor: theme.surfaceTertiary,
      borderRadius: radii.md,
      padding: 14,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.cardBorder,
    },
    merchant: {
      fontFamily: font.semibold,
      fontSize: 15,
      color: theme.text,
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
      borderTopColor: theme.borderLight,
    },
    totalRow: {
      marginTop: 8,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.borderLight,
      marginBottom: 0,
    },
    lineName: {
      flex: 1,
      fontFamily: font.regular,
      fontSize: 14,
      color: theme.text,
    },
    lineMuted: {
      flex: 1,
      fontFamily: font.regular,
      fontSize: 13,
      color: theme.textTertiary,
    },
    lineAmt: {
      fontFamily: font.medium,
      fontSize: 14,
      color: theme.text,
    },
    totalLabel: {
      fontFamily: font.semibold,
      fontSize: 15,
      color: theme.text,
    },
    totalAmt: {
      fontFamily: font.bold,
      fontSize: 16,
      color: theme.text,
    },
    loadingWrap: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 16,
    },
    muted: {
      fontFamily: font.regular,
      fontSize: 13,
      color: theme.textTertiary,
    },
    error: {
      fontFamily: font.regular,
      fontSize: 13,
      color: "#B91C1C",
      marginBottom: 8,
    },
  });
}

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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={theme.primary} />
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
