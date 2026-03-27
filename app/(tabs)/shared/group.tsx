import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  RefreshControl,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApiFetch } from "../../../lib/api";
import { useGroupDetail, useGroupsSummary } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { useDemoData } from "../../../lib/demo-context";
import { useTheme } from "../../../lib/theme-context";
import { colors, font, fontSize, shadow, radii, space } from "../../../lib/theme";
import { formatSplitCurrencyAmount } from "../../../lib/format-split-money";
import { MerchantLogo } from "../../../components/merchant/MerchantLogo";

const MEMBER_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"];

function MemberAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const idx = name.charCodeAt(0) % MEMBER_COLORS.length;
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: MEMBER_COLORS[idx] }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.35 }]}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function GroupScreen() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { detail: realDetail, loading, refetch } = useGroupDetail(isDemoOn ? null : (id ?? null));
  const { refetch: refetchSummary } = useGroupsSummary();
  const detail = isDemoOn && id ? demo.groupDetails[id] ?? null : realDetail;

  const [requestingPayment, setRequestingPayment] = useState(false);
  const [recordingSettlement, setRecordingSettlement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(true); } finally { setRefreshing(false); }
  }, [refetch]);

  const patchArchive = async (archived: boolean) => {
    if (!id || isDemoOn) return;
    const res = await apiFetch(`/api/groups/${id}`, {
      method: "PATCH",
      body: { archived } as object,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      Alert.alert("Couldn’t update group", (err as { error?: string }).error ?? "Try again.");
      return;
    }
    DeviceEventEmitter.emit("groups-updated");
    await refetch(true);
    await refetchSummary();
    if (archived) router.back();
  };

  if (!detail) {
    return (
      <View style={[s.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const hasActivity = (detail.activity?.length ?? 0) > 0;
  const allSettled = (detail.balances?.filter((b) => Math.abs(b.total) >= 0.005).length ?? 0) === 0;
  const isArchived = Boolean(detail.archivedAt);
  const memberNameById = new Map(detail.members.map((m) => [m.id, m.display_name]));

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        <View style={s.groupHeader}>
          <View style={[s.groupIcon, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="people" size={28} color={theme.primary} />
          </View>
          <View>
            <Text style={[s.groupName, { color: theme.text }]}>{detail.name}</Text>
            <Text style={[s.groupMeta, { color: theme.textTertiary }]}>
              {detail.members.length} members ·{" "}
              {detail.totalSpend != null
                ? `$${detail.totalSpend.toFixed(2)}`
                : (detail.totalSpendByCurrency ?? [])
                    .map((r) => `${r.currency} ${r.amount.toFixed(2)}`)
                    .join(" · ") || "—"}{" "}
              total
            </Text>
          </View>
        </View>

        {isArchived ? (
          <View
            style={[
              s.archivedBanner,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight },
            ]}
          >
            <Text style={[s.archivedBannerText, { color: theme.textSecondary }]}>
              Archived — hidden from your main group list.
            </Text>
            {detail.isOwner ? (
              <TouchableOpacity onPress={() => patchArchive(false)} hitSlop={8}>
                <Text style={[s.archivedRestore, { color: theme.primary }]}>Restore</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <Text style={[s.section, { color: theme.textTertiary }]}>Balances</Text>
        <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          {allSettled ? (
            <Text style={[s.balanceRowText, { color: theme.textQuaternary, padding: 14 }]}>
              Everyone is settled up in this group.
            </Text>
          ) : (
            (detail.balances ?? [])
              .filter((b) => Math.abs(b.total) >= 0.005)
              .map((b, i, arr) => (
                <View
                  key={`${b.memberId}-${b.currency}`}
                  style={[
                    s.balanceRow,
                    i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
                  ]}
                >
                  <Text style={[s.balanceRowName, { color: theme.text }]}>
                    {memberNameById.get(b.memberId) ?? "Member"}{" "}
                    <Text style={{ color: theme.textQuaternary, fontSize: 12 }}>({b.currency})</Text>
                  </Text>
                  <Text
                    style={[
                      s.balanceRowAmt,
                      { color: b.total > 0 ? theme.positive : b.total < 0 ? "#C94C4C" : theme.textQuaternary },
                    ]}
                  >
                    {b.total > 0
                      ? `Gets back ${formatSplitCurrencyAmount(b.total, b.currency)}`
                      : b.total < 0
                        ? `Owes ${formatSplitCurrencyAmount(b.total, b.currency)}`
                        : "Settled"}
                  </Text>
                </View>
              ))
          )}
        </View>

        <Text style={[s.section, { color: theme.textTertiary }]}>Transactions</Text>
        {!hasActivity ? (
          <View style={[s.empty, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <View style={[s.emptyIcon, { backgroundColor: theme.surfaceTertiary }]}>
              <Ionicons name="receipt-outline" size={28} color={theme.textQuaternary} />
            </View>
            <Text style={[s.emptyTitle, { color: theme.textSecondary }]}>No transactions yet</Text>
            <Text style={[s.emptySubtext, { color: theme.textQuaternary }]}>Add an expense or split a receipt to start tracking.</Text>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            {(detail.activity ?? []).map((a, i) => (
              <View key={a.id} style={[s.txRow, i < detail.activity.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}>
                <MerchantLogo
                  merchantName={a.merchant}
                  size={36}
                  backgroundColor={theme.surfaceTertiary}
                  borderColor={theme.borderLight}
                  style={{ marginRight: 12 }}
                />
                <View style={s.txInfo}>
                  <Text style={[s.txMerchant, { color: theme.text }]}>{a.merchant}</Text>
                  <Text style={[s.txMeta, { color: theme.textQuaternary }]}>Split {a.splitCount} ways · {formatTimeAgo(a.createdAt)}</Text>
                </View>
                <Text style={[s.txAmount, { color: theme.text }]}>
                  {formatSplitCurrencyAmount(a.amount, a.currency ?? "USD")}
                </Text>
              </View>
            ))}
          </View>
        )}

        {detail.suggestions && detail.suggestions.length > 0 && (
          <>
            <Text style={[s.section, { marginTop: 24, color: theme.textTertiary }]}>Settle up</Text>
            {detail.suggestions.map((su) => {
              const fromName = detail.members.find((m) => m.id === su.fromMemberId)?.display_name ?? "?";
              const toName = detail.members.find((m) => m.id === su.toMemberId)?.display_name ?? "?";
              const myMemberId = detail.members.find((m) => m.user_id === userId)?.id;
              const theyPayMe = myMemberId && su.toMemberId === myMemberId;
              const iPayThem = myMemberId && su.fromMemberId === myMemberId;
              const canMarkPaid =
                Boolean(theyPayMe || iPayThem || (detail.isOwner && !isDemoOn));
              return (
                <View
                  key={`${su.currency}-${su.fromMemberId}-${su.toMemberId}`}
                  style={[s.suggRow, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
                >
                  <View style={s.suggPeople}>
                    <MemberAvatar name={fromName} />
                    <Ionicons name="arrow-forward" size={14} color={theme.textQuaternary} />
                    <MemberAvatar name={toName} />
                  </View>
                  <View style={s.suggInfo}>
                    <Text style={[s.suggText, { color: theme.textSecondary }]}>
                      <Text style={s.bold}>{fromName}</Text> pays <Text style={s.bold}>{toName}</Text>
                    </Text>
                    <Text style={[s.suggAmount, { color: theme.positive }]}>
                      {formatSplitCurrencyAmount(su.amount, su.currency)}
                    </Text>
                  </View>
                  <View style={s.suggActions}>
                    {theyPayMe && (
                      <TouchableOpacity
                        style={[s.miniBtn, { backgroundColor: theme.primary }]}
                        onPress={async () => {
                          if (isDemoOn) { Alert.alert("Sent", `Payment request for $${su.amount.toFixed(2)} sent!`); return; }
                          setRequestingPayment(true);
                          try {
                            const res = await apiFetch("/api/stripe/create-payment-link", {
                              method: "POST",
                              body: { amount: su.amount, description: detail.name, recipientName: fromName, groupId: id, payerMemberId: su.fromMemberId, receiverMemberId: su.toMemberId },
                            });
                            const data = await res.json();
                            if (res.ok && data.url) {
                              await Share.share({ message: `You owe me $${su.amount.toFixed(2)} for ${detail.name}. Pay here: ${data.url}`, url: data.url, title: "Payment request" });
                            }
                          } finally { setRequestingPayment(false); }
                        }}
                        disabled={requestingPayment}
                        activeOpacity={0.7}
                      >
                        <Text style={s.miniBtnText}>Request</Text>
                      </TouchableOpacity>
                    )}
                    {canMarkPaid && (
                      <TouchableOpacity
                        style={[s.miniBtn, { borderWidth: 1, borderColor: theme.border }]}
                        onPress={() => {
                          if (isDemoOn && id) { demo.settleGroupSuggestion(id, su.fromMemberId, su.toMemberId); return; }
                          const who = `${fromName} → ${toName}`;
                          Alert.alert(
                            "Mark as paid",
                            detail.isOwner && !theyPayMe && !iPayThem
                              ? `Record that ${who} settled $${su.amount.toFixed(2)}? (You’re the group owner.)`
                              : `Mark $${su.amount.toFixed(2)} as paid?`,
                            [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Mark paid",
                              onPress: async () => {
                                setRecordingSettlement(true);
                                try {
                                  const res = await apiFetch("/api/settlements", {
                                    method: "POST",
                                    body: {
                                      groupId: id,
                                      payerMemberId: su.fromMemberId,
                                      receiverMemberId: su.toMemberId,
                                      amount: su.amount,
                                      method: "manual",
                                      currency: su.currency,
                                    },
                                  });
                                  if (res.ok) { refetch(); refetchSummary(); DeviceEventEmitter.emit("groups-updated"); }
                                } finally { setRecordingSettlement(false); }
                              },
                            },
                          ]);
                        }}
                        disabled={recordingSettlement}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.miniBtnSecondaryText, { color: theme.textSecondary }]}>Paid</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {hasActivity && allSettled && (
          <View style={[s.settledBadge, { marginTop: 16, backgroundColor: theme.primaryLight }]}>
            <Ionicons name="checkmark-circle" size={20} color={theme.primaryDark} />
            <Text style={[s.settledBadgeText, { color: theme.primaryDark }]}>All settled up</Text>
          </View>
        )}

        {!isDemoOn && detail.isOwner && !isArchived ? (
          <TouchableOpacity
            style={{ marginTop: 28, paddingVertical: 12 }}
            onPress={() =>
              Alert.alert(
                "Archive this group?",
                "It will disappear from your main list. Open People & groups → Show archived groups to restore it.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Archive", style: "destructive", onPress: () => void patchArchive(true) },
                ]
              )
            }
            activeOpacity={0.7}
          >
            <Text style={[s.archiveLink, { color: theme.textQuaternary }]}>Archive group</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 100 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
  groupIcon: { width: 56, height: 56, borderRadius: radii.xl, backgroundColor: colors.primaryLight, justifyContent: "center", alignItems: "center" },
  groupName: { fontSize: 22, fontWeight: "700", fontFamily: font.bold, color: colors.text },
  groupMeta: { fontSize: 14, fontFamily: font.regular, color: colors.textTertiary, marginTop: 4 },
  section: { fontSize: 13, fontWeight: "700", fontFamily: font.bold, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: "hidden", ...shadow.md },
  txRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  txInfo: { flex: 1 },
  txMerchant: { fontSize: 15, fontWeight: "600", fontFamily: font.semibold, color: colors.text },
  txMeta: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "600", fontFamily: font.semibold, color: colors.text },
  empty: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 32, alignItems: "center", ...shadow.md },
  emptyIcon: { width: 52, height: 52, borderRadius: radii.lg, backgroundColor: colors.borderLight, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "600", fontFamily: font.semibold, color: colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  suggRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14, marginBottom: 8, gap: 12, ...shadow.sm },
  suggPeople: { flexDirection: "row", alignItems: "center", gap: 6 },
  suggInfo: { flex: 1 },
  suggText: { fontSize: 14, fontFamily: font.regular, color: colors.textSecondary },
  suggAmount: { fontSize: 15, fontWeight: "700", fontFamily: font.bold, marginTop: 2 },
  suggActions: { flexDirection: "row", gap: 6 },
  miniBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radii.sm },
  miniBtnPrimary: { backgroundColor: colors.primary },
  miniBtnSecondary: { borderWidth: 1, borderColor: colors.border },
  miniBtnText: { color: "#fff", fontWeight: "600", fontFamily: font.semibold, fontSize: 13 },
  miniBtnSecondaryText: { color: colors.textSecondary, fontWeight: "500", fontFamily: font.medium, fontSize: 13 },
  settledBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primaryLight, padding: 14, borderRadius: radii.md },
  settledBadgeText: { fontSize: 14, color: colors.primaryDark, fontWeight: "600", fontFamily: font.semibold },
  archivedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  archivedBannerText: { flex: 1, fontSize: 13, fontFamily: font.regular },
  archivedRestore: { fontSize: 14, fontFamily: font.semibold },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  balanceRowName: { fontSize: 15, fontFamily: font.semibold, flex: 1 },
  balanceRowAmt: { fontSize: 14, fontFamily: font.semibold, marginLeft: 8 },
  balanceRowText: { fontSize: 14, fontFamily: font.regular },
  archiveLink: { fontSize: 14, fontFamily: font.medium, textAlign: "center" },
  bold: { fontWeight: "700", fontFamily: font.bold },
  green: { color: colors.green },
  avatar: { justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontFamily: font.bold },
});
