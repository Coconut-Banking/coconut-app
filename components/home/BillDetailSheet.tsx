import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApiFetch } from "../../lib/api";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";
import { font, radii } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { ItemizedReceiptPreview } from "../ItemizedReceiptPreview";
type BillDetail = {
  id: string;
  groupName: string;
  label: string;
  amount: number;
  currency: string;
  status: string;
  payerName: string;
  receiverName: string;
  payUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  isPayer: boolean;
  isReceiver: boolean;
  receiptId: string | null;
  receipt: {
    id: string;
    merchantName: string | null;
    subtotal: number;
    tax: number;
    tip: number;
    total: number;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;
  } | null;
};

function statusLabel(status: string, paidAt: string | null): string {
  if (paidAt || status === "paid" || status === "settled_off_link") return "Paid";
  if (status === "pending") return "Pending";
  if (status === "cancelled") return "Cancelled";
  return status;
}

type Props = {
  billId: string | null;
  onClose: () => void;
  onNudge?: (billId: string) => Promise<void>;
  onPaid?: () => void;
};

export function BillDetailSheet({ billId, onClose, onNudge, onPaid }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const home = useHomePalette();
  const apiFetch = useApiFetch();
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);

  const load = useCallback(async () => {
    if (!billId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/bills/${billId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load bill");
        setDetail(null);
        return;
      }
      setDetail(data as BillDetail);
    } catch {
      setError("Could not load bill");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, billId]);

  useEffect(() => {
    if (billId) void load();
    else {
      setDetail(null);
      setError(null);
    }
  }, [billId, load]);

  const paid =
    Boolean(detail?.paidAt) ||
    detail?.status === "paid" ||
    detail?.status === "settled_off_link";
  const pending = detail?.status === "pending";
  const receiptTotal = detail?.receipt?.total ?? 0;

  const openReceipt = useCallback(() => {
    if (!detail?.receiptId) return;
    onClose();
    router.push({
      pathname: "/(tabs)/receipt",
      params: { resumeReceiptId: detail.receiptId },
    });
  }, [detail?.receiptId, onClose]);

  if (!billId) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.card,
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: theme.borderLight }]} />

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 32 }} color={theme.primary} />
          ) : error ? (
            <Text style={[styles.error, { color: theme.negative }]}>{error}</Text>
          ) : detail ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.head}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                  {detail.label}
                </Text>
                <Text style={[styles.group, { color: theme.textTertiary }]}>{detail.groupName}</Text>
              </View>

              <View style={[styles.amountBlock, { backgroundColor: home.moneyInSoft }]}>
                <Text style={[styles.amountLabel, { color: home.moneyInText }]}>
                  {detail.isPayer ? "Your share" : "Amount"}
                </Text>
                <Text style={[styles.amount, { color: home.ink }]}>
                  {formatSplitCurrencyAmount(detail.amount, detail.currency)}
                </Text>
                {receiptTotal > 0.01 ? (
                  <Text style={[styles.totalLine, { color: theme.textSecondary }]}>
                    Bill total {formatSplitCurrencyAmount(receiptTotal, detail.currency)}
                  </Text>
                ) : null}
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: paid ? home.moneyInSoft : `${home.moneyOutSoft}`,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: font.bold,
                      color: paid ? home.moneyInText : home.moneyOutText,
                    }}
                  >
                    {statusLabel(detail.status, detail.paidAt)}
                  </Text>
                </View>
              </View>

              <View style={styles.meta}>
                <Text style={[styles.metaLine, { color: theme.textSecondary }]}>
                  {detail.payerName} → {detail.receiverName}
                </Text>
                {detail.paidAt ? (
                  <Text style={[styles.metaLine, { color: theme.textTertiary }]}>
                    Paid{" "}
                    {new Date(detail.paidAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                ) : null}
              </View>

              {detail.receipt && detail.receipt.items.length > 0 ? (
                <View style={styles.receiptSection}>
                  <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>
                    ITEMIZED RECEIPT
                  </Text>
                  <ItemizedReceiptPreview
                    merchantName={detail.receipt.merchantName ?? detail.label}
                    items={detail.receipt.items.map((i) => ({
                      id: i.id,
                      name: i.name,
                      quantity: i.quantity,
                      unitPrice: i.unit_price,
                      totalPrice: i.total_price,
                    }))}
                    subtotal={detail.receipt.subtotal}
                    tax={detail.receipt.tax}
                    tip={detail.receipt.tip}
                    extras={[]}
                    total={detail.receipt.total}
                  />
                  {detail.isReceiver && detail.receiptId ? (
                    <Pressable onPress={openReceipt} style={styles.linkRow}>
                      <Text style={[styles.linkText, { color: home.balanceLabel }]}>
                        Open receipt split
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={home.balanceLabel} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actions}>
                {pending && detail.isPayer && detail.payUrl ? (
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: home.coconutShell }]}
                    onPress={() => void Linking.openURL(detail.payUrl!)}
                  >
                    <Text style={styles.primaryBtnText}>Pay share</Text>
                  </Pressable>
                ) : null}
                {pending && detail.isReceiver && onNudge ? (
                  <Pressable
                    style={[styles.outlineBtn, { borderColor: theme.cardBorder }]}
                    disabled={nudging}
                    onPress={async () => {
                      setNudging(true);
                      try {
                        await onNudge(detail.id);
                        await load();
                        onPaid?.();
                      } finally {
                        setNudging(false);
                      }
                    }}
                  >
                    {nudging ? (
                      <ActivityIndicator color={theme.text} />
                    ) : (
                      <Text style={[styles.outlineBtnText, { color: theme.text }]}>Send reminder</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
          ) : null}

          <Pressable onPress={onClose} style={styles.closeRow} hitSlop={12}>
            <Text style={[styles.closeText, { color: theme.textSecondary }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "88%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  head: { marginBottom: 16 },
  title: { fontSize: 22, fontFamily: font.bold },
  group: { fontSize: 14, fontFamily: font.regular, marginTop: 4 },
  amountBlock: {
    borderRadius: radii.xl,
    padding: 16,
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  amount: { fontSize: 32, fontFamily: font.black, marginTop: 4 },
  totalLine: { fontSize: 13, fontFamily: font.regular, marginTop: 4 },
  statusPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  meta: { marginBottom: 16, gap: 4 },
  metaLine: { fontSize: 14, fontFamily: font.regular },
  receiptSection: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 8,
    paddingVertical: 8,
  },
  linkText: { fontSize: 14, fontFamily: font.semibold },
  actions: { gap: 10, marginTop: 8, marginBottom: 8 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: radii.lg,
    alignItems: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontFamily: font.bold },
  outlineBtn: {
    paddingVertical: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: "center",
  },
  outlineBtnText: { fontSize: 16, fontFamily: font.semibold },
  closeRow: { alignItems: "center", paddingVertical: 12 },
  closeText: { fontSize: 15, fontFamily: font.semibold },
  error: { textAlign: "center", marginVertical: 24, fontSize: 14, fontFamily: font.medium },
});
