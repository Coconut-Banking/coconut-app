import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApiFetch } from "../../lib/api";
import { useTheme } from "../../lib/theme-context";
import { font, radii, colors } from "../../lib/theme";
import { MerchantLogo } from "../../components/merchant/MerchantLogo";

type EmailReceipt = {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  currency: string;
  merchant_type: string | null;
  transaction_id: string | null;
  match_source: string | null;
  raw_subject: string;
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

export default function EmailReceiptsScreen() {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [receipts, setReceipts] = useState<EmailReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                onPress={() => {/* future: open detail */}}
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
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
});
