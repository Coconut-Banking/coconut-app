import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApiFetch } from "../../lib/api";
import { useTheme } from "../../lib/theme-context";
import { font, radii, colors, darkUI } from "../../lib/theme";
import { MerchantLogo } from "../../components/merchant/MerchantLogo";
import { MerchantEnrichmentCard } from "../../components/MerchantEnrichmentCard";
import { fetchReceiptDetailForTransaction } from "../../lib/fetch-receipt-detail";
import type { ReceiptDetailPayload } from "../../lib/fetch-receipt-detail";

type EmailReceipt = {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  merchant_type: string | null;
  transaction_id: string | null;
  match_source: string | null;
  raw_subject: string;
};

type ReceiptDetail = {
  items: import("../../lib/receipt-split").ReceiptItem[];
  merchantName: string;
  merchantType: string | null;
  merchantDetails: Record<string, unknown> | null;
  rideshare?: ReceiptDetailPayload["rideshare"];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  extras: Array<{ name: string; amount: number }>;
};

const MERCHANT_TYPE_ICONS: Record<string, { name: React.ComponentProps<typeof Ionicons>["name"]; color: string }> = {
  rideshare:     { name: "car-outline",           color: "#3B82F6" },
  food_delivery: { name: "bicycle-outline",       color: "#F97316" },
  ecommerce:     { name: "bag-handle-outline",    color: "#10B981" },
  saas:          { name: "card-outline",          color: "#8B5CF6" },
  retail:        { name: "storefront-outline",    color: "#14B8A6" },
};

function typeLabel(t: string | null) {
  if (!t) return "Receipt";
  return t === "food_delivery" ? "Food delivery"
    : t === "ecommerce" ? "E-commerce"
    : t === "saas" ? "Subscription"
    : t.charAt(0).toUpperCase() + t.slice(1);
}

