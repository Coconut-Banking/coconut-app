import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  TextInput,
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTransactions, type Transaction } from "../../hooks/useTransactions";
import { useGroupsSummary } from "../../hooks/useGroups";
import { useApiFetch } from "../../lib/api";
import { colors, font, fontSize, shadow, radii, space, type as T } from "../../lib/theme";
import * as SecureStore from "expo-secure-store";
import { MerchantLogo } from "../../components/merchant/MerchantLogo";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

const MERCHANT_COLORS = [
  "#E50914", "#1DB954", "#00674B", "#FF9900", "#003366", "#7BB848",
  "#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#FF5A5F", "#9B59B6",
];
function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return MERCHANT_COLORS[Math.abs(h) % MERCHANT_COLORS.length];
}

function fmtCurrency(amount: number): string {
  return Math.abs(amount).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type Target = { type: "group" | "friend" | "self"; key: string; name: string };

export default function ReviewScreen() {
  const { transactions, loading: txLoading } = useTransactions();
  const { summary, loading: groupsLoading, refetch: refetchGroups } = useGroupsSummary({
    contacts: true,
  });
  const apiFetch = useApiFetch();

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [reviewedLoaded, setReviewedLoaded] = useState(false);

  const [splitStep, setSplitStep] = useState<null | "pick" | "confirm" | "add-friend">(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [newFriendName, setNewFriendName] = useState("");
  const [newFriendEmail, setNewFriendEmail] = useState("");

  useEffect(() => {
    SecureStore.getItemAsync("coconut:reviewed-tx")
      .then((val) => {
        if (val) { try { setReviewedIds(new Set(JSON.parse(val))); } catch { /* */ } }
      })
      .catch(() => {})
      .finally(() => setReviewedLoaded(true));
  }, []);

  const saveReviewed = useCallback((ids: Set<string>) => {
    setReviewedIds(ids);
    const arr = [...ids];
    if (arr.length > 500) arr.splice(0, arr.length - 500);
    SecureStore.setItemAsync("coconut:reviewed-tx", JSON.stringify(arr)).catch(() => {});
  }, []);

  const queue = transactions.filter(
    (tx) => !reviewedIds.has(tx.id) && tx.amount < 0 && !tx.isPending
  );
  const currentTx = queue[0] || null;

  const friends = summary?.friends ?? [];
  const groups = summary?.groups ?? [];
  const q = query.toLowerCase().trim();
  const filteredFriends = q ? friends.filter((f) => f.displayName.toLowerCase().includes(q)) : friends;
  const filteredGroups = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
  const noMatches = q.length > 0 && filteredFriends.length === 0 && filteredGroups.length === 0;

  const markReviewed = useCallback((txId: string) => {
    const next = new Set(reviewedIds);
    next.add(txId);
    saveReviewed(next);
  }, [reviewedIds, saveReviewed]);

  const handleSkip = useCallback(() => {
    if (!currentTx) return;
    animateOut("left", () => markReviewed(currentTx.id));
  }, [currentTx, markReviewed]);

  const handleSplitStart = useCallback(() => {
    if (!currentTx) return;
    setSplitStep("pick");
    setTarget(null);
    setQuery("");
    setError(null);
    refetchGroups(true); // always refresh contacts when picker opens
  }, [currentTx, refetchGroups]);

  const handlePickTarget = (t: Target) => {
    setTarget(t);
    if (currentTx) {
      setExpenseDesc(currentTx.merchant);
      setExpenseAmount(Math.abs(currentTx.amount).toFixed(2));
    }
    setSplitStep("confirm");
    setError(null);
  };

  const handleJustForMe = () => {
    handlePickTarget({ type: "self", key: "_self", name: "Just me" });
  };

  const startAddFriend = () => {
    setNewFriendName(query.trim());
    setNewFriendEmail("");
    setSplitStep("add-friend");
  };

  const handleAddNewFriend = async () => {
    const name = newFriendName.trim();
    const email = newFriendEmail.trim() || null;
    if (!name) return;
    setAddingFriend(true);
    try {
      const groupRes = await apiFetch("/api/groups", {
        method: "POST",
        body: { name, ownerDisplayName: "You" },
      });
      const group = await groupRes.json();
      if (!groupRes.ok || !group.id) {
        setError("Failed to create. Try again.");
        return;
      }
      const memberRes = await apiFetch(`/api/groups/${group.id}/members`, {
        method: "POST",
        body: { displayName: name, ...(email ? { email } : {}) },
      });
      const member = await memberRes.json().catch(() => null);
      if (__DEV__) console.log("[addFriend] member result:", memberRes.status, JSON.stringify(member));
      if (!memberRes.ok || !member?.id) {
        setError(member?.error || "Failed to add friend. Try again.");
        return;
      }
      await refetchGroups(true);
      // Go back to pick so user can see updated list (and pick multiple if needed)
      setNewFriendName("");
      setNewFriendEmail("");
      setSplitStep("pick");
      setQuery("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setAddingFriend(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentTx) return;
    const total = parseFloat(expenseAmount) || 0;
    if (total <= 0) { setError("Enter an amount"); return; }
    const desc = expenseDesc.trim() || "Expense";

    if (target?.type === "self") {
      markReviewed(currentTx.id);
      resetSplit();
      return;
    }

    if (!target) return;

    setSaving(true);
    setError(null);
    const payload = {
      amount: total,
      description: desc,
      groupId: target.type === "group" ? target.key : target.key.slice(0, 36),
      personKey: target.type === "friend" ? target.key : undefined,
    };
    if (__DEV__) console.log("[Review] submitting expense:", JSON.stringify(payload));
    try {
      const res = await apiFetch("/api/manual-expense", {
        method: "POST",
        body: payload,
      });
      if (res.ok) {
        DeviceEventEmitter.emit("expense-added");
        markReviewed(currentTx.id);
        resetSplit();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to save. Try again.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const resetSplit = () => {
    setSplitStep(null);
    setTarget(null);
    setExpenseDesc("");
    setExpenseAmount("");
    setQuery("");
    setError(null);
    pan.setValue({ x: 0, y: 0 });
  };

  const pan = useRef(new Animated.ValueXY()).current;

  const animateOut = (dir: "left" | "right", onDone: () => void) => {
    Animated.timing(pan, {
      toValue: { x: dir === "left" ? -SCREEN_WIDTH : SCREEN_WIDTH, y: 0 },
      duration: 200, useNativeDriver: false,
    }).start(() => { onDone(); pan.setValue({ x: 0, y: 0 }); });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) {
          animateOut("left", () => { if (currentTx) markReviewed(currentTx.id); });
        } else if (g.dx > SWIPE_THRESHOLD) {
          handleSplitStart();
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH], outputRange: ["-8deg", "0deg", "8deg"] });
  const skipOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD / 2, 0], outputRange: [1, 0.5, 0], extrapolate: "clamp" });
  const splitOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD / 2, SWIPE_THRESHOLD], outputRange: [0, 0.5, 1], extrapolate: "clamp" });

  const loading = txLoading || !reviewedLoaded;

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  // ── Empty state ──
  if (queue.length === 0 && !splitStep) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <View style={s.header}><Text style={T.heading}>Review</Text></View>
        <View style={s.centered}>
          <View style={s.emptyIcon}><Ionicons name="checkmark-circle" size={48} color={colors.primary} /></View>
          <Text style={[T.subheading, { marginTop: space.lg }]}>All caught up</Text>
          <Text style={[T.caption, { marginTop: space.sm, textAlign: "center", paddingHorizontal: 40 }]}>
            No transactions to review right now.
          </Text>
          <TouchableOpacity style={{ marginTop: space.xl }} onPress={() => saveReviewed(new Set())}>
            <Text style={{ fontFamily: font.semibold, fontSize: fontSize.md, color: colors.primary }}>Reset & review all</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Pick person/group ──
  if (splitStep === "pick" && currentTx) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <View style={s.pickHeader}>
          <TouchableOpacity onPress={resetSplit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={colors.textTertiary} />
          </TouchableOpacity>
          <Text style={T.bodySemibold}>Split with</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={s.txSummary}>
          <Text style={T.bodyMedium}>{currentTx.merchant}</Text>
          <Text style={[T.caption, { marginTop: 2 }]}>{fmtCurrency(currentTx.amount)} · {currentTx.dateStr}</Text>
        </View>

        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search or add someone new"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            autoFocus
            maxLength={200}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {groupsLoading && (
            <View style={{ alignItems: "center", paddingVertical: space.xl }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
          {/* Just for me */}
          <TouchableOpacity style={s.justMeRow} onPress={handleJustForMe}>
            <View style={[s.avatar, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="person" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={T.bodyMedium}>Just for me</Text>
              <Text style={T.caption}>Don&apos;t split — mark as reviewed</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Add new person (shown when searching with no matches) */}
          {noMatches && (
            <TouchableOpacity style={s.addNewRow} onPress={startAddFriend}>
              <View style={[s.avatar, { backgroundColor: colors.blueBg }]}>
                <Ionicons name="person-add" size={18} color={colors.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={T.bodyMedium}>Add &quot;{query.trim()}&quot; to Coconut</Text>
                <Text style={T.caption}>Create and split with them</Text>
              </View>
              <Ionicons name="add-circle" size={22} color={colors.blue} />
            </TouchableOpacity>
          )}

          {/* Friends */}
          {filteredFriends.length > 0 && (
            <View style={s.section}>
              <Text style={[T.label, s.sectionLabel]}>FRIENDS</Text>
              {filteredFriends.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={s.optionRow}
                  onPress={() => handlePickTarget({ type: "friend", key: f.key, name: f.displayName })}
                >
                  <View style={[s.avatar, { backgroundColor: hashColor(f.displayName) + "20" }]}>
                    <Text style={[s.avatarText, { color: hashColor(f.displayName) }]}>
                      {f.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[T.bodyMedium, { flex: 1 }]}>{f.displayName}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Groups */}
          {filteredGroups.length > 0 && (
            <View style={s.section}>
              <Text style={[T.label, s.sectionLabel]}>GROUPS</Text>
              {filteredGroups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={s.optionRow}
                  onPress={() => handlePickTarget({ type: "group", key: g.id, name: g.name })}
                >
                  <View style={[s.avatar, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="people" size={18} color={colors.primary} />
                  </View>
                  <Text style={[T.bodyMedium, { flex: 1 }]}>{g.name}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Add new when there ARE results too (at bottom) */}
          {!noMatches && q.length > 1 && (
            <TouchableOpacity style={[s.addNewRow, { marginTop: space.lg }]} onPress={startAddFriend}>
              <View style={[s.avatar, { backgroundColor: colors.blueBg }]}>
                <Ionicons name="person-add" size={18} color={colors.blue} />
              </View>
              <Text style={[T.bodyMedium, { flex: 1, color: colors.blue }]}>Add &quot;{query.trim()}&quot; to Coconut</Text>
              <Ionicons name="add-circle" size={22} color={colors.blue} />
            </TouchableOpacity>
          )}

          {/* Empty state when no contacts and not searching */}
          {!groupsLoading && !q && filteredFriends.length === 0 && filteredGroups.length === 0 && (
            <View style={{ alignItems: "center", paddingTop: space["2xl"], paddingHorizontal: space["3xl"] }}>
              <Text style={T.caption}>No contacts yet.</Text>
              <Text style={[T.caption, { marginTop: 4, textAlign: "center" }]}>
                Type a name above to add someone to Coconut.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Add new friend ──
  if (splitStep === "add-friend") {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.pickHeader}>
            <TouchableOpacity onPress={() => setSplitStep("pick")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={24} color={colors.textTertiary} />
            </TouchableOpacity>
            <Text style={T.bodySemibold}>Add friend</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.xl }}>
            <View style={s.confirmCard}>
              <Text style={T.label}>NAME</Text>
              <TextInput
                style={s.confirmInput}
                value={newFriendName}
                onChangeText={setNewFriendName}
                placeholder="Their name"
                placeholderTextColor={colors.textMuted}
                autoFocus
                maxLength={100}
              />
            </View>
            <View style={[s.confirmCard, { marginTop: space.lg }]}>
              <Text style={T.label}>EMAIL (OPTIONAL)</Text>
              <TextInput
                style={s.confirmInput}
                value={newFriendEmail}
                onChangeText={setNewFriendEmail}
                placeholder="their@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                maxLength={254}
              />
              <Text style={[T.caption, { marginTop: space.sm }]}>
                They&apos;ll be linked automatically when they join Coconut.
              </Text>
            </View>
            {error && <Text style={{ color: colors.red, fontFamily: font.medium, fontSize: fontSize.md, marginTop: space.lg, textAlign: "center" }}>{error}</Text>}
          </ScrollView>
          <View style={s.footer}>
            <TouchableOpacity
              style={[s.submitBtn, (!newFriendName.trim() || addingFriend) && { opacity: 0.5 }]}
              onPress={handleAddNewFriend}
              disabled={!newFriendName.trim() || addingFriend}
            >
              {addingFriend ? <ActivityIndicator color="#fff" /> : <Text style={T.button}>Add & continue →</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Confirm expense ──
  if (splitStep === "confirm" && currentTx && target) {
    const isSelf = target.type === "self";
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.pickHeader}>
            <TouchableOpacity onPress={() => setSplitStep("pick")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={24} color={colors.textTertiary} />
            </TouchableOpacity>
            <Text style={T.bodySemibold}>{isSelf ? "Confirm" : "Confirm split"}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.xl }}>
            {/* Who */}
            <View style={s.confirmCard}>
              <Text style={T.label}>{isSelf ? "FOR" : "SPLITTING WITH"}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.sm }}>
                <View style={[s.avatar, { backgroundColor: isSelf ? colors.primaryLight : hashColor(target.name) + "20" }]}>
                  {target.type === "group" ? (
                    <Ionicons name="people" size={18} color={colors.primary} />
                  ) : isSelf ? (
                    <Ionicons name="person" size={18} color={colors.primary} />
                  ) : (
                    <Text style={[s.avatarText, { color: hashColor(target.name) }]}>{target.name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <Text style={T.bodyMedium}>{target.name}</Text>
              </View>
            </View>

            {/* Description */}
            <View style={[s.confirmCard, { marginTop: space.lg }]}>
              <Text style={T.label}>DESCRIPTION</Text>
              <TextInput
                style={s.confirmInput}
                value={expenseDesc}
                onChangeText={setExpenseDesc}
                placeholder="What's this for?"
                placeholderTextColor={colors.textMuted}
                maxLength={500}
              />
            </View>

            {/* Amount */}
            <View style={[s.confirmCard, { marginTop: space.lg }]}>
              <Text style={T.label}>AMOUNT</Text>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: space.sm }}>
                <Text style={{ fontFamily: font.bold, fontSize: fontSize["3xl"], color: colors.textMuted, marginRight: 4 }}>$</Text>
                <TextInput
                  style={s.amountInput}
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  maxLength={20}
                />
              </View>
              {!isSelf && (
                <Text style={[T.caption, { marginTop: space.sm }]}>Paid by you, split equally</Text>
              )}
            </View>

            {error && (
              <Text style={{ fontFamily: font.medium, fontSize: fontSize.md, color: colors.red, marginTop: space.lg, textAlign: "center" }}>{error}</Text>
            )}
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity
              style={[s.submitBtn, (saving || !expenseAmount) && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={saving || !expenseAmount}
            >
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text style={T.button}>{isSelf ? "Done → next" : "Split & next →"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Card view ──
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Text style={T.heading}>Review</Text>
        <Text style={[T.caption, { marginTop: 2 }]}>{queue.length} transaction{queue.length === 1 ? "" : "s"} to review</Text>
      </View>

      <View style={s.cardArea}>
        {queue.length > 1 && <View style={s.bgCard} />}
        {currentTx && (
          <Animated.View
            style={[s.txCard, { transform: [{ translateX: pan.x }, { rotate }] }]}
            {...panResponder.panHandlers}
          >
            <View style={s.hintRow}>
              <Animated.View style={[s.hintBadge, { opacity: skipOpacity }]}>
                <Ionicons name="close" size={14} color={colors.red} />
                <Text style={[s.hintText, { color: colors.red }]}>Skip</Text>
              </Animated.View>
              <Animated.View style={[s.hintBadge, { opacity: splitOpacity }]}>
                <Text style={[s.hintText, { color: colors.primary }]}>Split</Text>
                <Ionicons name="arrow-redo" size={14} color={colors.primary} />
              </Animated.View>
            </View>

            <View style={s.txContent}>
              <MerchantLogo
                merchantName={currentTx.merchant}
                size={56}
                fallbackText={currentTx.merchant.charAt(0)}
                backgroundColor={hashColor(currentTx.merchant) + "18"}
                borderColor="transparent"
              />
              <Text style={[T.subheading, { marginTop: space.lg }]}>{currentTx.merchant}</Text>
              <Text style={[T.amountLg, { marginTop: space.sm }]}>{fmtCurrency(currentTx.amount)}</Text>
              <View style={s.metaRow}>
                <View style={[s.catBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[s.catText, { color: colors.primaryDark }]}>{currentTx.category}</Text>
                </View>
                <Text style={T.caption}>{currentTx.dateStr}</Text>
              </View>
            </View>
            <Text style={[T.caption, { textAlign: "center", marginTop: space.md }]}>{queue.indexOf(currentTx) + 1} of {queue.length}</Text>
          </Animated.View>
        )}
      </View>

      <View style={s.actions}>
        <TouchableOpacity style={s.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Ionicons name="close" size={28} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.splitBtn} onPress={handleSplitStart} activeOpacity={0.7}>
          <Ionicons name="arrow-redo" size={32} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={s.actionLabels}>
        <Text style={[T.caption, { width: 64, textAlign: "center" }]}>Skip</Text>
        <Text style={{ fontFamily: font.semibold, fontSize: fontSize.sm, color: colors.primary, width: 76, textAlign: "center" }}>Split</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, justifyContent: "center", alignItems: "center" },

  cardArea: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: space.xl },
  bgCard: { position: "absolute", width: SCREEN_WIDTH - space.xl * 2 - 16, height: 340, backgroundColor: colors.surface, borderRadius: radii["2xl"], ...shadow.sm, transform: [{ scale: 0.95 }, { translateY: 8 }] },
  txCard: { width: SCREEN_WIDTH - space.xl * 2, backgroundColor: colors.surface, borderRadius: radii["2xl"], padding: space.xl, ...shadow.lg, minHeight: 340 },
  hintRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: space.md },
  hintBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  hintText: { fontFamily: font.semibold, fontSize: fontSize.sm },
  txContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  merchantCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  merchantInitial: { fontFamily: font.bold, fontSize: fontSize["4xl"] },
  metaRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  catBadge: { paddingHorizontal: space.md, paddingVertical: 3, borderRadius: radii.full },
  catText: { fontFamily: font.semibold, fontSize: fontSize.xs },
  actions: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space["3xl"], paddingVertical: space.lg },
  skipBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center" },
  splitBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", ...shadow.colored(colors.primary) },
  actionLabels: { flexDirection: "row", justifyContent: "center", gap: space["3xl"] + 12, paddingBottom: space.lg },

  pickHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xl, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  txSummary: { alignItems: "center", paddingVertical: space.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.xl, marginTop: space.lg, marginBottom: space.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: fontSize.lg, color: colors.text, paddingVertical: 4 },
  section: { paddingHorizontal: space.xl },
  sectionLabel: { marginTop: space.lg, marginBottom: space.sm },
  optionRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  avatarText: { fontFamily: font.bold, fontSize: fontSize.lg },
  justMeRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.lg, paddingHorizontal: space.xl, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  addNewRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingHorizontal: space.xl },

  confirmCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: space.lg, ...shadow.sm },
  confirmInput: { fontFamily: font.medium, fontSize: fontSize["2xl"], color: colors.text, marginTop: space.sm, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  amountInput: { fontFamily: font.bold, fontSize: fontSize["5xl"], color: colors.text, flex: 1, paddingVertical: 0 },
  footer: { padding: space.xl, borderTopWidth: 1, borderTopColor: colors.borderLight },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: space.lg, alignItems: "center", ...shadow.colored(colors.primary) },
});
