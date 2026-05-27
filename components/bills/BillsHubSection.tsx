import React, { useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useEffect } from "react";
import { useTheme } from "../../lib/theme-context";
import { font, radii, space } from "../../lib/theme";
import { useBills, type BillRow } from "../../hooks/useBills";
import { useApiFetch } from "../../lib/api";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { useToast } from "../Toast";

function BillRowView({
  bill,
  onPay,
  onNudge,
  onAddToTab,
}: {
  bill: BillRow;
  onPay: (b: BillRow) => void;
  onNudge: (b: BillRow) => void;
  onAddToTab: (b: BillRow) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[s.row, { borderBottomColor: theme.borderLight }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {bill.label}
        </Text>
        <Text style={[s.rowSub, { color: theme.textTertiary }]} numberOfLines={1}>
          {bill.groupName}
          {bill.isPayer ? ` · to ${bill.receiverName}` : ` · from ${bill.payerName}`}
        </Text>
      </View>
      <Text style={[s.amount, { color: theme.text }]}>
        {formatSplitCurrencyAmount(bill.amount, bill.currency)}
      </Text>
      {bill.isPayer && bill.payUrl ? (
        <TouchableOpacity style={[s.chip, { backgroundColor: theme.primary }]} onPress={() => onPay(bill)}>
          <Text style={s.chipText}>Pay</Text>
        </TouchableOpacity>
      ) : null}
      {bill.isPayer ? (
        <TouchableOpacity style={[s.chipOutline, { borderColor: theme.border }]} onPress={() => onAddToTab(bill)}>
          <Text style={[s.chipOutlineText, { color: theme.text }]}>My tab</Text>
        </TouchableOpacity>
      ) : null}
      {bill.isReceiver ? (
        <TouchableOpacity style={[s.chipOutline, { borderColor: theme.border }]} onPress={() => onNudge(bill)}>
          <Text style={[s.chipOutlineText, { color: theme.text }]}>Nudge</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function BillsHubSection() {
  const { theme } = useTheme();
  const toast = useToast();
  const apiFetch = useApiFetch();
  const isFocused = useIsFocused();
  const toPay = useBills("to_pay");
  const waiting = useBills("waiting_on");

  useEffect(() => {
    if (isFocused) {
      void toPay.refetch();
      void waiting.refetch();
    }
  }, [isFocused]);

  const onPay = useCallback((bill: BillRow) => {
    if (bill.payUrl) void Linking.openURL(bill.payUrl);
  }, []);

  const onNudge = useCallback(
    async (bill: BillRow) => {
      const res = await apiFetch(`/api/bills/${bill.id}/nudge`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? "Could not nudge");
        return;
      }
      toast.show("Reminder sent");
      void waiting.refetch();
    },
    [apiFetch, toast, waiting],
  );

  const onAddToTab = useCallback(
    async (bill: BillRow) => {
      const res = await apiFetch(`/api/bills/${bill.id}/add-to-tab`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        toast.show(data.error ?? "Could not update");
        return;
      }
      toast.show("Added to your tab");
      void toPay.refetch();
      void waiting.refetch();
    },
    [apiFetch, toast, toPay, waiting],
  );

  const totalPending = toPay.counts.to_pay + waiting.counts.waiting_on;
  if (totalPending === 0 && !toPay.loading && !waiting.loading) return null;

  return (
    <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
      <View style={s.cardHeader}>
        <Ionicons name="receipt-outline" size={18} color={theme.text} />
        <Text style={[s.cardTitle, { color: theme.text }]}>Bills</Text>
      </View>
      {(toPay.loading || waiting.loading) && totalPending === 0 ? (
        <ActivityIndicator style={{ marginVertical: space.md }} color={theme.primary} />
      ) : null}
      {toPay.bills.length > 0 ? (
        <>
          <Text style={[s.sectionLabel, { color: theme.textTertiary }]}>To pay</Text>
          {toPay.bills.slice(0, 5).map((b) => (
            <BillRowView key={b.id} bill={b} onPay={onPay} onNudge={onNudge} onAddToTab={onAddToTab} />
          ))}
        </>
      ) : null}
      {waiting.bills.length > 0 ? (
        <>
          <Text style={[s.sectionLabel, { color: theme.textTertiary }]}>Waiting on</Text>
          {waiting.bills.slice(0, 5).map((b) => (
            <BillRowView key={b.id} bill={b} onPay={onPay} onNudge={onNudge} onAddToTab={onAddToTab} />
          ))}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: space.md,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: space.sm },
  cardTitle: { fontFamily: font.bold, fontSize: 17 },
  sectionLabel: { fontFamily: font.semibold, fontSize: 12, textTransform: "uppercase", marginTop: space.sm, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontFamily: font.semibold, fontSize: 15 },
  rowSub: { fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  amount: { fontFamily: font.bold, fontSize: 15 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.md },
  chipText: { color: "#fff", fontFamily: font.semibold, fontSize: 12 },
  chipOutline: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: radii.md, borderWidth: 1 },
  chipOutlineText: { fontFamily: font.semibold, fontSize: 12 },
});
