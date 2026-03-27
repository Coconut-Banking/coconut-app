import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  DeviceEventEmitter,
  Alert,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useApiFetch } from "../../lib/api";
import { useGroupsSummary } from "../../hooks/useGroups";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";
import { colors, font, radii, darkUI, prototype, shadow } from "../../lib/theme";

type Target = { type: "group" | "friend"; key: string; name: string };
type SplitMethod = "equal" | "exact" | "percent" | "shares";
/** People first → amount & description → split → confirm (bank prefills land on amount step). */
type FlowStep = "amount" | "people" | "review" | "done";

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

const FLOW_ORDER: Exclude<FlowStep, "done">[] = ["people", "amount", "review"];

const STEP_TITLES: Record<Exclude<FlowStep, "done">, string> = {
  people: "Who was there?",
  amount: "Add expense",
  review: "Summary",
};

function FlowHandle() {
  return (
    <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 6 }}>
      <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: darkUI.sep }} />
    </View>
  );
}

function ProgressDots({ active }: { active: Exclude<FlowStep, "done"> }) {
  const idx = FLOW_ORDER.indexOf(active);
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 6 }}>
      {FLOW_ORDER.map((s, i) => {
        const done = i < idx;
        const on = i === idx;
        return (
          <View
            key={s}
            style={{
              width: on ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: on || done ? colors.primary : darkUI.stroke,
              opacity: done ? 0.55 : 1,
            }}
          />
        );
      })}
    </View>
  );
}

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

