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
import { useApiFetch } from "../../../lib/api";
import { usePersonDetail } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { useDemoData } from "../../../lib/demo-context";
import { PersonSkeletonScreen, haptic } from "../../../components/ui";

const MEMBER_COLORS = ["#3D8E62", "#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#8B5CF6"];

function MemberAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const idx = name.charCodeAt(0) % MEMBER_COLORS.length;
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: MEMBER_COLORS[idx] }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.35 }]}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

export default function PersonScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { detail: realDetail, loading, refetch } = usePersonDetail(isDemoOn ? null : (key ?? null));
  const detail = isDemoOn && key ? demo.personDetails[key] ?? null : realDetail;

  const [requestingPayment, setRequestingPayment] = useState(false);
  const [recordingSettlement, setRecordingSettlement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(true); } finally { setRefreshing(false); }
  }, [refetch]);

  if (!detail) {
    return <PersonSkeletonScreen />;
  }

  const handleRequest = async () => {
    if (detail.balance <= 0) return;
    if (isDemoOn) { Alert.alert("Demo", "Payment request sent!"); return; }
    setRequestingPayment(true);
    try {
      const se = (detail.settlements ?? [])[0];
      const res = await apiFetch("/api/stripe/create-payment-link", {
        method: "POST",
        body: {
          amount: detail.balance,
          description: "expenses",
          recipientName: detail.displayName,
          groupId: se?.groupId,
          payerMemberId: se?.fromMemberId,
          receiverMemberId: se?.toMemberId,
        },
      });
      const data = await res.json();
      if (res.ok && data.url) {
        await Share.share({
          message: `You owe me $${detail.balance.toFixed(2)}. Pay here: ${data.url}`,
          url: data.url,
          title: "Payment request",
        });
      }
    } finally { setRequestingPayment(false); }
  };

  const handleMarkPaid = () => {
    if ((detail.settlements ?? []).length === 0) return;
    if (isDemoOn && key) { haptic.success(); demo.settlePerson(key); router.back(); return; }
    Alert.alert("Mark as paid", `Mark $${Math.abs(detail.balance).toFixed(2)} as paid?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark paid",
        onPress: async () => {
          setRecordingSettlement(true);
          try {
            for (const se of detail.settlements ?? []) {
              await apiFetch("/api/settlements", {
                method: "POST",
                body: {
                  groupId: se.groupId,
                  payerMemberId: se.fromMemberId,
                  receiverMemberId: se.toMemberId,
                  amount: se.amount,
                  method: "manual",
                },
              });
            }
            router.back();
          } catch { Alert.alert("Error", "Could not record settlement"); }
          finally { setRecordingSettlement(false); }
        },
      },
    ]);
  };

  const handleTapToPay = () => {
    if (detail.balance <= 0) return;
    if (isDemoOn) { Alert.alert("Demo", "Opening Tap to Pay..."); return; }
    const se = (detail.settlements ?? [])[0];
    if (!se) return;
    router.push({
      pathname: "/(tabs)/pay",
      params: {
        amount: detail.balance.toFixed(2),
        groupId: se.groupId,
        payerMemberId: se.fromMemberId,
        receiverMemberId: se.toMemberId,
      },
    });
  };

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3D8E62" />}
      >
        <View style={s.header}>
          <MemberAvatar name={detail.displayName} size={56} />
          <View style={s.headerInfo}>
            <Text style={s.headerName}>{detail.displayName}</Text>
            <Text style={[
              s.headerBalance,
              detail.balance > 0 && s.green,
              detail.balance < 0 && s.amber,
              detail.balance === 0 && s.muted,
            ]}>
              {detail.balance > 0
                ? `Owes you $${detail.balance.toFixed(2)}`
                : detail.balance < 0
                  ? `You owe $${Math.abs(detail.balance).toFixed(2)}`
                  : "All settled up"}
            </Text>
          </View>
        </View>

        {detail.balance !== 0 && (
          <View style={s.actions}>
            {detail.balance > 0 && (
              <>
                <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleRequest} disabled={requestingPayment} activeOpacity={0.7}>
                  {requestingPayment ? <ActivityIndicator size="small" color="#fff" /> : (
                    <><Ionicons name="send" size={16} color="#fff" /><Text style={s.btnText}>Request</Text></>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.btnTap]} onPress={handleTapToPay} activeOpacity={0.7}>
                  <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
                  <Text style={s.btnText}>Tap to Pay</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={handleMarkPaid} disabled={recordingSettlement} activeOpacity={0.7}>
              {recordingSettlement ? <ActivityIndicator size="small" color="#374151" /> : (
                <Text style={s.btnSecondaryText}>Mark paid</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {detail.balance === 0 && detail.activity.length > 0 && (
          <View style={s.settledBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#2D7A52" />
            <Text style={s.settledText}>All settled up with {detail.displayName}</Text>
          </View>
        )}

        <Text style={s.section}>Transactions</Text>
        {detail.activity.length === 0 ? (
          <Text style={s.emptyText}>No shared transactions yet.</Text>
        ) : (
          <View style={s.card}>
            {detail.activity.map((a, i) => (
              <View key={a.id} style={[s.txRow, i < detail.activity.length - 1 && s.txBorder]}>
                <View style={s.txInfo}>
                  <Text style={s.txMerchant}>{a.merchant}</Text>
                  <Text style={s.txGroup}>{a.groupName}</Text>
                </View>
                <View style={s.txRight}>
                  <Text style={[s.txAmt, a.effectOnBalance > 0 ? s.green : a.effectOnBalance < 0 ? s.amber : s.muted]}>
                    {a.effectOnBalance > 0 ? "+" : a.effectOnBalance < 0 ? "-" : ""}${Math.abs(a.effectOnBalance).toFixed(2)}
                  </Text>
                  <Text style={s.txTotal}>${a.amount.toFixed(2)} total</Text>
                </View>
              </View>
            ))}
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
  header: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  headerBalance: { fontSize: 15, fontWeight: "600", marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  btnPrimary: { backgroundColor: "#3D8E62" },
  btnTap: { backgroundColor: "#4A6CF7" },
  btnSecondary: { borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  btnSecondaryText: { color: "#374151", fontWeight: "500", fontSize: 14 },
  settledBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EEF7F2", padding: 14, borderRadius: 12, marginBottom: 24 },
  settledText: { fontSize: 14, color: "#2D7A52", fontWeight: "600" },
  section: { fontSize: 13, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#F3F4F6", overflow: "hidden" },
  txRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  txInfo: { flex: 1 },
  txMerchant: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  txGroup: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  txRight: { alignItems: "flex-end" },
  txAmt: { fontSize: 15, fontWeight: "700" },
  txTotal: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  avatar: { justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "700" },
  green: { color: "#059669" },
  amber: { color: "#B45309" },
  muted: { color: "#9CA3AF" },
});
