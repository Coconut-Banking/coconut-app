import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  Image,
  AppState,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useApiFetch } from "../../../lib/api";
import { usePersonDetail } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { useDemoData } from "../../../lib/demo-context";
import { PersonSkeletonScreen, haptic } from "../../../components/ui";
import { sfx } from "../../../lib/sounds";
import { MerchantLogo } from "../../../components/merchant/MerchantLogo";
import { MemberAvatar } from "../../../components/MemberAvatar";
import { colors, font, radii, prototype } from "../../../lib/theme";
import { formatSplitCurrencyAmount } from "../../../lib/format-split-money";
import { setExpensePrefillTarget } from "../../../lib/add-expense-prefill";
import { openVenmo, openPayPal, openCashApp } from "../../../lib/p2p-deeplinks";

/** Friend detail — aligned to `MobileAppPage` `FriendDetail` + existing settlement APIs */
export default function PersonScreen() {
  const { key, source } = useLocalSearchParams<{ key: string; source?: string }>();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { detail: realDetail, loading, refetch } = usePersonDetail(isDemoOn ? null : (key ?? null));
  const detail = isDemoOn && key ? demo.personDetails[key] ?? null : realDetail;

  const goBack = useCallback(() => {
    if (source === "home") {
      router.replace("/(tabs)");
    } else {
      router.back();
    }
  }, [source]);

  const [recordingSettlement, setRecordingSettlement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settleSheetOpen, setSettleSheetOpen] = useState(false);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const [pendingP2PPlatform, setPendingP2PPlatform] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active" && pendingP2PPlatform) {
        setConfirmPaymentOpen(true);
        setPendingP2PPlatform(null);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [pendingP2PPlatform]);

  useEffect(() => {
    if (detail && key) {
      setExpensePrefillTarget({ key, name: detail.displayName, type: "friend" });
    }
    return () => setExpensePrefillTarget(null);
  }, [key, detail?.displayName]);

  useEffect(() => {
    const subs = [
      DeviceEventEmitter.addListener("expense-added", () => refetch(true)),
      DeviceEventEmitter.addListener("groups-updated", () => refetch(true)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [refetch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch(true);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  if (!detail) {
    if (loading) return <PersonSkeletonScreen />;
    return (
      <SafeAreaView style={[s.container, { backgroundColor: colors.primaryLight }]} edges={["top"]}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={goBack} style={s.backRow} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="alert-circle-outline" size={48} color="#999" style={{ marginBottom: 12 }} />
          <Text style={{ fontFamily: font.semibold, fontSize: 17, color: colors.primary, marginBottom: 4 }}>
            Friend not found
          </Text>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: "#999", textAlign: "center", paddingHorizontal: 40 }}>
            This person may have been removed.
          </Text>
          <TouchableOpacity onPress={goBack} style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 10 }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: "#fff" }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const EPS = 0.005;
  const balLines =
    detail.currencyBalances && detail.currencyBalances.length > 0
      ? detail.currencyBalances
      : detail.balance != null && Math.abs(detail.balance) >= EPS
        ? [{ currency: "USD", amount: detail.balance }]
        : [];
  const settled = balLines.length === 0;
  const hasPos = balLines.some((b) => b.amount > EPS);
  const hasNeg = balLines.some((b) => b.amount < -EPS);
  const pillGreen = hasPos && !hasNeg;
  const pillRed = hasNeg && !hasPos;
  const singleOwedYou = balLines.length === 1 && balLines[0].amount > EPS;
  const firstLine = balLines[0];
  const canStripeUsd = singleOwedYou && firstLine.currency === "USD";

  const handleMarkPaid = () => {
    if ((detail.settlements ?? []).length === 0) return;
    if (isDemoOn && key) {
      sfx.coin();
      demo.settlePerson(key);
      goBack();
      return;
    }
    const summary =
      balLines.length > 0
        ? balLines.map((b) => formatSplitCurrencyAmount(b.amount, b.currency)).join(", ")
        : formatSplitCurrencyAmount(0, "USD");
    Alert.alert("Mark as paid", `Record settled amounts: ${summary}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark paid",
        onPress: async () => {
          setRecordingSettlement(true);
          try {
            let anyFailed = false;
            for (const se of detail.settlements ?? []) {
              const res = await apiFetch("/api/settlements", {
                method: "POST",
                body: {
                  groupId: se.groupId,
                  payerMemberId: se.fromMemberId,
                  receiverMemberId: se.toMemberId,
                  amount: se.amount,
                  method: "manual",
                  currency: se.currency ?? "USD",
                },
              });
              if (!res.ok) anyFailed = true;
            }
            if (anyFailed) {
              Alert.alert("Error", "Some settlements could not be recorded");
            } else {
              DeviceEventEmitter.emit("groups-updated");
              goBack();
            }
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
    if (!singleOwedYou || !canStripeUsd) {
      Alert.alert("Tap to Pay", "Tap to Pay is available for USD balances only.");
      return;
    }
    if (isDemoOn) {
      Alert.alert("Demo", "Opening Tap to Pay...");
      return;
    }
    const se = (detail.settlements ?? [])[0];
    if (!se) return;
    router.push({
      pathname: "/(tabs)/pay",
      params: {
        amount: firstLine.amount.toFixed(2),
        groupId: se.groupId,
        payerMemberId: se.fromMemberId,
        receiverMemberId: se.toMemberId,
      },
    });
  };

  const handles = detail.p2pHandles;
  const venmoRecipient = handles?.venmo_username || detail.email;
  const hasVenmo = !!venmoRecipient;
  const hasPayPal = !!handles?.paypal_username;
  const hasCashApp = !!handles?.cashapp_cashtag;
  const hasAnyP2P = hasVenmo || hasPayPal || hasCashApp;
  const uniqueSettlementGroupIds = [...new Set((detail.settlements ?? []).map((se) => se.groupId))];
  const singleGroupIdForHandles =
    uniqueSettlementGroupIds.length === 1 ? uniqueSettlementGroupIds[0] : null;
  const settleAmount = firstLine ? Math.abs(firstLine.amount) : 0;
  const topExpenses = detail.activity
    .slice(0, 3)
    .map((a) => a.merchant)
    .filter(Boolean);
  const settleNote = topExpenses.length > 0
    ? `Coconut – ${topExpenses.join(", ")}`
    : `Coconut – ${detail.displayName}`;

  const handleP2P = async (platform: "venmo" | "paypal" | "cashapp") => {
    if (isDemoOn) {
      const names = { venmo: "Venmo", paypal: "PayPal", cashapp: "Cash App" };
      Alert.alert("Demo", `Opening ${names[platform]}...`);
      return;
    }
    setSettleSheetOpen(false);
    setPendingP2PPlatform(platform);
    try {
      if (platform === "venmo") {
        await openVenmo(settleAmount, venmoRecipient, settleNote);
      } else if (platform === "paypal") {
        await openPayPal(settleAmount, handles?.paypal_username);
      } else {
        await openCashApp(settleAmount, handles?.cashapp_cashtag);
      }
    } catch {
      setPendingP2PPlatform(null);
      const names = { venmo: "Venmo", paypal: "PayPal", cashapp: "Cash App" };
      Alert.alert("Could not open app", `Make sure ${names[platform]} is installed.`);
    }
  };

  const handleConfirmP2PPayment = async () => {
    setConfirmPaymentOpen(false);
    if ((detail.settlements ?? []).length === 0) return;
    if (isDemoOn && key) {
      sfx.coin();
      demo.settlePerson(key);
      goBack();
      return;
    }
    setRecordingSettlement(true);
    try {
      let anyFailed = false;
      for (const se of detail.settlements ?? []) {
        const res = await apiFetch("/api/settlements", {
          method: "POST",
          body: {
            groupId: se.groupId,
            payerMemberId: se.fromMemberId,
            receiverMemberId: se.toMemberId,
            amount: se.amount,
            method: "manual",
            currency: se.currency ?? "USD",
          },
        });
        if (!res.ok) anyFailed = true;
      }
      if (anyFailed) {
        Alert.alert("Error", "Some settlements could not be recorded");
      } else {
        DeviceEventEmitter.emit("groups-updated");
        goBack();
      }
    } catch {
      Alert.alert("Error", "Could not record settlement");
    } finally {
      setRecordingSettlement(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={goBack} style={s.backRow} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={s.backText}>{source === "home" ? "Home" : "Friends"}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={s.hero}>
          <MemberAvatar name={detail.displayName} size={76} imageUrl={detail.image_url} variant="soft" />
          <Text style={s.heroName}>{detail.displayName}</Text>
          <Text style={s.heroMeta}>
            {detail.activity.length} shared expense{detail.activity.length !== 1 ? "s" : ""}
          </Text>
          <View
            style={[
              s.balancePill,
              pillGreen
                ? { backgroundColor: prototype.greenBg, borderColor: `${prototype.green}44` }
                : pillRed
                  ? { backgroundColor: prototype.redBg, borderColor: `${prototype.red}44` }
                  : { backgroundColor: "#F7F3F0", borderColor: "#E3DBD8" },
            ]}
          >
            {settled ? (
              <Text style={[s.balanceAmt, { color: "#8A9098" }]}>{formatSplitCurrencyAmount(0, "USD")}</Text>
            ) : (
              balLines.map((b) => {
                const p = b.amount > EPS;
                const n = b.amount < -EPS;
                return (
                  <Text
                    key={b.currency}
                    style={[
                      s.balanceAmt,
                      p ? { color: prototype.green } : n ? { color: prototype.red } : { color: "#8A9098" },
                      balLines.length > 1 ? { fontSize: 22, marginBottom: 4 } : null,
                    ]}
                  >
                    {p ? "+" : n ? "−" : ""}
                    {formatSplitCurrencyAmount(b.amount, b.currency)}
                  </Text>
                );
              })
            )}
            <Text
              style={[
                s.balanceLbl,
                pillGreen
                  ? { color: prototype.green }
                  : pillRed
                    ? { color: prototype.red }
                    : { color: "#8A9098" },
              ]}
            >
              {settled
                ? "All settled up"
                : pillGreen
                  ? `${detail.displayName.split(" ")[0] ?? "They"} owes you`
                  : pillRed
                    ? `You owe ${detail.displayName.split(" ")[0] ?? "them"}`
                    : "Open balances"}
            </Text>
          </View>
        </View>

        {!settled && (
          <View style={s.actions}>
            {singleOwedYou && canStripeUsd && (
              <TouchableOpacity
                style={s.tapToPayBtn}
                onPress={handleTapToPay}
                activeOpacity={0.8}
              >
                <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                <Text style={s.settleUpBtnText}>Tap to Pay</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={singleOwedYou && canStripeUsd ? s.settleUpBtnSecondary : s.settleUpBtn}
              onPress={() => { sfx.sheetOpen(); setSettleSheetOpen(true); }}
              activeOpacity={0.8}
            >
              {recordingSettlement ? (
                <ActivityIndicator size="small" color={singleOwedYou && canStripeUsd ? "#1F2328" : "#fff"} />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color={singleOwedYou && canStripeUsd ? "#1F2328" : "#fff"} />
                  <Text style={singleOwedYou && canStripeUsd ? s.settleUpBtnSecondaryText : s.settleUpBtnText}>{/* gitleaks:allow */}
                    {singleOwedYou && canStripeUsd ? "Other options" : "Settle up"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {settled && detail.activity.length > 0 && (
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
                <TouchableOpacity
                  style={s.txRow}
                  activeOpacity={0.7}
                  onPress={() => router.push({ pathname: "/(tabs)/shared/transaction", params: { id: a.id } })}
                >
                  {a.receiptUrl ? (
                    <Image source={{ uri: a.receiptUrl }} style={s.txThumb} />
                  ) : (
                    <MerchantLogo merchantName={a.merchant} size={38} backgroundColor="#F7F3F0" borderColor="transparent" />
                  )}
                  <View style={s.txInfo}>
                    <Text style={s.txMerchant}>{a.merchant}</Text>
                    {a.groupType !== "friend" && a.groupName ? (
                      <Text style={s.txGroup}>{a.groupName}</Text>
                    ) : null}
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
                      {a.effectOnBalance > 0 ? "+" : a.effectOnBalance < 0 ? "-" : ""}
                      {formatSplitCurrencyAmount(a.effectOnBalance, a.currency ?? "USD")}
                    </Text>
                    <Text style={s.txTotal}>
                      {formatSplitCurrencyAmount(a.amount, a.currency ?? "USD")} total
                    </Text>
                  </View>
                </TouchableOpacity>
                {i < detail.activity.length - 1 ? <View style={s.rowSep} /> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={settleSheetOpen} transparent animationType="slide" onRequestClose={() => setSettleSheetOpen(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setSettleSheetOpen(false)}>
          <Pressable style={s.sheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Settle up</Text>
            <Text style={s.sheetSub}>
              {balLines.map((b) => formatSplitCurrencyAmount(b.amount, b.currency)).join(", ")} with {detail.displayName.split(" ")[0]}
            </Text>

            {singleOwedYou && canStripeUsd && (
              <TouchableOpacity
                style={s.sheetBtnAccent}
                onPress={() => { setSettleSheetOpen(false); handleTapToPay(); }}
                activeOpacity={0.8}
              >
                <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetBtnAccentText}>Tap to Pay</Text>
                  <Text style={s.sheetBtnAccentSub}>Collect in person with NFC</Text>
                </View>
              </TouchableOpacity>
            )}

            {hasVenmo && (
              <TouchableOpacity
                style={s.sheetBtnOutline}
                onPress={() => handleP2P("venmo")}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-venmo" size={18} color="#3D95CE" />
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetBtnOutlineText}>Venmo</Text>
                  <Text style={s.sheetBtnOutlineSub}>
                    {handles?.venmo_username ? `Pay @${handles.venmo_username}` : `Pay ${venmoRecipient}`}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {hasPayPal && (
              <TouchableOpacity
                style={s.sheetBtnOutline}
                onPress={() => handleP2P("paypal")}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-paypal" size={18} color="#003087" />
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetBtnOutlineText}>PayPal</Text>
                  <Text style={s.sheetBtnOutlineSub}>Pay {handles!.paypal_username}</Text>
                </View>
              </TouchableOpacity>
            )}

            {hasCashApp && (
              <TouchableOpacity
                style={s.sheetBtnOutline}
                onPress={() => handleP2P("cashapp")}
                activeOpacity={0.8}
              >
                <Ionicons name="cash-outline" size={18} color="#00D632" />
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetBtnOutlineText}>Cash App</Text>
                  <Text style={s.sheetBtnOutlineSub}>Pay {handles!.cashapp_cashtag}</Text>
                </View>
              </TouchableOpacity>
            )}

            {!hasAnyP2P && (
              <View style={{ gap: 10 }}>
                <View style={[s.sheetBtnOutline, { opacity: 0.45, marginBottom: 0 }]}>
                  <Ionicons name="wallet-outline" size={18} color="#1F2328" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetBtnOutlineText}>Venmo / PayPal / Cash App</Text>
                    <Text style={s.sheetBtnOutlineSub}>
                      Add payment handles in each shared group's Members section (group owners can edit them).
                    </Text>
                  </View>
                </View>
                {singleGroupIdForHandles ? (
                  <TouchableOpacity
                    style={s.sheetLinkRow}
                    onPress={() => {
                      setSettleSheetOpen(false);
                      router.push({ pathname: "/(tabs)/shared/group", params: { id: singleGroupIdForHandles } });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.sheetLinkText}>Open group to add handles</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <TouchableOpacity
              style={s.sheetBtnOutline}
              onPress={() => { setSettleSheetOpen(false); handleMarkPaid(); }}
              disabled={recordingSettlement}
              activeOpacity={0.8}
            >
              <Ionicons name="cash-outline" size={18} color="#1F2328" />
              <View style={{ flex: 1 }}>
                <Text style={s.sheetBtnOutlineText}>Cash / Other</Text>
                <Text style={s.sheetBtnOutlineSub}>Record as settled manually</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.sheetDone} onPress={() => setSettleSheetOpen(false)}>
              <Text style={s.sheetDoneText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={confirmPaymentOpen} transparent animationType="fade" onRequestClose={() => setConfirmPaymentOpen(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setConfirmPaymentOpen(false)}>
          <Pressable style={s.confirmCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.confirmIcon}>
              <Ionicons name="checkmark-circle" size={44} color={prototype.green} />
            </View>
            <Text style={s.confirmTitle}>Payment sent?</Text>
            <Text style={s.confirmSub}>
              If you completed the payment, mark it as settled in Coconut.
            </Text>
            <TouchableOpacity style={s.confirmBtn} onPress={handleConfirmP2PPayment} activeOpacity={0.8}>
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={s.confirmBtnText}>Mark as paid</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmDismiss} onPress={() => setConfirmPaymentOpen(false)}>
              <Text style={s.confirmDismissText}>Not yet</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  actions: { marginBottom: 24, gap: 10 },
  tapToPayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  settleUpBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: prototype.green,
  },
  settleUpBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: "#F0EDEB",
  },
  settleUpBtnText: { color: "#fff", fontFamily: font.bold, fontSize: 16 },
  settleUpBtnSecondaryText: { color: "#1F2328", fontFamily: font.semibold, fontSize: 15 },
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
  txThumb: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#F7F3F0" },
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
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheetCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#E3DBD8", alignSelf: "center", marginTop: 10, marginBottom: 16 },
  sheetTitle: { fontFamily: font.black, fontSize: 20, color: "#1F2328", marginBottom: 4 },
  sheetSub: { fontFamily: font.regular, fontSize: 14, color: "#7A8088", marginBottom: 20 },
  sheetBtnAccent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: prototype.green,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    marginBottom: 10,
  },
  sheetBtnAccentText: { fontFamily: font.bold, fontSize: 15, color: "#fff" },
  sheetBtnAccentSub: { fontFamily: font.regular, fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 1 },
  sheetBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  sheetBtnOutlineText: { fontFamily: font.semibold, fontSize: 15, color: "#1F2328" },
  sheetBtnOutlineSub: { fontFamily: font.regular, fontSize: 12, color: "#7A8088", marginTop: 1 },
  sheetLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  sheetLinkText: { fontFamily: font.semibold, fontSize: 15, color: colors.primary },
  sheetDone: { alignItems: "center", marginTop: 8, paddingVertical: 12 },
  sheetDoneText: { fontFamily: font.semibold, fontSize: 15, color: "#7A8088" },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  confirmCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginHorizontal: 32,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",
    alignSelf: "center",
  },
  confirmIcon: { marginBottom: 12 },
  confirmTitle: { fontFamily: font.black, fontSize: 20, color: "#1F2328", marginBottom: 6, textAlign: "center" },
  confirmSub: { fontFamily: font.regular, fontSize: 14, color: "#7A8088", textAlign: "center", marginBottom: 20, lineHeight: 20 },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: prototype.green,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radii.md,
    width: "100%",
    marginBottom: 10,
  },
  confirmBtnText: { fontFamily: font.bold, fontSize: 15, color: "#fff" },
  confirmDismiss: { paddingVertical: 10 },
  confirmDismissText: { fontFamily: font.semibold, fontSize: 15, color: "#7A8088" },
});