function ReceiptDetailSheet({
  receipt,
  detail,
  loading,
  onClose,
}: {
  receipt: EmailReceipt;
  detail: ReceiptDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const typeInfo = receipt.merchant_type ? MERCHANT_TYPE_ICONS[receipt.merchant_type] : null;
  const isMatched = !!receipt.transaction_id;

  return (
    <View style={[sheet.container, { paddingBottom: insets.bottom + 16 }]}>
      {/* Handle */}
      <View style={sheet.handle} />

      {/* Header */}
      <View style={sheet.headerRow}>
        <MerchantLogo merchantName={receipt.merchant} size={48} style={sheet.logo} />
        <View style={{ flex: 1 }}>
          <Text style={sheet.merchantName} numberOfLines={1}>{receipt.merchant}</Text>
          <View style={sheet.headerMeta}>
            {typeInfo ? <Ionicons name={typeInfo.name} size={12} color={typeInfo.color} /> : null}
            <Text style={sheet.typeText}>{typeLabel(receipt.merchant_type)}</Text>
            <Text style={sheet.dot}>·</Text>
            <Text style={sheet.dateText}>{receipt.date}</Text>
          </View>
          {isMatched ? (
            <View style={sheet.matchedBadge}>
              <Ionicons name="checkmark-circle" size={11} color="#10B981" />
              <Text style={sheet.matchedText}>Matched to transaction</Text>
            </View>
          ) : null}
        </View>
        <View style={sheet.amountCol}>
          <Text style={sheet.amount}>${Number(receipt.amount).toFixed(2)}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={sheet.closeBtn}>
            <Ionicons name="close-circle" size={24} color={darkUI.labelMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={sheet.divider} />

      {/* Body */}
      <ScrollView style={sheet.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={sheet.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={sheet.loadingText}>Loading receipt…</Text>
          </View>
        ) : detail ? (
          <>
            {/* Enrichment card (rideshare route, food delivery restaurant, etc.) */}
            {detail.merchantDetails && detail.merchantType ? (
              <MerchantEnrichmentCard
                merchantType={detail.merchantType}
                merchantDetails={detail.merchantDetails}
              />
            ) : null}

            {/* Line items (ecommerce, food, retail) */}
            {detail.items.length > 0 ? (
              <View style={sheet.itemsCard}>
                {detail.items.map((row) => (
                  <View key={row.id} style={sheet.lineRow}>
                    <Text style={sheet.lineName} numberOfLines={2}>
                      {row.quantity > 1 ? `${row.quantity} × ` : ""}{row.name}
                    </Text>
                    <Text style={sheet.lineAmt}>${row.totalPrice.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Fare breakdown for rideshare */}
            {detail.rideshare?.fare_breakdown ? (
              <View style={sheet.itemsCard}>
                <Text style={sheet.sectionLabel}>Fare breakdown</Text>
                {Object.entries(detail.rideshare.fare_breakdown).map(([key, val]) => (
                  <View key={key} style={sheet.lineRow}>
                    <Text style={sheet.lineName}>
                      {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Text>
                    <Text style={sheet.lineAmt}>${Number(val).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Extras (delivery fee, service fee, etc.) */}
            {detail.extras.length > 0 ? (
              <View style={sheet.itemsCard}>
                {detail.extras.map((e, i) => (
                  <View key={i} style={sheet.lineRow}>
                    <Text style={[sheet.lineName, { color: darkUI.labelMuted }]}>{e.name}</Text>
                    <Text style={sheet.lineAmt}>${e.amount.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Totals */}
            <View style={sheet.totalsCard}>
              {detail.subtotal > 0 ? (
                <View style={sheet.lineRow}>
                  <Text style={[sheet.lineName, { color: darkUI.labelMuted }]}>Subtotal</Text>
                  <Text style={sheet.lineAmt}>${detail.subtotal.toFixed(2)}</Text>
                </View>
              ) : null}
              {detail.tax > 0 ? (
                <View style={sheet.lineRow}>
                  <Text style={[sheet.lineName, { color: darkUI.labelMuted }]}>Tax</Text>
                  <Text style={sheet.lineAmt}>${detail.tax.toFixed(2)}</Text>
                </View>
              ) : null}
              {detail.tip > 0 ? (
                <View style={sheet.lineRow}>
                  <Text style={[sheet.lineName, { color: darkUI.labelMuted }]}>Tip</Text>
                  <Text style={sheet.lineAmt}>${detail.tip.toFixed(2)}</Text>
                </View>
              ) : null}
              <View style={[sheet.lineRow, sheet.totalRow]}>
                <Text style={sheet.totalLabel}>Total</Text>
                <Text style={sheet.totalAmt}>${detail.total.toFixed(2)}</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={sheet.loadingWrap}>
            <Ionicons name="receipt-outline" size={32} color={darkUI.labelMuted} />
            <Text style={sheet.loadingText}>No detail available for this receipt.</Text>
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

export default function EmailReceiptsScreen() {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [receipts, setReceipts] = useState<EmailReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<EmailReceipt | null>(null);
  const [receiptDetail, setReceiptDetail] = useState<ReceiptDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchReceipts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/email-receipts");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Failed to load receipts");
        return;
      }
      const data = await res.json();
      setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
    } catch {
      setError("Failed to load receipts. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReceipts(true);
  }, [fetchReceipts]);

  const openReceipt = useCallback(async (r: EmailReceipt) => {
    setSelectedReceipt(r);
    setReceiptDetail(null);
    setLoadingDetail(true);
    try {
      console.log("[receipt-detail] fetching id:", r.id, "type:", r.merchant_type);
      // Try the email receipt detail endpoint directly first with raw logging
      const raw = await apiFetch(`/api/email-receipts/${encodeURIComponent(r.id)}`);
      console.log("[receipt-detail] status:", raw.status);
      if (raw.ok) {
        const body = await raw.json();
        console.log("[receipt-detail] body keys:", Object.keys(body));
        console.log("[receipt-detail] merchant_details:", JSON.stringify(body.merchant_details));
        console.log("[receipt-detail] merchant_type:", body.merchant_type);
      }
      const detail = await fetchReceiptDetailForTransaction(apiFetch, r.id);
      console.log("[receipt-detail] parsed detail:", detail ? { merchantType: detail.merchantType, hasMerchantDetails: !!detail.merchantDetails, merchantDetails: detail.merchantDetails } : null);
      setReceiptDetail(detail);
    } finally {
      setLoadingDetail(false);
    }
  }, [apiFetch]);

  const closeReceipt = useCallback(() => {
    setSelectedReceipt(null);
    setReceiptDetail(null);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Email Receipts</Text>
          {receipts.length > 0 ? (
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>{receipts.length} receipts</Text>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Something went wrong</Text>
          <Text style={[styles.emptySub, { color: theme.textTertiary }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.primary }]} onPress={() => fetchReceipts()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : receipts.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="mail-outline" size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No receipts yet</Text>
          <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
            Connect Gmail in Settings and run a scan to match receipts to your transactions.
          </Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {receipts.map((r, i) => {
            const typeInfo = r.merchant_type ? MERCHANT_TYPE_ICONS[r.merchant_type] : null;
            const isMatched = !!r.transaction_id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[
                  styles.row,
                  { backgroundColor: theme.surface, borderColor: theme.cardBorder },
                  i < receipts.length - 1 && styles.rowGap,
                ]}
                activeOpacity={0.75}
                onPress={() => openReceipt(r)}
              >
                <MerchantLogo
                  merchantName={r.merchant}
                  size={44}
                  fallbackText={r.merchant}
                  style={styles.logo}
                />
                <View style={styles.rowInfo}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.merchant, { color: theme.text }]} numberOfLines={1}>{r.merchant}</Text>
                    <Text style={[styles.amount, { color: theme.text }]}>
                      ${Number(r.amount).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.rowBottom}>
                    <View style={styles.typePill}>
                      {typeInfo ? (
                        <Ionicons name={typeInfo.name} size={11} color={typeInfo.color} />
                      ) : null}
                      <Text style={[styles.typeText, { color: theme.textTertiary }]}>{typeLabel(r.merchant_type)}</Text>
                    </View>
                    <Text style={[styles.date, { color: theme.textTertiary }]}>{r.date}</Text>
                  </View>
                  {isMatched ? (
                    <View style={styles.matchedBadge}>
                      <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                      <Text style={styles.matchedText}>Matched to transaction</Text>
                    </View>
                  ) : (
                    <Text style={[styles.unmatchedText, { color: theme.textQuaternary }]} numberOfLines={1}>
                      {r.raw_subject}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Receipt detail bottom sheet */}
      <Modal
        visible={!!selectedReceipt}
        transparent
        animationType="slide"
        onRequestClose={closeReceipt}
      >
        <View style={styles.modalWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeReceipt} />
          {selectedReceipt ? (
            <ReceiptDetailSheet
              receipt={selectedReceipt}
              detail={receiptDetail}
              loading={loadingDetail}
              onClose={closeReceipt}
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: font.bold, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontFamily: font.regular, marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: font.semibold, textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: font.regular, textAlign: "center", lineHeight: 20 },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radii.md },
  retryBtnText: { color: "#fff", fontFamily: font.semibold, fontSize: 15 },
  scroll: { flex: 1 },
  list: { padding: 16 },
  rowGap: { marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  logo: { width: 44, height: 44, borderRadius: 10 },
  rowInfo: { flex: 1, gap: 4 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  merchant: { flex: 1, fontFamily: font.semibold, fontSize: 15, marginRight: 8 },
  amount: { fontFamily: font.bold, fontSize: 15 },
  rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typePill: { flexDirection: "row", alignItems: "center", gap: 4 },
  typeText: { fontFamily: font.medium, fontSize: 12 },
  date: { fontFamily: font.regular, fontSize: 12 },
  matchedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  matchedText: { fontFamily: font.medium, fontSize: 12, color: "#10B981" },
  unmatchedText: { fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  modalWrap: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
});

const sheet = StyleSheet.create({
  container: {
    backgroundColor: darkUI.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "75%",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: darkUI.stroke,
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  logo: { width: 48, height: 48, borderRadius: 12 },
  merchantName: {
    fontFamily: font.bold,
    fontSize: 17,
    color: darkUI.label,
    marginBottom: 4,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  typeText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: darkUI.labelSecondary,
  },
  dot: {
    fontFamily: font.regular,
    fontSize: 13,
    color: darkUI.labelMuted,
  },
  dateText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: darkUI.labelMuted,
  },
  matchedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  matchedText: {
    fontFamily: font.medium,
    fontSize: 12,
    color: "#10B981",
  },
  amountCol: {
    alignItems: "flex-end",
    gap: 8,
  },
  amount: {
    fontFamily: font.black,
    fontSize: 20,
    color: darkUI.label,
  },
  closeBtn: {},
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: darkUI.stroke,
    marginBottom: 16,
  },
  body: { flex: 1 },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontFamily: font.regular,
    fontSize: 14,
    color: darkUI.labelMuted,
  },
  sectionLabel: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: darkUI.labelSecondary,
    marginBottom: 10,
  },
  itemsCard: {
    backgroundColor: darkUI.cardElevated,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: darkUI.stroke,
  },
  totalsCard: {
    backgroundColor: darkUI.cardElevated,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: darkUI.stroke,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  totalRow: {
    marginTop: 6,
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
});
