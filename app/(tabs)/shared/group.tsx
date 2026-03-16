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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApiFetch } from "../../../lib/api";
import { useGroupDetail, useGroupsSummary } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { useDemoData } from "../../../lib/demo-context";

const MEMBER_COLORS = ["#3D8E62", "#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#8B5CF6"];

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

  if (!detail) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#3D8E62" />
      </View>
    );
  }

  const hasActivity = (detail.activity?.length ?? 0) > 0;
  const allSettled = (detail.balances?.filter((b) => b.total !== 0).length ?? 0) === 0;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3D8E62" />}
      >
        <View style={s.groupHeader}>
          <View style={s.groupIcon}>
            <Ionicons name="people" size={28} color="#3D8E62" />
          </View>
          <View>
            <Text style={s.groupName}>{detail.name}</Text>
            <Text style={s.groupMeta}>
              {detail.members.length} members · ${detail.totalSpend?.toFixed(2) ?? "0.00"} total
            </Text>
          </View>
        </View>

        <Text style={s.section}>Transactions</Text>
        {!hasActivity ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="receipt-outline" size={28} color="#9CA3AF" />
            </View>
            <Text style={s.emptyTitle}>No transactions yet</Text>
            <Text style={s.emptySubtext}>Add an expense or split a receipt to start tracking.</Text>
          </View>
        ) : (
          <View style={s.card}>
            {(detail.activity ?? []).map((a, i) => (
              <View key={a.id} style={[s.txRow, i < detail.activity.length - 1 && s.txBorder]}>
                <View style={s.txInfo}>
                  <Text style={s.txMerchant}>{a.merchant}</Text>
                  <Text style={s.txMeta}>Split {a.splitCount} ways · {formatTimeAgo(a.createdAt)}</Text>
                </View>
                <Text style={s.txAmount}>${a.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {detail.suggestions && detail.suggestions.length > 0 && (
          <>
            <Text style={[s.section, { marginTop: 24 }]}>Settle up</Text>
            {detail.suggestions.map((su) => {
              const fromName = detail.members.find((m) => m.id === su.fromMemberId)?.display_name ?? "?";
              const toName = detail.members.find((m) => m.id === su.toMemberId)?.display_name ?? "?";
              const myMemberId = detail.members.find((m) => m.user_id === userId)?.id;
              const theyPayMe = myMemberId && su.toMemberId === myMemberId;
              const iPayThem = myMemberId && su.fromMemberId === myMemberId;
              return (
                <View key={`${su.fromMemberId}-${su.toMemberId}`} style={s.suggRow}>
                  <View style={s.suggPeople}>
                    <MemberAvatar name={fromName} />
                    <Ionicons name="arrow-forward" size={14} color="#9CA3AF" />
                    <MemberAvatar name={toName} />
                  </View>
                  <View style={s.suggInfo}>
                    <Text style={s.suggText}>
                      <Text style={s.bold}>{fromName}</Text> pays <Text style={s.bold}>{toName}</Text>
                    </Text>
                    <Text style={[s.suggAmount, s.green]}>${su.amount.toFixed(2)}</Text>
                  </View>
                  <View style={s.suggActions}>
                    {theyPayMe && (
                      <TouchableOpacity
                        style={[s.miniBtn, s.miniBtnPrimary]}
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
                    {(theyPayMe || iPayThem) && (
                      <TouchableOpacity
                        style={[s.miniBtn, s.miniBtnSecondary]}
                        onPress={() => {
                          if (isDemoOn && id) { demo.settleGroupSuggestion(id, su.fromMemberId, su.toMemberId); return; }
                          Alert.alert("Mark as paid", `Mark $${su.amount.toFixed(2)} as paid?`, [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Mark paid",
                              onPress: async () => {
                                setRecordingSettlement(true);
                                try {
                                  const res = await apiFetch("/api/settlements", {
                                    method: "POST",
                                    body: { groupId: id, payerMemberId: su.fromMemberId, receiverMemberId: su.toMemberId, amount: su.amount, method: "manual" },
                                  });
                                  if (res.ok) { refetch(); refetchSummary(); }
                                } finally { setRecordingSettlement(false); }
                              },
                            },
                          ]);
                        }}
                        disabled={recordingSettlement}
                        activeOpacity={0.7}
                      >
                        <Text style={s.miniBtnSecondaryText}>Paid</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {hasActivity && allSettled && (
          <View style={[s.settledBadge, { marginTop: 16 }]}>
            <Ionicons name="checkmark-circle" size={20} color="#2D7A52" />
            <Text style={s.settledBadgeText}>All settled up</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAF8" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 100 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
  groupIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: "#EEF7F2", justifyContent: "center", alignItems: "center" },
  groupName: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  groupMeta: { fontSize: 14, color: "#6B7280", marginTop: 4 },
  section: { fontSize: 13, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#F3F4F6", overflow: "hidden" },
  txRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  txInfo: { flex: 1 },
  txMerchant: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  txMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  empty: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#F3F4F6", padding: 32, alignItems: "center" },
  emptyIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151" },
  emptySubtext: { fontSize: 13, color: "#9CA3AF", marginTop: 4, textAlign: "center" },
  suggRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#F3F4F6", padding: 14, marginBottom: 8, gap: 12 },
  suggPeople: { flexDirection: "row", alignItems: "center", gap: 6 },
  suggInfo: { flex: 1 },
  suggText: { fontSize: 14, color: "#374151" },
  suggAmount: { fontSize: 15, fontWeight: "700", marginTop: 2 },
  suggActions: { flexDirection: "row", gap: 6 },
  miniBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10 },
  miniBtnPrimary: { backgroundColor: "#3D8E62" },
  miniBtnSecondary: { borderWidth: 1, borderColor: "#E5E7EB" },
  miniBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  miniBtnSecondaryText: { color: "#374151", fontWeight: "500", fontSize: 13 },
  settledBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EEF7F2", padding: 14, borderRadius: 12 },
  settledBadgeText: { fontSize: 14, color: "#2D7A52", fontWeight: "600" },
  bold: { fontWeight: "700" },
  green: { color: "#059669" },
  avatar: { justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "700" },
});
