import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  DeviceEventEmitter,
  Alert,
  Linking,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useApiFetch } from "../../lib/api";
import { useGroupsSummary } from "../../hooks/useGroups";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";
import { colors, font, radii, darkUI, prototype, shadow } from "../../lib/theme";
import { useToast } from "../../components/Toast";
import { haptic } from "../../components/ui";
import { sfx } from "../../lib/sounds";

type Target = { type: "group" | "friend"; key: string; name: string };
type SplitMethod = "equal" | "exact" | "percent" | "shares";

type GroupMember = {
  id: string;
  user_id: string | null;
  display_name: string;
  venmo_username?: string | null;
};

const ACCENT = ["#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#8B5CF6"];

const SPLITS: { key: SplitMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "equal", label: "Equal", icon: "git-compare-outline" },
  { key: "percent", label: "%", icon: "pie-chart-outline" },
  { key: "exact", label: "$", icon: "cash-outline" },
  { key: "shares", label: "Shares", icon: "layers-outline" },
];

function normalizeDesc(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function descriptionsSimilar(a: string, b: string): boolean {
  const A = normalizeDesc(a);
  const B = normalizeDesc(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const short = A.length < B.length ? A : B;
  const long = A.length < B.length ? B : A;
  return short.length >= 3 && long.includes(short);
}

function syntheticGroupIdFromFriendKey(key: string): string | null {
  if (key.startsWith("grp:")) return key.slice(4);
  if (key.startsWith("opt-")) return key.slice(4);
  if (key.startsWith("fb-")) return key.slice(3);
  return null;
}

function pickDemoGroupIdForFriend(
  friendKey: string,
  personDetails: Record<string, { email: string | null; displayName: string; settlements?: { groupId: string }[] }>,
  groupDetails: Record<string, { id: string; members: { email: string | null; display_name: string; user_id: string | null }[] }>
): string | null {
  const pd = personDetails[friendKey];
  if (!pd) return null;
  const fromSettlement = pd.settlements?.[0]?.groupId;
  if (fromSettlement && groupDetails[fromSettlement]) return fromSettlement;
  let best: { id: string; n: number } | null = null;
  for (const g of Object.values(groupDetails)) {
    const hasFriend = g.members.some((m) => m.email === pd.email || m.display_name === pd.displayName);
    const hasMe = g.members.some((m) => m.user_id === "me");
    if (hasFriend && hasMe) {
      const n = g.members.length;
      if (!best || n < best.n) best = { id: g.id, n };
    }
  }
  return best?.id ?? null;
}

/** Deduplicate members by user_id — keeps the entry with a real name over "You". */
function dedupeMembers(members: GroupMember[]): GroupMember[] {
  const seen = new Map<string, number>();
  const out: GroupMember[] = [];
  for (const m of members) {
    if (!m.user_id) { out.push(m); continue; }
    const prev = seen.get(m.user_id);
    if (prev == null) {
      seen.set(m.user_id, out.length);
      out.push({ ...m });
    } else {
      const kept = out[prev];
      if (kept.display_name === "You" && m.display_name !== "You") {
        kept.display_name = m.display_name;
      }
      if (!kept.venmo_username && m.venmo_username) kept.venmo_username = m.venmo_username;
    }
  }
  return out;
}

export default function AddExpenseScreen() {
  const nav = useRouter();
  const { prefillDesc, prefillAmount, prefillNonce, prefillPersonKey, prefillPersonName, prefillPersonType } = useLocalSearchParams<{
    prefillDesc?: string;
    prefillAmount?: string;
    prefillNonce?: string;
    prefillPersonKey?: string;
    prefillPersonName?: string;
    prefillPersonType?: string;
  }>();
  const { userId } = useAuth();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const toast = useToast();
  const { summary: realSummary, loading } = useGroupsSummary({ contacts: true });
  const summary = isDemoOn ? demo.summary : realSummary;

  // ── State ──
  const [targets, setTargets] = useState<Target[]>([]);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackGroups, setFallbackGroups] = useState<Array<{ id: string; name: string; memberCount: number; groupType?: string | null }>>([]);
  const [optimisticGroups, setOptimisticGroups] = useState<Array<{ id: string; name: string; memberCount: number; groupType?: string | null }>>([]);
  const [optimisticFriends, setOptimisticFriends] = useState<Array<{ key: string; displayName: string; balance: number }>>([]);
  const [resolving, setResolving] = useState(false);
  const [resolvedGroupId, setResolvedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [paidByMe, setPaidByMe] = useState(true);
  const [payerMemberId, setPayerMemberId] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState(false);
  const [splitExpanded, setSplitExpanded] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);

  // Add-friend modal
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newFriendName, setNewFriendName] = useState(query);
  const [newFriendEmail, setNewFriendEmail] = useState("");
  const [addingNewPerson, setAddingNewPerson] = useState(false);

  const lastPrefillNonce = useRef<string | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const descInputRef = useRef<TextInput>(null);
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);

  const resetForm = useCallback(() => {
    setTargets([]);
    setQuery("");
    setResolvedGroupId(null);
    setGroupMembers([]);
    setCustomSplits({});
    setDupWarning(false);
    setError(null);
    setPaidByMe(true);
    setPayerMemberId(null);
    setSplitMethod("equal");
    setSplitExpanded(false);
    setAmount("");
    setDescription("");
    setShowSettlement(false);
  }, []);

  // Reset form when screen gains focus without fresh prefill params
  useEffect(() => {
    if (isFocused && !prevFocused.current) {
      if (!prefillNonce || prefillNonce === lastPrefillNonce.current) {
        resetForm();
      }
    }
    prevFocused.current = isFocused;
  }, [isFocused, prefillNonce, resetForm]);

  // ── Prefill reset ──
  useEffect(() => {
    if (prefillNonce != null && prefillNonce !== "") {
      if (lastPrefillNonce.current !== prefillNonce) {
        lastPrefillNonce.current = prefillNonce;
        setQuery("");
        setResolvedGroupId(null);
        setGroupMembers([]);
        setCustomSplits({});
        setDupWarning(false);
        setError(null);
        setPaidByMe(true);
        setPayerMemberId(null);
        setSplitMethod("equal");
        setSplitExpanded(false);

        if (prefillPersonKey && prefillPersonName) {
          const type = (prefillPersonType === "group" ? "group" : "friend") as "group" | "friend";
          setTargets([{ type, key: prefillPersonKey, name: prefillPersonName }]);
        } else {
          setTargets([]);
        }
      }
    }
    if (prefillDesc !== undefined) {
      if (typeof prefillDesc === "string" && prefillDesc.length > 0) setDescription(prefillDesc);
      else setDescription("");
    }
    if (prefillAmount !== undefined) {
      if (typeof prefillAmount === "string" && prefillAmount.length > 0) {
        setAmount(prefillAmount.replace(/[^0-9.]/g, ""));
      } else {
        setAmount("");
      }
    }
  }, [prefillNonce, prefillDesc, prefillAmount, prefillPersonKey, prefillPersonName, prefillPersonType]);

  // ── Fallback groups fetch ──
  useEffect(() => {
    if (isDemoOn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/groups");
        if (!res.ok) return;
        const data = await res.json().catch(() => []);
        if (!cancelled && Array.isArray(data)) {
          setFallbackGroups(
            data.map((g: Record<string, unknown>) => ({
              id: String(g.id),
              name: String(g.name ?? "Group"),
              memberCount: Number(g.memberCount ?? 0),
              groupType: typeof g.groupType === "string" ? g.groupType : null,
            }))
          );
        }
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [apiFetch, isDemoOn]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`coconut.optimistic.friends.${userId}`);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as {
          groups?: Array<{ id: string; name: string; memberCount: number; groupType?: string | null }>;
          friends?: Array<{ key: string; displayName: string; balance: number }>;
        };
        if (Array.isArray(parsed.groups)) setOptimisticGroups(parsed.groups);
        if (Array.isArray(parsed.friends)) setOptimisticFriends(parsed.friends);
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Derived data ──
  const summaryFriends = summary?.friends ?? [];
  const summaryGroups = summary?.groups ?? [];
  const mergedFallbackGroups = [...optimisticGroups, ...fallbackGroups.filter((g) => !optimisticGroups.some((o) => o.id === g.id))];
  const fallbackFriendRows = mergedFallbackGroups
    .filter((g) => (g.groupType ?? "other") !== "home")
    .map((g) => ({ key: `grp:${g.id}`, displayName: g.name, balance: 0, balances: [] as { currency: string; amount: number }[] }));
  const fallbackGroupRows = mergedFallbackGroups.map((g) => ({
    id: g.id, name: g.name, memberCount: g.memberCount, myBalance: 0, myBalances: [], lastActivityAt: new Date().toISOString(),
  }));
  const mergedFallbackFriends = [
    ...optimisticFriends,
    ...fallbackFriendRows.filter((f) => !optimisticFriends.some((o) => o.displayName === f.displayName)),
  ];
  const friends = summaryFriends.length > 0
    ? [...summaryFriends, ...optimisticFriends.filter((o) => !summaryFriends.some((s) => s.displayName === o.displayName))]
    : mergedFallbackFriends;
  const groups = summaryGroups.length > 0 ? summaryGroups : fallbackGroupRows;
  const q = query.toLowerCase().trim();
  const filteredFriends = q ? friends.filter((f) => f.displayName.toLowerCase().includes(q)) : friends;
  const friendNameSet = new Set(friends.map((f) => f.displayName.trim().toLowerCase()));
  const visibleGroups = groups.filter((g) => {
    const groupName = g.name.trim().toLowerCase();
    if (g.memberCount <= 2 && friendNameSet.has(groupName)) return false;
    return true;
  });
  const filteredGroups = q ? visibleGroups.filter((g) => g.name.toLowerCase().includes(q)) : visibleGroups;
  const selectedKeys = new Set(targets.map((t) => t.key));
  const noMatches = q.length > 0 && filteredFriends.length === 0 && filteredGroups.length === 0;
  const showDropdown = searchFocused && (q.length > 0 || targets.length === 0);

  const myMemberId = useMemo(() => {
    const byAuth = groupMembers.find((m) => m.user_id && m.user_id === userId)?.id;
    if (byAuth) return byAuth;
    if (isDemoOn) {
      return groupMembers.find((m) => m.display_name === "You" || m.user_id === "me")?.id ?? groupMembers[0]?.id ?? null;
    }
    return null;
  }, [groupMembers, userId, isDemoOn]);

  const splitPeople = useMemo(() => groupMembers.map((m) => ({ key: m.id, name: m.display_name })), [groupMembers]);

  const total = parseFloat(amount) || 0;

  const shares = useMemo(() => {
    if (total <= 0 || splitPeople.length === 0) return splitPeople.map((p) => ({ ...p, share: 0 }));
    switch (splitMethod) {
      case "equal":
        return splitPeople.map((p) => ({ ...p, share: total / splitPeople.length }));
      case "exact":
        return splitPeople.map((p) => ({ ...p, share: parseFloat(customSplits[p.key] || "0") || 0 }));
      case "percent":
        return splitPeople.map((p) => ({ ...p, share: (total * (parseFloat(customSplits[p.key] || "0") || 0)) / 100 }));
      case "shares": {
        const sum = splitPeople.reduce((acc, p) => acc + (parseFloat(customSplits[p.key] || "1") || 1), 0);
        return splitPeople.map((p) => ({ ...p, share: (total * (parseFloat(customSplits[p.key] || "1") || 1)) / sum }));
      }
    }
  }, [splitPeople, total, splitMethod, customSplits]);

  const shareSum = shares.reduce((acc, p) => acc + p.share, 0);
  const splitValid = splitMethod === "equal" || Math.abs(shareSum - total) < 0.02;
  const canSave = total > 0 && targets.length > 0 && resolvedGroupId && !saving;

  // ── Payer display for the compact "Paid by" row ──
  const resolvedMeId = myMemberId ?? groupMembers[0]?.id ?? null;
  const payerDisplay = paidByMe
    ? "you"
    : groupMembers.find((m) => m.id === payerMemberId)?.display_name.split(" ")[0] ?? "…";
  const splitDisplay = splitMethod === "equal" ? "split equally" : splitMethod === "percent" ? "split by %" : splitMethod === "exact" ? "split by amount" : "split by shares";

  // ── Tap to Pay suggestion ──
  const tapToPaySuggestion = useMemo(() => {
    const effPayer = paidByMe ? (myMemberId ?? payerMemberId) : payerMemberId;
    if (!effPayer || !resolvedGroupId || groupMembers.length < 2) return null;
    const receiverMemberId = effPayer;
    const payerShare = shares.find((sh) => sh.key !== effPayer && sh.share > 0.001);
    if (!payerShare) return null;
    const amountOwed = Math.round(payerShare.share * 100) / 100;
    if (amountOwed <= 0) return null;
    return { amount: amountOwed, groupId: resolvedGroupId, payerMemberId: payerShare.key, receiverMemberId };
  }, [paidByMe, myMemberId, payerMemberId, resolvedGroupId, groupMembers.length, shares]);

  const venmoOther = useMemo(() => {
    return groupMembers.find((m) => m.id !== myMemberId && m.venmo_username);
  }, [groupMembers, myMemberId]);

  // ── Group resolution ──
  const loadGroupForTargets = useCallback(async (): Promise<boolean> => {
    const t = targets[0];
    if (!t) return false;
    setError(null);
    try {
      let gid: string | null = null;
      if (isDemoOn) {
        if (t.type === "group") {
          gid = t.key;
        } else {
          gid = pickDemoGroupIdForFriend(t.key, demo.personDetails, demo.groupDetails);
        }
        if (!gid || !demo.groupDetails[gid]) {
          setError("No shared group with this person in demo data");
          return false;
        }
        const gd = demo.groupDetails[gid];
        setResolvedGroupId(gid);
        setGroupMembers(dedupeMembers(
          gd.members.map((m) => ({ id: m.id, user_id: m.user_id, display_name: m.display_name, venmo_username: null }))
        ));
        setPayerMemberId(null);
        setPaidByMe(true);
        return true;
      }

      if (t.type === "group") {
        gid = t.key;
      } else {
        const res = await apiFetch(`/api/groups/person?key=${encodeURIComponent(t.key)}`);
        const data = await res.json();
        if (!res.ok) { setError("Could not load friend"); return false; }
        const sg = data.sharedGroups as { id: string; name: string; memberCount: number }[] | undefined;
        // Prefer a 1:1 (2-member) group so friend expenses don't land in trip/household groups
        const twoPersonGroup = sg?.find((g) => g.memberCount === 2);
        gid = twoPersonGroup?.id ?? null;

        if (!gid && sg && sg.length > 0) {
          // No dedicated 1:1 group — create one
          const friendName = data.displayName ?? t.name;
          const friendEmail = data.email ?? null;
          try {
            const groupRes = await apiFetch("/api/groups", {
              method: "POST",
              body: { name: friendName, ownerDisplayName: "You" } as object,
            });
            const group = await groupRes.json();
            if (groupRes.ok && group.id) {
              await apiFetch(`/api/groups/${group.id}/members`, {
                method: "POST",
                body: { displayName: friendName, ...(friendEmail ? { email: friendEmail } : {}) } as object,
              });
              gid = group.id;
            }
          } catch { /* fall through to existing group */ }
        }

        gid = gid ?? sg?.[0]?.id ?? (data.sharedGroupIds as string[] | undefined)?.[0] ?? null;
        if (!gid) { setError("No shared group with this person yet"); return false; }
      }
      setResolvedGroupId(gid);
      const gr = await apiFetch(`/api/groups/${gid}`);
      const gj = await gr.json();
      if (!gr.ok) { setError("Could not load group"); return false; }
      const members = dedupeMembers((gj.members ?? []) as GroupMember[]);
      setGroupMembers(members);
      setPayerMemberId(null);
      setPaidByMe(true);
      return true;
    } catch {
      setError("Network error");
      return false;
    }
  }, [apiFetch, targets, isDemoOn, demo.personDetails, demo.groupDetails]);

  // Auto-resolve group when a target is selected
  useEffect(() => {
    if (targets.length === 0) {
      setResolvedGroupId(null);
      setGroupMembers([]);
      return;
    }
    if (targets.length > 1) {
      Alert.alert("One at a time", "For now, split with one friend or one group per expense. Using the first one you selected.");
    }
    let cancelled = false;
    setResolving(true);
    loadGroupForTargets().finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [targets, loadGroupForTargets]);

  const startAddFriend = () => {
    setNewFriendName(query.trim());
    setNewFriendEmail("");
    setShowAddFriend(true);
  };

  const addNewFriend = async () => {
    const name = newFriendName.trim();
    const email = newFriendEmail.trim() || null;
    if (!name) return;
    setAddingNewPerson(true);
    try {
      const groupRes = await apiFetch("/api/groups", { method: "POST", body: { name, ownerDisplayName: "You" } as object });
      const group = await groupRes.json();
      if (!groupRes.ok || !group.id) { setError("Failed to create"); return; }
      await apiFetch(`/api/groups/${group.id}/members`, {
        method: "POST",
        body: { displayName: name, ...(email ? { email } : {}) } as object,
      });
      setShowAddFriend(false);
      setQuery("");
      selectTarget({ type: "group", key: group.id, name });
    } finally {
      setAddingNewPerson(false);
    }
  };

  const selectTarget = useCallback((t: Target) => {
    sfx.pop();
    setTargets([t]);
    setQuery("");
    setSearchFocused(false);
    setError(null);
  }, []);

  const removeTarget = useCallback(() => {
    setTargets([]);
    setResolvedGroupId(null);
    setGroupMembers([]);
    setCustomSplits({});
    setSplitExpanded(false);
  }, []);

  const pickSplit = useCallback(
    (m: SplitMethod) => {
      sfx.toggle();
      setSplitMethod(m);
      if (m === "equal") { setCustomSplits({}); return; }
      const init: Record<string, string> = {};
      splitPeople.forEach((p) => {
        if (m === "shares") init[p.key] = "1";
        else if (m === "percent") init[p.key] = (100 / splitPeople.length).toFixed(1);
        else init[p.key] = total > 0 ? (total / splitPeople.length).toFixed(2) : "0";
      });
      setCustomSplits(init);
    },
    [splitPeople, total]
  );

  const save = async () => {
    if (total <= 0 || !resolvedGroupId || !targets[0]) return;
    const t = targets[0];
    const desc = description.trim() || "Expense";
    const effPayer = paidByMe ? (myMemberId ?? groupMembers[0]?.id ?? null) : payerMemberId;
    if (!effPayer) { setError("Missing payer"); return; }
    if (!splitValid) {
      if (splitMethod === "percent") setError("Percents must add to 100%");
      else setError(`Amounts must add up to $${total.toFixed(2)}`);
      return;
    }

    // Duplicate check
    let warn = false;
    const descTrim = description.trim();
    if (resolvedGroupId && descTrim) {
      if (isDemoOn) {
        const act = demo.groupDetails[resolvedGroupId]?.activity ?? [];
        warn = act.some((row) => Math.abs(Number(row.amount) - total) < 0.02 && descriptionsSimilar(row.merchant, descTrim));
      } else {
        try {
          const gr = await apiFetch(`/api/groups/${resolvedGroupId}`);
          const gj = await gr.json();
          if (gr.ok && Array.isArray(gj.activity)) {
            warn = gj.activity.some(
              (row: { merchant: string; amount: number }) =>
                Math.abs(Number(row.amount) - total) < 0.02 && descriptionsSimilar(row.merchant, descTrim)
            );
          }
        } catch { /* ignore */ }
      }
    }
    if (warn) {
      setDupWarning(true);
      sfx.warning();
      return;
    }

    await doSave();
  };

  const doSave = async () => {
    if (total <= 0 || !resolvedGroupId || !targets[0]) return;
    const t = targets[0];
    const desc = description.trim() || "Expense";
    const effPayer = paidByMe ? (myMemberId ?? groupMembers[0]?.id ?? null) : payerMemberId;
    if (!effPayer) return;

    if (isDemoOn) {
      demo.addExpense(total, desc, t.key, t.type);
      sfx.coin();
      toast.show(`Expense saved · $${total.toFixed(2)} with ${t.name}`);
      DeviceEventEmitter.emit("expense-added");
      DeviceEventEmitter.emit("groups-updated");
      setShowSettlement(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        amount: total,
        description: desc,
        groupId: resolvedGroupId,
        payerMemberId: effPayer,
      };
      if (splitMethod === "equal" && t.type === "friend") {
        body.personKey = t.key;
      } else if (splitMethod !== "equal") {
        body.shares = shares.filter((sh) => sh.share > 0.001).map((sh) => ({ memberId: sh.key, amount: Math.round(sh.share * 100) / 100 }));
      }
      const res = await apiFetch("/api/manual-expense", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        sfx.coin();
        toast.show(`Expense saved · $${total.toFixed(2)} with ${targets[0]?.name ?? "group"}`);
        DeviceEventEmitter.emit("expense-added");
        DeviceEventEmitter.emit("groups-updated");
        setShowSettlement(true);
      } else {
        setError(data?.error || "Failed to save");
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const goTapToPay = () => {
    sfx.paymentTap();
    const amountToCharge = tapToPaySuggestion?.amount ?? total;
    setShowSettlement(false);
    nav.push({
      pathname: "/(tabs)/pay",
      params: {
        amount: amountToCharge.toFixed(2),
        groupId: tapToPaySuggestion?.groupId ?? (resolvedGroupId ?? ""),
        payerMemberId: tapToPaySuggestion?.payerMemberId ?? "",
        receiverMemberId: tapToPaySuggestion?.receiverMemberId ?? "",
      },
    });
  };

  const openVenmo = () => {
    const u = venmoOther?.venmo_username?.replace(/^@/, "");
    if (!u) { Alert.alert("No Venmo on file", "Ask them to add Venmo in group settings."); return; }
    const note = encodeURIComponent(description.trim() || "Coconut split");
    const amt = total.toFixed(2);
    Linking.openURL(`https://venmo.com/${u}?amount=${amt}&note=${note}`).catch(() => Alert.alert("Could not open Venmo"));
  };

  const dismissSettlement = () => {
    resetForm();
    nav.replace("/(tabs)");
  };

  // Auto-dismiss settlement after 10s
  useEffect(() => {
    if (!showSettlement) return;
    const timer = setTimeout(dismissSettlement, 10000);
    return () => clearTimeout(timer);
  }, [showSettlement]);

  // ── Loading state ──
  if (loading && !summary) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Main single-screen render ──
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => nav.replace("/(tabs)")} hitSlop={12} style={s.headerSide}>
            <Ionicons name="close" size={22} color={darkUI.labelSecondary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add an expense</Text>
          <TouchableOpacity
            onPress={save}
            disabled={!canSave}
            hitSlop={12}
            style={s.headerSide}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[s.headerSave, !canSave && { opacity: 0.35 }]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Person bar ── */}
          <View style={s.personBar}>
            <Text style={s.personLabel}>With you and:</Text>
            {targets.map((t, i) => (
              <TouchableOpacity key={t.key} style={s.personChip} onPress={removeTarget}>
                <View style={[s.personChipDot, { backgroundColor: ACCENT[i % ACCENT.length] }]} />
                <Text style={s.personChipTxt}>{t.name}</Text>
                <Ionicons name="close" size={12} color={darkUI.labelMuted} />
              </TouchableOpacity>
            ))}
            <TextInput
              ref={searchInputRef}
              style={s.personInput}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setSearchFocused(true)}
              placeholder={targets.length === 0 ? "Name or group" : ""}
              placeholderTextColor={darkUI.labelMuted}
              autoCorrect={false}
            />
          </View>

          {/* ── Search dropdown ── */}
          {showDropdown && (
            <View style={s.dropdown}>
              {noMatches && (
                <TouchableOpacity style={s.dropRow} onPress={startAddFriend}>
                  <Ionicons name="person-add" size={18} color={colors.primary} />
                  <Text style={s.dropRowAddTxt}>Add &quot;{query.trim()}&quot;</Text>
                </TouchableOpacity>
              )}
              {filteredFriends.slice(0, 8).map((f, i) => {
                const groupBackedId = syntheticGroupIdFromFriendKey(f.key);
                const isGroupBackedFriend = !!groupBackedId;
                const targetKey = isGroupBackedFriend ? groupBackedId : f.key;
                const on = selectedKeys.has(targetKey);
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[s.dropRow, on && { backgroundColor: "rgba(31,35,40,0.06)" }]}
                    onPress={() => selectTarget({ type: isGroupBackedFriend ? "group" : "friend", key: targetKey, name: f.displayName })}
                  >
                    <View style={[s.dropAv, { backgroundColor: ACCENT[i % ACCENT.length] }]}>
                      <Text style={s.dropAvTxt}>{f.displayName.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <Text style={s.dropRowName}>{f.displayName}</Text>
                  </TouchableOpacity>
                );
              })}
              {filteredGroups.slice(0, 5).map((g) => {
                const on = selectedKeys.has(g.id);
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[s.dropRow, on && { backgroundColor: "rgba(31,35,40,0.06)" }]}
                    onPress={() => selectTarget({ type: "group", key: g.id, name: g.name })}
                  >
                    <View style={s.dropGrp}>
                      <Ionicons name="people" size={14} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.dropRowName}>{g.name}</Text>
                      <Text style={s.dropRowMeta}>{g.memberCount} members</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {!noMatches && q.length > 1 && (
                <TouchableOpacity style={s.dropRow} onPress={startAddFriend}>
                  <Ionicons name="person-add" size={18} color={colors.primary} />
                  <Text style={s.dropRowAddTxt}>Add &quot;{query.trim()}&quot; as friend</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {resolving && (
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}

          {/* ── Form (visible once target selected) ── */}
          {targets.length > 0 && !resolving && resolvedGroupId && (
            <>
              {/* Description */}
              <View style={s.fieldRow}>
                <Ionicons name="document-text-outline" size={20} color={darkUI.labelMuted} />
                <TextInput
                  ref={descInputRef}
                  style={s.fieldInput}
                  value={description}
                  onChangeText={(t) => { setDescription(t); setError(null); }}
                  placeholder="Enter a description"
                  placeholderTextColor={darkUI.labelMuted}
                  returnKeyType="next"
                />
              </View>

              {/* Amount */}
              <View style={s.fieldRow}>
                <Text style={s.currencyLabel}>$</Text>
                <TextInput
                  style={[s.fieldInput, s.amountInput]}
                  value={amount}
                  onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, "")); setError(null); }}
                  placeholder="0.00"
                  placeholderTextColor={darkUI.labelMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>

              {/* Split summary (tappable) */}
              <TouchableOpacity style={s.splitSummary} onPress={() => setSplitExpanded((v) => !v)} activeOpacity={0.7}>
                <Text style={s.splitSummaryTxt}>
                  Paid by {payerDisplay} and {splitDisplay}
                </Text>
                <Ionicons name={splitExpanded ? "chevron-up" : "chevron-down"} size={16} color={darkUI.labelMuted} />
              </TouchableOpacity>

              {/* Expanded split options */}
              {splitExpanded && (
                <View style={s.splitPanel}>
                  <Text style={s.secLabel}>Paid by</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.paidByRow}>
                    {groupMembers.map((m, mi) => {
                      const isMe = resolvedMeId != null && m.id === resolvedMeId;
                      const selected = paidByMe ? isMe : payerMemberId === m.id;
                      const hue = ACCENT[mi % ACCENT.length];
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[s.paidByChip, selected && { borderColor: `${colors.primary}99`, backgroundColor: "rgba(31,35,40,0.10)" }]}
                          onPress={() => {
                            setError(null);
                            if (isMe) { setPaidByMe(true); setPayerMemberId(null); }
                            else { setPaidByMe(false); setPayerMemberId(m.id); }
                          }}
                          activeOpacity={0.85}
                        >
                          <View style={[s.paidByChipAv, { backgroundColor: `${hue}44` }]}>
                            <Text style={[s.paidByChipIni, { color: hue }]}>{m.display_name.slice(0, 2).toUpperCase()}</Text>
                          </View>
                          <Text style={[s.paidByChipTxt, selected && { color: colors.primary, fontFamily: font.bold }]} numberOfLines={1}>
                            {isMe ? "You" : m.display_name.split(" ")[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Text style={[s.secLabel, { marginTop: 8 }]}>Split</Text>
                  <View style={s.splitSegWrap}>
                    {SPLITS.map((o) => (
                      <TouchableOpacity key={o.key} style={[s.splitSegBtn, splitMethod === o.key && s.splitSegBtnOn]} onPress={() => pickSplit(o.key)}>
                        <Ionicons name={o.icon} size={13} color={splitMethod === o.key ? darkUI.label : darkUI.labelMuted} />
                        <Text style={[s.splitSegLbl, splitMethod === o.key && { color: darkUI.label, fontFamily: font.bold }]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {splitMethod === "equal" && total > 0 && (
                    <Text style={s.eqHint}>${(total / Math.max(splitPeople.length, 1)).toFixed(2)} each · {splitPeople.length} people</Text>
                  )}

                  {splitMethod !== "equal" && (
                    <View style={s.bkCard}>
                      {splitPeople.map((p, i) => (
                        <View key={p.key} style={[s.bkRow, i < splitPeople.length - 1 && s.bkBorder]}>
                          <Text style={s.bkName} numberOfLines={1}>{p.name}</Text>
                          <View style={s.bkInWrap}>
                            {splitMethod === "exact" && <Text style={s.bkPre}>$</Text>}
                            <TextInput
                              style={s.bkIn}
                              value={customSplits[p.key] ?? ""}
                              onChangeText={(v) => setCustomSplits((prev) => ({ ...prev, [p.key]: v.replace(/[^0-9.]/g, "") }))}
                              keyboardType="decimal-pad"
                              placeholder={splitMethod === "shares" ? "1" : "0"}
                              placeholderTextColor={darkUI.labelMuted}
                            />
                            {splitMethod === "percent" ? <Text style={s.bkSuf}>%</Text> : null}
                          </View>
                          <Text style={s.bkShareAmt}>${shares.find((x) => x.key === p.key)?.share.toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Dup warning */}
              {dupWarning && (
                <View style={s.dupBanner}>
                  <Ionicons name="warning-outline" size={20} color={prototype.amber} />
                  <Text style={s.dupText}>You may have already added something similar. Check Shared if this is a duplicate.</Text>
                  <TouchableOpacity onPress={() => { setDupWarning(false); void doSave(); }} style={s.dupSaveAnyway}>
                    <Text style={s.dupSaveAnywayTxt}>Save anyway</Text>
                  </TouchableOpacity>
                </View>
              )}

              {error ? <Text style={s.err}>{error}</Text> : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Add friend modal ── */}
      {showAddFriend && (
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Add friend</Text>
              <TouchableOpacity onPress={() => setShowAddFriend(false)}>
                <Ionicons name="close" size={22} color={darkUI.labelMuted} />
              </TouchableOpacity>
            </View>
            <TextInput style={s.modalIn} value={newFriendName} onChangeText={setNewFriendName} placeholder="Name" placeholderTextColor={darkUI.labelMuted} />
            <TextInput
              style={[s.modalIn, { marginTop: 10 }]}
              value={newFriendEmail}
              onChangeText={setNewFriendEmail}
              placeholder="Email (optional)"
              placeholderTextColor={darkUI.labelMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 16 }, (!newFriendName.trim() || addingNewPerson) && { opacity: 0.5 }]}
              onPress={addNewFriend}
              disabled={!newFriendName.trim() || addingNewPerson}
            >
              {addingNewPerson ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Add & select</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Settlement sheet ── */}
      <Modal visible={showSettlement} transparent animationType="slide" onRequestClose={dismissSettlement}>
        <Pressable style={s.sheetOverlay} onPress={dismissSettlement}>
          <Pressable style={s.sheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Ionicons name="checkmark-circle" size={36} color="#3A7D44" />
              <Text style={s.sheetTitle}>Expense saved</Text>
              <Text style={s.sheetSub}>
                ${total.toFixed(2)} · {description.trim() || "Expense"} · {targets[0]?.name}
              </Text>
            </View>

            <Text style={s.sheetHint}>Collect payment</Text>

            <TouchableOpacity style={s.sheetBtn} onPress={goTapToPay} activeOpacity={0.85}>
              <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
              <Text style={s.sheetBtnTxt}>Tap to Pay</Text>
              {tapToPaySuggestion && (
                <Text style={s.sheetBtnAmt}>${tapToPaySuggestion.amount.toFixed(2)}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sheetBtnOutline, !venmoOther && { opacity: 0.4 }]}
              onPress={openVenmo}
              disabled={!venmoOther}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-usd" size={18} color={darkUI.label} />
              <Text style={s.sheetBtnOutlineTxt}>{venmoOther ? "Request with Venmo" : "Venmo not linked"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sheetBtnOutline, { opacity: 0.4 }]}
              disabled
              activeOpacity={0.85}
            >
              <Ionicons name="logo-paypal" size={18} color={darkUI.label} />
              <Text style={s.sheetBtnOutlineTxt}>PayPal (coming soon)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.sheetDone} onPress={dismissSettlement}>
              <Text style={s.sheetDoneTxt}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkUI.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: darkUI.bg },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  headerSide: { width: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: font.black, color: darkUI.label, textAlign: "center" },
  headerSave: { fontSize: 16, fontFamily: font.bold, color: colors.primary },

  body: { paddingHorizontal: 20, paddingBottom: 40 },

  // Person bar
  personBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: darkUI.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: darkUI.stroke,
    marginBottom: 4,
  },
  personLabel: { fontSize: 14, fontFamily: font.medium, color: darkUI.labelMuted },
  personChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: darkUI.bgElevated,
    borderWidth: 1,
    borderColor: darkUI.stroke,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  personChipDot: { width: 8, height: 8, borderRadius: 4 },
  personChipTxt: { fontFamily: font.semibold, fontSize: 13, color: darkUI.label },
  personInput: { flex: 1, minWidth: 80, fontSize: 15, fontFamily: font.regular, color: darkUI.label, paddingVertical: 4 },

  // Dropdown
  dropdown: {
    backgroundColor: darkUI.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: darkUI.stroke,
    marginBottom: 8,
    maxHeight: 280,
    overflow: "hidden",
  },
  dropRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  dropAv: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dropAvTxt: { color: "#fff", fontFamily: font.bold, fontSize: 11 },
  dropGrp: { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(31,35,40,0.08)", alignItems: "center", justifyContent: "center" },
  dropRowName: { flex: 1, fontSize: 15, fontFamily: font.semibold, color: darkUI.label },
  dropRowMeta: { fontSize: 12, fontFamily: font.regular, color: darkUI.labelMuted },
  dropRowAddTxt: { fontFamily: font.semibold, fontSize: 15, color: colors.primary },

  // Form fields
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: darkUI.sep,
  },
  fieldInput: { flex: 1, fontSize: 17, fontFamily: font.regular, color: darkUI.label },
  currencyLabel: { fontSize: 17, fontFamily: font.semibold, color: darkUI.labelSecondary },
  amountInput: { fontSize: 22, fontFamily: font.bold },

  // Split summary (compact row)
  splitSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkUI.stroke,
    backgroundColor: darkUI.card,
  },
  splitSummaryTxt: { fontSize: 14, fontFamily: font.medium, color: darkUI.labelSecondary },

  // Expanded split panel
  splitPanel: { marginTop: 12, paddingTop: 4 },
  secLabel: { fontSize: 11, fontFamily: font.extrabold, color: darkUI.labelMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  paidByRow: { flexDirection: "row", gap: 8, paddingBottom: 12, paddingRight: 8 },
  paidByChip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1, borderColor: darkUI.stroke, backgroundColor: "transparent", maxWidth: 200,
  },
  paidByChipAv: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  paidByChipIni: { fontSize: 9, fontFamily: font.bold },
  paidByChipTxt: { fontSize: 13, fontFamily: font.medium, color: darkUI.labelMuted },
  splitSegWrap: { flexDirection: "row", backgroundColor: darkUI.bg, borderRadius: 12, padding: 3, gap: 3, marginBottom: 12 },
  splitSegBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 9, borderRadius: 10 },
  splitSegBtnOn: { backgroundColor: darkUI.cardElevated, ...shadow.sm },
  splitSegLbl: { fontSize: 11, fontFamily: font.bold, color: darkUI.labelMuted },
  eqHint: { textAlign: "center", fontFamily: font.bold, fontSize: 14, color: colors.primary, marginBottom: 16 },
  bkCard: { backgroundColor: darkUI.card, borderRadius: radii.lg, padding: 12, borderWidth: 1, borderColor: darkUI.stroke },
  bkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8 },
  bkBorder: { borderBottomWidth: 1, borderBottomColor: darkUI.stroke },
  bkName: { width: 100, fontFamily: font.semibold, fontSize: 14, color: darkUI.label },
  bkInWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: darkUI.bgElevated, borderRadius: radii.sm, paddingHorizontal: 8, borderWidth: 1, borderColor: darkUI.stroke },
  bkPre: { fontSize: 13, color: darkUI.labelMuted, fontFamily: font.semibold },
  bkSuf: { fontSize: 12, color: darkUI.labelMuted },
  bkIn: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: darkUI.label, paddingVertical: 8 },
  bkShareAmt: { width: 64, fontFamily: font.black, fontSize: 14, color: colors.primary, textAlign: "right" },

  // Dup warning
  dupBanner: { flexDirection: "row", flexWrap: "wrap", gap: 10, backgroundColor: "rgba(251,191,36,0.12)", borderWidth: 1, borderColor: "rgba(251,191,36,0.4)", borderRadius: radii.lg, padding: 12, marginTop: 16 },
  dupText: { flex: 1, fontSize: 13, fontFamily: font.regular, color: darkUI.labelSecondary, lineHeight: 18 },
  dupSaveAnyway: { marginTop: 6, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: prototype.amber },
  dupSaveAnywayTxt: { fontSize: 13, fontFamily: font.bold, color: "#fff" },

  err: { fontFamily: font.medium, fontSize: 13, color: darkUI.moneyOut, marginTop: 8, textAlign: "center" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: radii.lg,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 16, color: "#fff" },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 24, zIndex: 20 },
  modalCard: { backgroundColor: darkUI.card, borderRadius: radii["2xl"], padding: 20, borderWidth: 1, borderColor: darkUI.stroke },
  modalHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { fontFamily: font.bold, fontSize: 18, color: darkUI.label },
  modalIn: { backgroundColor: darkUI.bgElevated, borderWidth: 1, borderColor: darkUI.stroke, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: font.regular, color: darkUI.label },

  // Settlement sheet
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheetCard: { backgroundColor: darkUI.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: darkUI.sep, alignSelf: "center", marginTop: 10, marginBottom: 16 },
  sheetHeader: { alignItems: "center", marginBottom: 20 },
  sheetTitle: { fontFamily: font.black, fontSize: 22, color: darkUI.label, marginTop: 10 },
  sheetSub: { fontFamily: font.regular, fontSize: 14, color: darkUI.labelSecondary, marginTop: 6, textAlign: "center" },
  sheetHint: { fontFamily: font.extrabold, fontSize: 11, color: darkUI.labelMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  sheetBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: radii.lg, marginBottom: 10,
  },
  sheetBtnTxt: { fontFamily: font.bold, fontSize: 16, color: "#fff" },
  sheetBtnAmt: { fontFamily: font.regular, fontSize: 14, color: "rgba(255,255,255,0.7)" },
  sheetBtnOutline: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: radii.lg, borderWidth: 1, borderColor: darkUI.stroke,
    backgroundColor: darkUI.card, marginBottom: 10,
  },
  sheetBtnOutlineTxt: { fontFamily: font.bold, fontSize: 15, color: darkUI.label },
  sheetDone: { alignItems: "center", marginTop: 8, paddingVertical: 12 },
  sheetDoneTxt: { fontFamily: font.semibold, fontSize: 15, color: darkUI.labelSecondary },
});
