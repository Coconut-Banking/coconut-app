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
import { MerchantLogo } from "../../../components/merchant/MerchantLogo";
import { colors, font, radii, prototype } from "../../../lib/theme";

const MEMBER_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"];

function MemberAvatar({ name, size = 76 }: { name: string; size?: number }) {
  const hue = MEMBER_COLORS[name.charCodeAt(0) % MEMBER_COLORS.length];
  return (
    <View
      style={[
        s.avatarRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${hue}28`,
          borderColor: `${hue}44`,
        },
      ]}
    >
      <Text style={[s.avatarText, { color: hue, fontSize: size * 0.32 }]}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

/** Friend detail — aligned to `MobileAppPage` `FriendDetail` + existing settlement APIs */
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
    try {
      await refetch(true);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  if (!detail) {
    return <PersonSkeletonScreen />;
  }

  const handleRequest = async () => {
    if (detail.balance <= 0) return;
    if (isDemoOn) {
      Alert.alert("Demo", "Payment request sent!");
      return;
    }
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
    } finally {
      setRequestingPayment(false);
    }
  };

  const handleMarkPaid = () => {
    if ((detail.settlements ?? []).length === 0) return;
    if (isDemoOn && key) {
      haptic.success();
      demo.settlePerson(key);
      router.back();
      return;
    }
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
          } catch {
            Alert.alert("Error", "Could not record settlement");
          } finally {
            setRecordingSettlement(false);
          }
        },
      },
    ]);
  };

  const handleTapToPay = () => {
    if (detail.balance <= 0) return;
    if (isDemoOn) {
      Alert.alert("Demo", "Opening Tap to Pay...");
      return;
    }
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

  const pos = detail.balance > 0;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backRow} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={s.backText}>Friends</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={s.hero}>
          <MemberAvatar name={detail.displayName} />
          <Text style={s.heroName}>{detail.displayName}</Text>
          <Text style={s.heroMeta}>
            {detail.activity.length} shared expense{detail.activity.length !== 1 ? "s" : ""}
          </Text>
          <View
            style={[
              s.balancePill,
              pos ? { backgroundColor: prototype.greenBg, borderColor: `${prototype.green}44` } : detail.balance < 0
                ? { backgroundColor: prototype.redBg, borderColor: `${prototype.red}44` }
                  : { backgroundColor: "#F7F3F0", borderColor: "#E3DBD8" },
            ]}
          >
            <Text
              style={[
                s.balanceAmt,
                pos ? { color: prototype.green } : detail.balance < 0 ? { color: prototype.red } : { color: "#8A9098" },
              ]}
            >
              {detail.balance === 0 ? "$0.00" : `${pos ? "+" : detail.balance < 0 ? "−" : ""}$${Math.abs(detail.balance).toFixed(2)}`}
            </Text>
            <Text
              style={[
                s.balanceLbl,
                pos ? { color: prototype.green } : detail.balance < 0 ? { color: prototype.red } : { color: "#8A9098" },
              ]}
            >
              {detail.balance > 0
                ? `${detail.displayName.split(" ")[0] ?? "They"} owes you`
                : detail.balance < 0
                  ? `You owe ${detail.displayName.split(" ")[0] ?? "them"}`
                  : "All settled up"}
            </Text>
          </View>
        </View>

        {detail.balance !== 0 && (
          <View style={s.actions}>
            {detail.balance > 0 && (
              <>
                <TouchableOpacity style={s.btnPrimary} onPress={handleRequest} disabled={requestingPayment} activeOpacity={0.7}>
                  {requestingPayment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="#fff" />
                      <Text style={s.btnText}>Request</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={s.btnBlue} onPress={handleTapToPay} activeOpacity={0.7}>
                  <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
                  <Text style={s.btnText}>Tap to Pay</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={s.btnGhost} onPress={handleMarkPaid} disabled={recordingSettlement} activeOpacity={0.7}>
              {recordingSettlement ? (
                <ActivityIndicator size="small" color="#4B5563" />
              ) : (
                <Text style={s.btnGhostText}>Mark paid</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {detail.balance === 0 && detail.activity.length > 0 && (
          <View style={s.settledBadge}>
            <Ionicons name="checkmark-circle" size={20} color={prototype.green} />
            <Text style={s.settledText}>All settled up with {detail.displayName}</Text>
          </View>
        )}

        <Text style={s.section}>Shared expenses</Text>
        {detail.activity.length === 0 ? (
          <Text style={s.emptyText}>No shared transactions yet.</Text>
        ) : (
          <View style={s.card}>
            {detail.activity.map((a, i) => (
              <View key={a.id}>
                <View style={s.txRow}>
                  <MerchantLogo merchantName={a.merchant} size={38} backgroundColor="#F7F3F0" borderColor="transparent" />
                  <View style={s.txInfo}>
                    <Text style={s.txMerchant}>{a.merchant}</Text>
                    <Text style={s.txGroup}>{a.groupName}</Text>
                  </View>
                  <View style={s.txRight}>
                    <Text
                      style={[
                        s.txAmt,
                        a.effectOnBalance > 0
                          ? { color: prototype.green }
                          : a.effectOnBalance < 0
                            ? { color: prototype.red }
                            : { color: "#8A9098" },
                      ]}
                    >
                      {a.effectOnBalance > 0 ? "+" : a.effectOnBalance < 0 ? "-" : ""}${Math.abs(a.effectOnBalance).toFixed(2)}
                    </Text>
                    <Text style={s.txTotal}>${a.amount.toFixed(2)} total</Text>
                  </View>
                </View>
                {i < detail.activity.length - 1 ? <View style={s.rowSep} /> : null}
              </View>
            ))}
          </View>
        )}
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
  hero: { alignItems: "center", paddingTop: 8, paddingBottom: 20 },
  avatarRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 12,
  },
  avatarText: { fontFamily: font.bold },
  heroName: { fontSize: 20, fontFamily: font.black, color: "#1F2328", textAlign: "center" },
  heroMeta: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 4 },
  balancePill: {
    marginTop: 14,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  balanceAmt: { fontSize: 30, fontFamily: font.black, letterSpacing: -1 },
  balanceLbl: { fontSize: 12, marginTop: 4, opacity: 0.85, fontFamily: font.medium },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  btnBlue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    backgroundColor: "#1F2328",
  },
  btnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "600", fontFamily: font.semibold, fontSize: 14 },
  btnGhostText: { color: "#4B5563", fontFamily: font.semibold, fontSize: 14 },
  settledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: prototype.greenBg,
    padding: 14,
    borderRadius: radii.md,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${prototype.green}33`,
  },
  settledText: { fontSize: 14, color: prototype.green, fontWeight: "600", fontFamily: font.semibold },
  section: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: "#9AA0A6",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  emptyText: { fontSize: 14, fontFamily: font.regular, color: "#7A8088" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    overflow: "hidden",
  },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingHorizontal: 16 },
  rowSep: { height: 1, backgroundColor: "#EEE8E4", marginLeft: 66 },
  txEmoji: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F7F3F0",
    alignItems: "center",
    justifyContent: "center",
  },
  txInfo: { flex: 1, marginLeft: 12 },
  txMerchant: { fontSize: 14, fontFamily: font.semibold, color: "#1F2328" },
  txGroup: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 2 },
  txRight: { alignItems: "flex-end" },
  txAmt: { fontSize: 15, fontFamily: font.bold },
  txTotal: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 2 },
});