export default function AddExpenseScreen() {
  const nav = useRouter();
  const { prefillDesc, prefillAmount, prefillNonce } = useLocalSearchParams<{
    prefillDesc?: string;
    prefillAmount?: string;
    /** New value each navigation — clears stale people / group from a prior add-expense visit. */
    prefillNonce?: string;
  }>();
  const { userId } = useAuth();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { summary: realSummary, loading } = useGroupsSummary({ contacts: true });
  const summary = isDemoOn ? demo.summary : realSummary;

  const [step, setStep] = useState<FlowStep>("people");
  const [targets, setTargets] = useState<Target[]>([]);
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [recurring, setRecurring] = useState<"none" | "weekly" | "biweekly" | "monthly">("none");
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

  const lastPrefillNonce = useRef<string | null>(null);

  const numpadPress = useCallback((k: string) => {
    setError(null);
    if (k === "⌫") {
      setAmount((a) => a.slice(0, -1));
      return;
    }
    if (k === "." && amount.includes(".")) return;
    if (amount.includes(".") && (amount.split(".")[1]?.length ?? 0) >= 2) return;
    if (k !== "." && amount === "0") {
      setAmount(k);
      return;
    }
    setAmount((a) => a + k);
  }, [amount]);

  useEffect(() => {
    if (prefillNonce != null && prefillNonce !== "") {
      if (lastPrefillNonce.current !== prefillNonce) {
        lastPrefillNonce.current = prefillNonce;
        setTargets([]);
        setQuery("");
        setResolvedGroupId(null);
        setGroupMembers([]);
        setCustomSplits({});
        setDupWarning(false);
        setError(null);
        setStep("people");
        setPaidByMe(true);
        setPayerMemberId(null);
        setSplitMethod("equal");
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
  }, [prefillNonce, prefillDesc, prefillAmount]);
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
            data.map((g) => ({
              id: String(g.id),
              name: String(g.name ?? "Group"),
              memberCount: Number(g.memberCount ?? 0),
              groupType: typeof g.groupType === "string" ? g.groupType : null,
            }))
          );
        }
      } catch {
        // keep summary-only behavior when fallback fails
      }
    })();
    return () => {
      cancelled = true;
    };
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
      } catch {
        // best effort only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const summaryFriends = summary?.friends ?? [];
  const summaryGroups = summary?.groups ?? [];
  const mergedFallbackGroups = [...optimisticGroups, ...fallbackGroups.filter((g) => !optimisticGroups.some((o) => o.id === g.id))];
  const fallbackFriendRows = mergedFallbackGroups
    .filter((g) => (g.groupType ?? "other") !== "home")
    .map((g) => ({
      key: `grp:${g.id}`,
      displayName: g.name,
      balance: 0,
      balances: [] as { currency: string; amount: number }[],
    }));
  const fallbackGroupRows = mergedFallbackGroups.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g.memberCount,
    myBalance: 0,
    myBalances: [],
    lastActivityAt: new Date().toISOString(),
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
    // Friend records are backed by 2-member groups internally.
    // Hide duplicate rows in the Groups section.
    if (g.memberCount <= 2 && friendNameSet.has(groupName)) return false;
    return true;
  });
  const filteredGroups = q ? visibleGroups.filter((g) => g.name.toLowerCase().includes(q)) : visibleGroups;
  const selectedKeys = new Set(targets.map((t) => t.key));
  const noMatches = q.length > 0 && filteredFriends.length === 0 && filteredGroups.length === 0;

  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newFriendName, setNewFriendName] = useState(query);
  const [newFriendEmail, setNewFriendEmail] = useState("");
  const [addingNewPerson, setAddingNewPerson] = useState(false);

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
        return splitPeople.map((p) => ({
          ...p,
          share: (total * (parseFloat(customSplits[p.key] || "0") || 0)) / 100,
        }));
      case "shares": {
        const sum = splitPeople.reduce((s, p) => s + (parseFloat(customSplits[p.key] || "1") || 1), 0);
        return splitPeople.map((p) => ({
          ...p,
          share: (total * (parseFloat(customSplits[p.key] || "1") || 1)) / sum,
        }));
      }
    }
  }, [splitPeople, total, splitMethod, customSplits]);

  const shareSum = shares.reduce((s, p) => s + p.share, 0);
  const splitValid = splitMethod === "equal" || Math.abs(shareSum - total) < 0.02;

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
        setGroupMembers(
          gd.members.map((m) => ({
            id: m.id,
            user_id: m.user_id,
            display_name: m.display_name,
            venmo_username: null,
          }))
        );
        setPayerMemberId(null);
        setPaidByMe(true);
        return true;
      }

      if (t.type === "group") {
        gid = t.key;
      } else {
        const res = await apiFetch(`/api/groups/person?key=${encodeURIComponent(t.key)}`);
        const data = await res.json();
        if (!res.ok) {
          setError("Could not load friend");
          return false;
        }
        const sg = data.sharedGroups as { id: string; memberCount: number }[] | undefined;
        gid = sg?.[0]?.id ?? (data.sharedGroupIds as string[] | undefined)?.[0] ?? null;
        if (!gid) {
          setError("No shared group with this person yet");
          return false;
        }
      }
      setResolvedGroupId(gid);
      const gr = await apiFetch(`/api/groups/${gid}`);
      const gj = await gr.json();
      if (!gr.ok) {
        setError("Could not load group");
        return false;
      }
      const members = (gj.members ?? []) as GroupMember[];
      setGroupMembers(members);
      setPayerMemberId(null);
      setPaidByMe(true);
      return true;
    } catch {
      setError("Network error");
      return false;
    }
  }, [apiFetch, targets, isDemoOn, demo.personDetails, demo.groupDetails]);

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
      if (!groupRes.ok || !group.id) {
        setError("Failed to create");
        return;
      }
      const memberRes = await apiFetch(`/api/groups/${group.id}/members`, {
        method: "POST",
        body: { displayName: name, ...(email ? { email } : {}) } as object,
      });
      const memberData = await memberRes.json().catch(() => null);
      if (!memberRes.ok) {
        setError(memberData?.error || "Failed to add friend");
        return;
      }
      setShowAddFriend(false);
      // Clear active search after creating/selecting a new person.
      setQuery("");
      toggle({ type: "group", key: group.id, name });
    } finally {
      setAddingNewPerson(false);
    }
  };

  const toggle = useCallback((t: Target) => {
    setTargets((prev) => {
      if (prev.some((x) => x.key === t.key)) return prev.filter((x) => x.key !== t.key);
      return [...prev, t];
    });
    setQuery("");
    setError(null);
  }, []);

  const removeChip = useCallback((key: string) => {
    setTargets((prev) => prev.filter((x) => x.key !== key));
    setCustomSplits((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  }, []);

  const goFromPeople = async () => {
    if (targets.length === 0) {
      setError("Pick at least one friend or group");
      return;
    }
    if (targets.length > 1) {
      Alert.alert("One at a time", "For now, split with one friend or one group per expense. Using the first one you selected.");
    }
    setResolving(true);
    const ok = await loadGroupForTargets();
    setResolving(false);
    if (!ok) return;
    setError(null);
    setStep("amount");
  };

  const goFromAmount = async () => {
    if (total <= 0) {
      setError("Enter a valid amount");
      return;
    }
    await checkDuplicateAndGoReview();
  };

  const pickSplit = useCallback(
    (m: SplitMethod) => {
      setSplitMethod(m);
      if (m === "equal") {
        setCustomSplits({});
        return;
      }
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

  const checkDuplicateAndGoReview = async () => {
    if (!paidByMe && !payerMemberId) {
      setError("Choose who paid");
      return;
    }
    if (!splitValid) {
      if (splitMethod === "percent") setError("Percents must add to 100%");
      else setError(`Amounts must add up to $${total.toFixed(2)}`);
      return;
    }
    setError(null);
    let warn = false;
    const descTrim = description.trim();
    if (resolvedGroupId && descTrim) {
      if (isDemoOn) {
        const act = demo.groupDetails[resolvedGroupId]?.activity ?? [];
        warn = act.some(
          (row) => Math.abs(Number(row.amount) - total) < 0.02 && descriptionsSimilar(row.merchant, descTrim)
        );
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
        } catch {
          /* ignore */
        }
      }
    }
    setDupWarning(warn);
    setStep("review");
  };

  const save = async () => {
    if (total <= 0 || !resolvedGroupId || !targets[0]) return;
    const t = targets[0];
    const desc = description.trim() || "Expense";
    const effPayer = paidByMe ? (myMemberId ?? groupMembers[0]?.id ?? null) : payerMemberId;
    if (!effPayer) {
      setError("Missing payer");
      return;
    }

    if (isDemoOn) {
      demo.addExpense(total, desc, t.key, t.type);
      setStep("done");
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
        recurringFrequency: recurring !== "none" ? recurring : undefined,
      };

      if (splitMethod === "equal" && t.type === "friend") {
        body.personKey = t.key;
      } else if (splitMethod !== "equal") {
        body.shares = shares
          .filter((s) => s.share > 0.001)
          .map((s) => ({ memberId: s.key, amount: Math.round(s.share * 100) / 100 }));
      }

      const res = await apiFetch("/api/manual-expense", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        DeviceEventEmitter.emit("expense-added");
        setStep("done");
      } else {
        setError(data?.error || "Failed to save");
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const venmoOther = useMemo(() => {
    return groupMembers.find((m) => m.id !== myMemberId && m.venmo_username);
  }, [groupMembers, myMemberId]);

  const openVenmo = () => {
    const u = venmoOther?.venmo_username?.replace(/^@/, "");
    if (!u) {
      Alert.alert("No Venmo on file", "Ask them to add Venmo in group settings.");
      return;
    }
    const note = encodeURIComponent(description.trim() || "Coconut split");
    const amt = total.toFixed(2);
    Linking.openURL(`https://venmo.com/${u}?amount=${amt}&note=${note}`).catch(() => {
      Alert.alert("Could not open Venmo");
    });
  };

  const tapToPaySuggestion = useMemo(() => {
    const effPayer = paidByMe ? (myMemberId ?? payerMemberId) : payerMemberId;
    if (!effPayer || !resolvedGroupId || groupMembers.length < 2) return null;
    const receiverMemberId = effPayer;
    const payerShare = shares.find((s) => s.key !== effPayer && s.share > 0.001);
    if (!payerShare) return null;
    const amountOwed = Math.round(payerShare.share * 100) / 100;
    if (amountOwed <= 0) return null;
    return {
      amount: amountOwed,
      groupId: resolvedGroupId,
      payerMemberId: payerShare.key,
      receiverMemberId,
    };
  }, [paidByMe, myMemberId, payerMemberId, resolvedGroupId, groupMembers.length, shares]);

  const goTapToPay = () => {
    const amountToCharge = tapToPaySuggestion?.amount ?? total;
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

  if (loading && !summary) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Done: settle / pay options ──
  if (step === "done") {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.doneWrap}>
          <View style={s.doneIcon}>
            <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
          </View>
          <Text style={s.doneTitle}>Expense saved</Text>
          <Text style={s.doneSub}>
            ${total.toFixed(2)} · {description || "Expense"} · {targets[0]?.name}
          </Text>
          <Text style={s.doneHint}>
            Collect or record payment
            {tapToPaySuggestion ? ` · Tap to Pay charges $${tapToPaySuggestion.amount.toFixed(2)}` : ""}
          </Text>

          <TouchableOpacity style={s.primaryBtn} onPress={goTapToPay} activeOpacity={0.9}>
            <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
            <Text style={s.primaryBtnText}>Tap to Pay</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.secondaryBtn, !venmoOther && { opacity: 0.45 }]}
            onPress={openVenmo}
            disabled={!venmoOther}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-usd" size={18} color={darkUI.label} />
            <Text style={s.secondaryBtnText}>{venmoOther ? "Request with Venmo" : "Venmo not linked"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.ghostBtn}
            onPress={() => {
              nav.replace("/(tabs)/shared");
            }}
          >
            <Ionicons name="people" size={18} color={darkUI.labelSecondary} />
            <Text style={s.ghostBtnText}>View in Shared</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setStep("people");
              setTargets([]);
              setAmount("");
              setDescription("");
              setResolvedGroupId(null);
              setGroupMembers([]);
              setDupWarning(false);
              setError(null);
            }}
            style={{ marginTop: 16 }}
          >
            <Text style={s.linkText}>Add another expense</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Review (prototype Summary) ──
  if (step === "review") {
    const descLine = description.trim() || "Expense";
    const payerName = paidByMe ? "You" : groupMembers.find((m) => m.id === payerMemberId)?.display_name ?? "—";
    return (
      <SafeAreaView style={s.root}>
        <FlowHandle />
        <ProgressDots active="review" />
        <View style={s.flowHead}>
          <TouchableOpacity onPress={() => setStep("amount")} hitSlop={12} style={s.flowHeadSide}>
            <Ionicons name="chevron-back" size={22} color={darkUI.labelSecondary} />
          </TouchableOpacity>
          <Text style={s.flowTitle}>{STEP_TITLES.review}</Text>
          <TouchableOpacity onPress={() => nav.replace("/(tabs)")} hitSlop={12} style={s.flowHeadSide}>
            <Ionicons name="close" size={22} color={darkUI.labelSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.padScroll} keyboardShouldPersistTaps="handled">
          {dupWarning && (
            <View style={s.dupBanner}>
              <Ionicons name="warning-outline" size={20} color={prototype.amber} />
              <Text style={s.dupText}>You may have already added something similar (same amount & name). Check Shared if this is a duplicate.</Text>
            </View>
          )}
          <View style={s.summaryHero}>
            <Text style={s.summaryHeroMeta}>{descLine}</Text>
            <Text style={s.summaryHeroAmt}>${total.toFixed(2)}</Text>
            <Text style={s.summaryHeroSub}>
              Paid by {payerName} · split {splitPeople.length} ways · {targets.map((x) => x.name).join(", ")}
            </Text>
          </View>
          {error ? <Text style={s.err}>{error}</Text> : null}
          <TouchableOpacity style={[s.primaryBtn, { marginTop: 20 }, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Save expense</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Amount + split (combined) ──
  if (step === "amount") {
    const displayAmt = amount.length > 0 ? amount : "0";
    const numKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;
    const resolvedMeId = myMemberId ?? groupMembers[0]?.id ?? null;
    const payer = groupMembers.find((m) => m.id === payerMemberId);
    const payerDisplay = paidByMe
      ? groupMembers.find((m) => m.id === resolvedMeId)?.display_name ?? "You"
      : payer?.display_name ?? "";
    return (
      <SafeAreaView style={s.root}>
        <FlowHandle />
        <ProgressDots active="amount" />
        <View style={s.flowHead}>
          <TouchableOpacity onPress={() => setStep("people")} hitSlop={12} style={s.flowHeadSide}>
            <Ionicons name="chevron-back" size={22} color={darkUI.labelSecondary} />
          </TouchableOpacity>
          <Text style={s.flowTitle}>{STEP_TITLES.amount}</Text>
          <TouchableOpacity onPress={() => nav.replace("/(tabs)")} hitSlop={12} style={s.flowHeadSide}>
            <Ionicons name="close" size={22} color={darkUI.labelSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.amountBody} keyboardShouldPersistTaps="handled">
          <Text style={s.secLabel}>Splitting with</Text>
          <View style={[s.reviewCard, { marginBottom: 12 }]}>
            <View style={s.chipRowCompact}>
              {targets.map((t, i) => (
                <View key={t.key} style={s.chipCompact}>
                  <View style={[s.chipDot, { backgroundColor: ACCENT[i % ACCENT.length] }]} />
                  <Text style={s.chipTxt}>{t.name}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={s.amtHero}>
            <Text style={s.amtHowMuch}>How much?</Text>
            <View style={s.amtRow}>
              <Text style={s.amtDollar}>$</Text>
              <Text style={[s.amtBig, total <= 0 && !amount.includes(".") && { color: darkUI.labelMuted }]} numberOfLines={1}>
                {displayAmt}
              </Text>
            </View>
            <Text style={[s.secLabel, { marginBottom: 6, marginTop: 8 }]}>What was it for?</Text>
            <TextInput
              style={s.titleInput}
              value={description}
              onChangeText={(t) => {
                setDescription(t);
                setError(null);
              }}
              placeholder="Groceries, dinner, Uber..."
              placeholderTextColor={darkUI.labelMuted}
              returnKeyType="done"
            />
          </View>
          <View style={s.numpad}>
            {numKeys.map((k) => (
              <TouchableOpacity key={k} style={s.numpadKey} onPress={() => numpadPress(k)} activeOpacity={0.75}>
                <Text style={[s.numpadKeyTxt, k === "⌫" && { fontSize: 20 }]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.secLabel, { marginTop: 16 }]}>Paid by</Text>
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
                    if (isMe) {
                      setPaidByMe(true);
                      setPayerMemberId(null);
                    } else {
                      setPaidByMe(false);
                      setPayerMemberId(m.id);
                    }
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

          {!paidByMe && payerDisplay ? (
            <View style={s.payerHint}>
              <Text style={s.payerHintEmoji}>💡</Text>
              <Text style={s.payerHintTxt}>{payerDisplay} paid — everyone owes them</Text>
            </View>
          ) : null}

          <Text style={[s.secLabel, { marginTop: 8 }]}>Split</Text>
          <View style={s.splitSegWrap}>
            {SPLITS.map((o) => (
              <TouchableOpacity
                key={o.key}
                style={[s.splitSegBtn, splitMethod === o.key && s.splitSegBtnOn]}
                onPress={() => pickSplit(o.key)}
              >
                <Ionicons name={o.icon} size={13} color={splitMethod === o.key ? darkUI.label : darkUI.labelMuted} />
                <Text style={[s.splitSegLbl, splitMethod === o.key && { color: darkUI.label, fontFamily: font.bold }]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {splitMethod === "equal" && total > 0 && (
            <Text style={s.eqHint}>
              ${(total / Math.max(splitPeople.length, 1)).toFixed(2)} each · {splitPeople.length} people
            </Text>
          )}
          {splitMethod === "percent" && (
            <Text style={[s.splitHint, !splitValid && { color: prototype.amber }]}>
              {splitValid ? "✓ 100% assigned" : "Percents must total 100%"}
            </Text>
          )}
          {splitMethod === "exact" && (
            <Text style={[s.splitHint, !splitValid && { color: prototype.amber }]}>
              {splitValid ? "✓ Amounts add up" : `Must total $${total.toFixed(2)}`}
            </Text>
          )}

          {splitMethod !== "equal" && (
            <View style={s.bkCard}>
              {splitPeople.map((p, i) => (
                <View key={p.key} style={[s.bkRow, i < splitPeople.length - 1 && s.bkBorder]}>
                  <Text style={s.bkName} numberOfLines={1}>
                    {p.name}
                  </Text>
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

          <View style={s.recurBlock}>
            <Text style={s.secLabel}>Repeat</Text>
            <View style={s.recurRow}>
              {(["none", "weekly", "biweekly", "monthly"] as const).map((val) => (
                <TouchableOpacity key={val} style={[s.recurChip, recurring === val && s.recurChipOn]} onPress={() => setRecurring(val)}>
                  <Text style={[s.recurTxt, recurring === val && { color: "#fff", fontFamily: font.bold }]}>
                    {val === "none" ? "Off" : val === "weekly" ? "Weekly" : val === "biweekly" ? "Bi-weekly" : "Monthly"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {error ? <Text style={s.err}>{error}</Text> : null}
          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 8 }, total <= 0 && { opacity: 0.45 }]}
            onPress={() => void goFromAmount()}
            disabled={total <= 0}
          >
            <Text style={s.primaryBtnText}>Review summary →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── People (prototype PeopleStep) — first step: no back, only close ──
  const nSel = targets.length;
  return (
    <SafeAreaView style={s.root}>
      <FlowHandle />
      <ProgressDots active="people" />
      <View style={s.flowHead}>
        <View style={s.flowHeadSide} />
        <Text style={s.flowTitle}>{STEP_TITLES.people}</Text>
        <TouchableOpacity onPress={() => nav.replace("/(tabs)")} hitSlop={12} style={s.flowHeadSide}>
          <Ionicons name="close" size={22} color={darkUI.labelSecondary} />
        </TouchableOpacity>
      </View>

      {targets.length > 0 && (
        <View style={s.chipRow}>
          {targets.map((t, i) => (
            <TouchableOpacity key={t.key} style={s.chip} onPress={() => removeChip(t.key)}>
              <View style={[s.chipDot, { backgroundColor: ACCENT[i % ACCENT.length] }]} />
              <Text style={s.chipTxt}>{t.name}</Text>
              <Ionicons name="close" size={14} color={darkUI.labelMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}

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

      <View style={s.searchBox}>
        <Ionicons name="search" size={18} color={darkUI.labelMuted} />
        <TextInput style={s.searchIn} value={query} onChangeText={setQuery} placeholder="Search friends or groups" placeholderTextColor={darkUI.labelMuted} />
        {!!q && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={18} color={darkUI.labelMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {noMatches && (
          <TouchableOpacity style={s.addNew} onPress={startAddFriend}>
            <Ionicons name="person-add" size={20} color={colors.primary} />
            <Text style={s.addNewTxt}>Add &quot;{query.trim()}&quot;</Text>
          </TouchableOpacity>
        )}
        {filteredFriends.length > 0 && <Text style={s.secLabel}>Friends</Text>}
        {filteredFriends.map((f, i) => {
          const groupBackedId = syntheticGroupIdFromFriendKey(f.key);
          const isGroupBackedFriend = !!groupBackedId;
          const targetKey = isGroupBackedFriend ? groupBackedId : f.key;
          const on = selectedKeys.has(targetKey);
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.row, on && s.rowOn]}
              onPress={() => toggle({ type: isGroupBackedFriend ? "group" : "friend", key: targetKey, name: f.displayName })}
            >
              <View style={[s.av, { backgroundColor: ACCENT[i % ACCENT.length] }]}>
                <Text style={s.avTxt}>{f.displayName.slice(0, 2).toUpperCase()}</Text>
              </View>
              <Text style={s.rowName}>{f.displayName}</Text>
              <View style={[s.check, on && s.checkOn]}>{on && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
            </TouchableOpacity>
          );
        })}
        {filteredGroups.length > 0 && <Text style={[s.secLabel, { marginTop: 16 }]}>Groups</Text>}
        {filteredGroups.map((g) => {
          const on = selectedKeys.has(g.id);
          return (
            <TouchableOpacity key={g.id} style={[s.row, on && s.rowOn]} onPress={() => toggle({ type: "group", key: g.id, name: g.name })}>
              <View style={s.grIcon}>
                <Ionicons name="people" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{g.name}</Text>
                <Text style={s.rowMeta}>{g.memberCount} members</Text>
              </View>
              <View style={[s.check, on && s.checkOn]}>{on && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
            </TouchableOpacity>
          );
        })}
        {!noMatches && q.length > 1 && (
          <TouchableOpacity style={[s.addNew, { marginTop: 12 }]} onPress={startAddFriend}>
            <Ionicons name="person-add" size={20} color={colors.primary} />
            <Text style={s.addNewTxt}>Add &quot;{query.trim()}&quot; as friend</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <TouchableOpacity
        style={[s.primaryBtn, s.peopleFooterBtn, (nSel === 0 || resolving) && { opacity: 0.4 }]}
        onPress={goFromPeople}
        disabled={nSel === 0 || resolving}
      >
        {resolving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.primaryBtnText}>
            {nSel === 0 ? "Select someone →" : "Continue →"}
          </Text>
        )}
      </TouchableOpacity>
      {error ? <Text style={[s.err, { paddingHorizontal: 20 }]}>{error}</Text> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkUI.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: darkUI.bg },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  barTitle: { fontSize: 17, fontFamily: font.bold, color: darkUI.label },
  nextPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii["2xl"] },
  nextPillText: { color: "#fff", fontFamily: font.bold, fontSize: 14 },

  flowHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  flowHeadSide: { width: 40, alignItems: "center", justifyContent: "center" },
  flowTitle: { flex: 1, fontSize: 17, fontFamily: font.black, color: darkUI.label, textAlign: "center" },

  amountBody: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 4 },
  amtHero: { alignItems: "center", paddingTop: 4, paddingBottom: 16 },
  amtHowMuch: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: darkUI.labelMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  amtBig: {
    fontSize: 56,
    fontFamily: font.black,
    color: darkUI.label,
    letterSpacing: -3,
    lineHeight: 62,
    minWidth: 40,
    textAlign: "center",
  },
  amtDesc: {
    marginTop: 14,
    fontSize: 15,
    fontFamily: font.regular,
    color: darkUI.labelSecondary,
    textAlign: "center",
    width: "100%",
    paddingVertical: 8,
  },
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 4,
  },
  numpadKey: {
    width: "31%",
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkUI.stroke,
    backgroundColor: darkUI.cardElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  numpadKeyTxt: { fontSize: 22, fontFamily: font.semibold, color: darkUI.label },

  summaryHero: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(31,35,40,0.06)",
    borderWidth: 1,
    borderColor: "#E3DBD8",
    marginBottom: 8,
    ...shadow.sm,
  },
  summaryHeroMeta: { fontSize: 13, fontFamily: font.medium, color: darkUI.labelMuted, marginBottom: 4 },
  summaryHeroAmt: {
    fontSize: 30,
    fontFamily: font.black,
    color: colors.primary,
    letterSpacing: -1,
    marginBottom: 6,
  },
  summaryHeroSub: { fontSize: 12, fontFamily: font.regular, color: darkUI.labelSecondary, lineHeight: 17 },

  paidByRow: { flexDirection: "row", gap: 8, paddingBottom: 12, paddingRight: 8 },
  paidByChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: darkUI.stroke,
    backgroundColor: "transparent",
    maxWidth: 200,
  },
  paidByChipAv: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  paidByChipIni: { fontSize: 9, fontFamily: font.bold },
  paidByChipTxt: { fontSize: 13, fontFamily: font.medium, color: darkUI.labelMuted },

  payerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: prototype.amberBg,
    borderWidth: 1,
    borderColor: `${prototype.amber}44`,
    marginBottom: 14,
  },
  payerHintEmoji: { fontSize: 16 },
  payerHintTxt: { flex: 1, fontSize: 12, fontFamily: font.medium, color: prototype.amber },

  splitSegWrap: {
    flexDirection: "row",
    backgroundColor: darkUI.bg,
    borderRadius: 12,
    padding: 3,
    gap: 3,
    marginBottom: 12,
  },
  splitSegBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
    borderRadius: 10,
  },
  splitSegBtnOn: { backgroundColor: darkUI.cardElevated, ...shadow.sm },
  splitSegLbl: { fontSize: 11, fontFamily: font.bold, color: darkUI.labelMuted },

  splitHint: { fontSize: 11, fontFamily: font.semibold, color: colors.primary, textAlign: "center", marginBottom: 10 },

  peopleFooterBtn: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${colors.primary}55`,
    ...shadow.sm,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: darkUI.card, borderWidth: 1, borderColor: darkUI.stroke, borderRadius: radii["2xl"], paddingHorizontal: 12, paddingVertical: 8 },
  chipRowCompact: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipCompact: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: darkUI.bgElevated, borderWidth: 1, borderColor: darkUI.stroke, borderRadius: radii["2xl"], paddingHorizontal: 10, paddingVertical: 7 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipTxt: { fontFamily: font.semibold, fontSize: 13, color: darkUI.label },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: darkUI.cardHover,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: darkUI.stroke,
  },
  searchIn: { flex: 1, fontFamily: font.regular, fontSize: 16, color: darkUI.label, paddingVertical: 10 },

  secLabel: { fontSize: 11, fontFamily: font.extrabold, color: darkUI.labelMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12, backgroundColor: darkUI.card, borderRadius: radii.lg, paddingHorizontal: 12, marginBottom: 6, borderWidth: 1, borderColor: darkUI.stroke },
  rowOn: { borderColor: colors.primary, backgroundColor: "rgba(31,35,40,0.08)" },
  av: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avTxt: { color: "#fff", fontFamily: font.bold, fontSize: 13 },
  grIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: "rgba(31,35,40,0.10)", alignItems: "center", justifyContent: "center" },
  rowName: { flex: 1, fontSize: 15, fontFamily: font.semibold, color: darkUI.label },
  rowMeta: { fontSize: 12, fontFamily: font.regular, color: darkUI.labelMuted },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: darkUI.stroke, alignItems: "center", justifyContent: "center" },
  checkOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  addNew: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  addNewTxt: { fontFamily: font.semibold, fontSize: 15, color: colors.primary },

  titleInput: {
    backgroundColor: darkUI.card,
    borderWidth: 1,
    borderColor: darkUI.stroke,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 18,
    fontFamily: font.semibold,
    color: darkUI.label,
  },
  contextHint: { marginTop: 12, fontFamily: font.regular, fontSize: 13, color: darkUI.labelSecondary },

  amtRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 4, paddingVertical: 4 },
  amtDollar: { fontSize: 28, color: darkUI.labelSecondary, marginTop: 8, fontFamily: font.regular },
  amtInput: { fontSize: 48, fontFamily: font.black, color: darkUI.label, minWidth: 40, letterSpacing: -1 },

  payerToggle: { flexDirection: "row", gap: 10, marginBottom: 16 },
  payerChip: { flex: 1, paddingVertical: 12, borderRadius: radii.lg, backgroundColor: darkUI.card, borderWidth: 1, borderColor: darkUI.stroke, alignItems: "center" },
  payerChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  payerChipTxt: { fontFamily: font.medium, fontSize: 14, color: darkUI.labelSecondary },
  payerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 14, backgroundColor: darkUI.card, borderRadius: radii.md, marginBottom: 6, borderWidth: 1, borderColor: darkUI.stroke },
  payerRowOn: { borderColor: colors.primary },
  payerRowTxt: { fontFamily: font.semibold, fontSize: 15, color: darkUI.label },

  splitRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  splitBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: radii.sm, backgroundColor: darkUI.card, borderWidth: 1, borderColor: darkUI.stroke },
  splitBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  splitLbl: { fontSize: 11, fontFamily: font.bold, color: darkUI.labelMuted },
  eqHint: { textAlign: "center", fontFamily: font.bold, fontSize: 14, color: colors.primary, marginBottom: 16 },
  bkCard: { backgroundColor: darkUI.card, borderRadius: radii.lg, padding: 12, borderWidth: 1, borderColor: darkUI.stroke },
  bkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8 },
  bkBorder: { borderBottomWidth: 1, borderBottomColor: darkUI.stroke },
  bkName: { width: 100, fontFamily: font.semibold, fontSize: 14, color: darkUI.label },
  bkInWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: darkUI.bgElevated, borderRadius: radii.sm, paddingHorizontal: 8, borderWidth: 1, borderColor: darkUI.stroke },
  bkPre: { fontSize: 13, color: darkUI.labelMuted, fontFamily: font.semibold },
  bkSuf: { fontSize: 12, color: darkUI.labelMuted },
  bkIn: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: darkUI.label, paddingVertical: 8 },
  bkShare: { width: 64, fontFamily: font.bold, fontSize: 13, color: darkUI.labelSecondary, textAlign: "right" },
  bkShareAmt: { width: 64, fontFamily: font.black, fontSize: 14, color: colors.primary, textAlign: "right" },

  recurBlock: { marginTop: 20 },
  recurRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recurChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii["2xl"], backgroundColor: darkUI.card, borderWidth: 1, borderColor: darkUI.stroke },
  recurChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  recurTxt: { fontSize: 12, fontFamily: font.bold, color: darkUI.labelMuted },

  dupBanner: { flexDirection: "row", gap: 10, backgroundColor: "rgba(251,191,36,0.12)", borderWidth: 1, borderColor: "rgba(251,191,36,0.4)", borderRadius: radii.lg, padding: 12, marginBottom: 16 },
  dupText: { flex: 1, fontSize: 13, fontFamily: font.regular, color: darkUI.labelSecondary, lineHeight: 18 },
  reviewCard: { backgroundColor: darkUI.card, borderRadius: radii.lg, padding: 16, borderWidth: 1, borderColor: darkUI.stroke },
  reviewLabel: { fontSize: 11, fontFamily: font.bold, color: darkUI.labelMuted, marginTop: 10, textTransform: "uppercase" },
  reviewVal: { fontSize: 16, fontFamily: font.semibold, color: darkUI.label },
  reviewAmt: { fontSize: 28, fontFamily: font.black, color: darkUI.label, marginTop: 4 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.lg,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 16, color: "#fff" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: darkUI.stroke,
    backgroundColor: darkUI.card,
  },
  secondaryBtnText: { fontFamily: font.bold, fontSize: 15, color: darkUI.label },
  ghostBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingVertical: 12 },
  ghostBtnText: { fontFamily: font.semibold, fontSize: 15, color: darkUI.labelSecondary },
  linkText: { fontFamily: font.semibold, fontSize: 14, color: colors.primary, textAlign: "center" },

  doneWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  doneIcon: { alignItems: "center", marginBottom: 16 },
  doneTitle: { fontFamily: font.black, fontSize: 24, color: darkUI.label, textAlign: "center" },
  doneSub: { fontFamily: font.regular, fontSize: 15, color: darkUI.labelSecondary, textAlign: "center", marginTop: 8, lineHeight: 22 },
  doneHint: { fontFamily: font.semibold, fontSize: 12, color: darkUI.labelMuted, textAlign: "center", marginTop: 20, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.6 },

  padScroll: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  err: { fontFamily: font.medium, fontSize: 13, color: darkUI.moneyOut, marginTop: 8, textAlign: "center" },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 24, zIndex: 20 },
  modalCard: { backgroundColor: darkUI.card, borderRadius: radii["2xl"], padding: 20, borderWidth: 1, borderColor: darkUI.stroke },
  modalHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { fontFamily: font.bold, fontSize: 18, color: darkUI.label },
  modalIn: { backgroundColor: darkUI.bgElevated, borderWidth: 1, borderColor: darkUI.stroke, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: font.regular, color: darkUI.label },
});
