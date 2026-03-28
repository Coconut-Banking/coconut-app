import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useTransactionDetail } from "../../../hooks/useGroups";
import { colors, font, radii, prototype } from "../../../lib/theme";
import { formatSplitCurrencyAmount } from "../../../lib/format-split-money";
import { MerchantLogo } from "../../../components/merchant/MerchantLogo";

const MEMBER_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"];

function MemberAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const hue = MEMBER_COLORS[name.charCodeAt(0) % MEMBER_COLORS.length];
  return (
    <View
      style={[
        s.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${hue}28`,
          borderColor: `${hue}44`,
        },
      ]}
    >
      <Text style={[s.avatarText, { color: hue, fontSize: size * 0.35 }]}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, loading, refetch } = useTransactionDetail(id ?? null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(true); } finally { setRefreshing(false); }
  }, [refetch]);

  if (loading && !detail) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backRow} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backRow} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <Text style={s.emptyText}>Transaction not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalAmount = detail.amount ?? 0;
  const currency = detail.currency ?? "USD";

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backRow} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Hero */}
        <View style={s.hero}>
          <MerchantLogo merchantName={detail.description} size={56} backgroundColor="#F7F3F0" borderColor="#E3DBD8" />
          <Text style={s.heroTitle}>{detail.description}</Text>
          <Text style={s.heroAmount}>{formatSplitCurrencyAmount(totalAmount, currency)}</Text>
          {detail.groupName ? (
            <Text style={s.heroGroup}>{detail.groupName}</Text>
          ) : null}
          <Text style={s.heroDate}>{formatDate(detail.date)}</Text>
        </View>

        {/* Category badge */}
        {detail.category ? (
          <View style={s.categoryRow}>
            <View style={s.categoryBadge}>
              <Ionicons name="pricetag-outline" size={13} color="#6B7280" />
              <Text style={s.categoryText}>{detail.category}</Text>
            </View>
          </View>
        ) : null}

        {/* Paid by */}
        {detail.paidBy ? (
          <>
            <Text style={s.section}>Paid by</Text>
            <View style={s.card}>
              <View style={s.paidByRow}>
                <MemberAvatar name={detail.paidBy.displayName} size={36} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={s.paidByName}>
                    {detail.paidBy.isMe ? "You" : detail.paidBy.displayName}
                  </Text>
                  <Text style={s.paidByAmt}>
                    {formatSplitCurrencyAmount(totalAmount, currency)}
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* Shares */}
        {detail.shares.length > 0 ? (
          <>
            <Text style={s.section}>Split between</Text>
            <View style={s.card}>
              {detail.shares.map((share, i) => (
                <View key={share.memberId}>
                  <View style={s.shareRow}>
                    <MemberAvatar name={share.displayName} size={32} />
                    <Text style={[s.shareName, { flex: 1, marginLeft: 12 }]}>
                      {share.isMe ? "You" : share.displayName}
                    </Text>
                    <Text style={s.shareAmt}>
                      {formatSplitCurrencyAmount(share.amount, currency)}
                    </Text>
                  </View>
                  {i < detail.shares.length - 1 ? <View style={s.sep} /> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Notes */}
        {detail.notes ? (
          <>
            <Text style={s.section}>Notes</Text>
            <View style={s.card}>
              <Text style={s.notesText}>{detail.notes}</Text>
            </View>
          </>
        ) : null}

        {/* Receipt */}
        {detail.receiptUrl ? (
          <>
            <Text style={s.section}>Receipt</Text>
            <View style={[s.card, { alignItems: "center", padding: 12 }]}>
              <Image source={{ uri: detail.receiptUrl }} style={s.receiptImage} resizeMode="contain" />
            </View>
          </>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3F2" },
  topBar: { paddingHorizontal: 8, paddingTop: 4 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 8 },
  backText: { fontSize: 15, fontFamily: font.semibold, color: colors.primary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 14, fontFamily: font.regular, color: "#7A8088" },

  hero: { alignItems: "center", paddingTop: 8, paddingBottom: 20 },
  heroTitle: { fontSize: 20, fontFamily: font.black, color: "#1F2328", textAlign: "center", marginTop: 12 },
  heroAmount: { fontSize: 34, fontFamily: font.black, color: "#1F2328", letterSpacing: -1, marginTop: 4 },
  heroGroup: { fontSize: 13, fontFamily: font.medium, color: colors.primary, marginTop: 8 },
  heroDate: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 4 },

  categoryRow: { alignItems: "center", marginBottom: 20 },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F7F3F0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E3DBD8",
  },
  categoryText: { fontSize: 13, fontFamily: font.medium, color: "#4B5563" },

  section: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: "#9AA0A6",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    overflow: "hidden",
    marginBottom: 20,
  },
  paidByRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  paidByName: { fontSize: 15, fontFamily: font.semibold, color: "#1F2328" },
  paidByAmt: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 2 },

  shareRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 },
  shareName: { fontSize: 14, fontFamily: font.semibold, color: "#1F2328" },
  shareAmt: { fontSize: 14, fontFamily: font.bold, color: "#1F2328" },
  sep: { height: 1, backgroundColor: "#EEE8E4", marginLeft: 58 },

  notesText: { fontSize: 14, fontFamily: font.regular, color: "#4B5563", padding: 14, lineHeight: 20 },

  receiptImage: { width: "100%", height: 300, borderRadius: 12 },

  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarText: { fontFamily: font.bold },
});
