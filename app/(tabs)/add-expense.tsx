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
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useApiFetch } from "../../lib/api";
import { useGroupsSummary } from "../../hooks/useGroups";
import { useDeviceContacts, type DeviceContact } from "../../hooks/useDeviceContacts";
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
  const { contacts: deviceContacts, permissionStatus: contactsPerm, requestAccess: requestContactsAccess } = useDeviceContacts();

  // ── State ──
  const [targets, setTargets] = useState<Target[]>([]);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
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

  // Step management (3-step flow)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showPaidByPicker, setShowPaidByPicker] = useState(false);
  const [showSplitMethodPicker, setShowSplitMethodPicker] = useState(false);
  const [showSplitDetail, setShowSplitDetail] = useState(false);

  // Add-friend modal
  const [retryCount, setRetryCount] = useState(0);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newFriendName, setNewFriendName] = useState(query);
  const [newFriendEmail, setNewFriendEmail] = useState("");
  const [addingNewPerson, setAddingNewPerson] = useState(false);

  const lastPrefillNonce = useRef<string | null>(null);
  const savedRef = useRef(false);
  const touchedSplitKeysRef = useRef<Set<string>>(new Set());
  const searchInputRef = useRef<TextInput>(null);
  const descInputRef = useRef<TextInput>(null);
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);

  const resetForm = useCallback(() => {
    setStep(1);
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
    setRetryCount(0);
    savedRef.current = false;
    touchedSplitKeysRef.current = new Set();
    setJustSaved(false);
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
          setStep(2);
        } else {
          setTargets([]);
          setStep(1);
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

  const filteredDeviceContacts = useMemo(() => {
    if (contactsPerm !== "granted" || !q) return [];
    const friendEmails = new Set(friends.map((f) => (f as { email?: string }).email?.toLowerCase()).filter(Boolean));
    const eligible = deviceContacts.filter((c) => {
      if (c.email && friendEmails.has(c.email.toLowerCase())) return false;
      return true;
    });
    return eligible
      .filter((c) => c.name.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false))
      .slice(0, 20);
  }, [deviceContacts, contactsPerm, friends, q]);

  const selectedKeys = new Set(targets.map((t) => t.key));
  const noApiMatches = q.length > 0 && filteredFriends.length === 0 && filteredGroups.length === 0;
  const noMatches = noApiMatches && filteredDeviceContacts.length === 0;
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

  // Use a ref so the async loader always reads the latest demo data without it being a dep
  const demoRef = useRef(demo);
  useEffect(() => { demoRef.current = demo; });

  // Auto-resolve group when a target is selected (stable deps only — no demo.* objects)
  useEffect(() => {
    if (targets.length === 0) {
      setResolvedGroupId(null);
      setGroupMembers([]);
      return;
    }
    if (targets.length > 1) {
      Alert.alert("One at a time", "For now, split with one friend or one group per expense. Using the first one you selected.");
    }

    const t = targets[0];
    if (!t) return;

    let cancelled = false;
    setError(null);
    setResolving(true);

    const load = async (attempt = 0) => {
      try {
        const d = demoRef.current;
        let gid: string | null = null;

        if (isDemoOn) {
          gid = t.type === "group" ? t.key : pickDemoGroupIdForFriend(t.key, d.personDetails, d.groupDetails);
          if (cancelled) return;
          if (!gid || !d.groupDetails[gid]) { setError("No shared group with this person in demo data"); setResolving(false); return; }
          const gd = d.groupDetails[gid];
          setResolvedGroupId(gid);
          setGroupMembers(dedupeMembers(gd.members.map((m) => ({ id: m.id, user_id: m.user_id, display_name: m.display_name, venmo_username: null }))));
          setPayerMemberId(null);
          setPaidByMe(true);
          if (!cancelled) setResolving(false);
          return;
        }

        if (t.type === "group") {
          gid = t.key;
        } else {
          const res = await apiFetch(`/api/groups/person?key=${encodeURIComponent(t.key)}`);
          const data = await res.json();
          if (cancelled) return;
          if (!res.ok) { if (!cancelled) { setError("Could not load friend"); setResolving(false); } return; }
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
              if (cancelled) return;
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
          if (!gid) { if (!cancelled) { setError("No shared group with this person yet"); setResolving(false); } return; }
        }

        if (cancelled) return;
        setResolvedGroupId(gid);
        const gr = await apiFetch(`/api/groups/${gid}`);
        const gj = await gr.json();
        if (cancelled) return;
        if (!gr.ok) {
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 800));
            if (!cancelled) load(1);
          } else {
            setError("Could not load group — tap Try again");
            setResolving(false);
          }
          return;
        }
        const members = dedupeMembers((gj.members ?? []) as GroupMember[]);
        setGroupMembers(members);
        setPayerMemberId(null);
        setPaidByMe(true);
        if (!cancelled) setResolving(false);
      } catch {
        if (cancelled) return;
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 800));
          if (!cancelled) load(1);
        } else {
          setError("Network error — tap Try again");
          setResolving(false);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, apiFetch, isDemoOn, retryCount]);

  const startAddFriend = (contact?: DeviceContact) => {
    setNewFriendName(contact?.name ?? query.trim());
    setNewFriendEmail(contact?.email ?? "");
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
    setStep(2);
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
      touchedSplitKeysRef.current = new Set(); // fresh edit session for new method
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
    if (savedRef.current) return;
    if (total <= 0 || !resolvedGroupId || !targets[0]) return;
    const t = targets[0];
    const desc = description.trim() || "Expense";
    const effPayer = paidByMe ? (myMemberId ?? groupMembers[0]?.id ?? null) : payerMemberId;
    if (!effPayer) return;

    if (isDemoOn) {
      savedRef.current = true;
      demo.addExpense(total, desc, t.key, t.type);
      sfx.coin();
      toast.show(`Expense saved · $${total.toFixed(2)} with ${t.name}`);
      DeviceEventEmitter.emit("expense-added");
      DeviceEventEmitter.emit("groups-updated");
      return;
    }

    setSaving(true);
    setError(null);
    savedRef.current = true;
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
      } else {
        savedRef.current = false;
        setError(data?.error || "Failed to save");
      }
    } catch {
      savedRef.current = false;
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

  // Only block the screen if we have zero data at all (first-ever load)
  const hasAnyData = summaryFriends.length > 0 || summaryGroups.length > 0 || fallbackGroups.length > 0 || optimisticGroups.length > 0;
  if (loading && !summary && !hasAnyData) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const GROUP_EMOJI_MAP: Record<string, string> = { home: "🏠", trip: "✈️", couple: "💑", other: "👥" };
  const canReview = total > 0 && description.trim().length > 0 && resolvedGroupId && splitValid;

  const oweList = (() => {
    const effPayer = paidByMe ? (myMemberId ?? groupMembers[0]?.id ?? null) : payerMemberId;
    if (!effPayer) return [];
    return shares.filter((sh) => sh.key !== effPayer && sh.share > 0.001).map((sh) => ({
      memberId: sh.key,
      displayName: sh.name,
      initials: sh.name.slice(0, 2).toUpperCase(),
      amount: Math.round(sh.share * 100) / 100,
    }));
  })();

  // ── 3-step render ──
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

        {/* ══════════ STEP 1: With whom? ══════════ */}
        {step === 1 && (
          <>
            <View style={s.header}>
              <TouchableOpacity onPress={() => nav.replace("/(tabs)")} hitSlop={12} style={s.headerSide}>
                <Ionicons name="close" size={22} color={darkUI.labelSecondary} />
              </TouchableOpacity>
              <Text style={s.headerTitle}>With whom?</Text>
              <View style={s.headerSide} />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              {/* Search */}
              <View style={s.searchBar}>
                <Ionicons name="search" size={16} color={darkUI.labelMuted} />
                <TextInput
                  ref={searchInputRef}
                  style={s.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Search name or group"
                  placeholderTextColor={darkUI.labelMuted}
                  autoCorrect={false}
                  maxLength={200}
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={darkUI.labelMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Inline loading shimmer when first fetch is in progress */}
              {loading && !summary && (
                <View style={{ alignItems: "center", paddingVertical: 32 }}>
                  <ActivityIndicator size="small" color={darkUI.labelMuted} />
                  <Text style={[s.listRowSub, { marginTop: 8 }]}>Loading your groups…</Text>
                </View>
              )}

              {/* Groups */}
              {filteredGroups.length > 0 && (
                <>
                  <Text style={s.secLabel}>Groups</Text>
                  <View style={s.listCard}>
                    {filteredGroups.map((g, i) => {
                      const emoji = GROUP_EMOJI_MAP[(g as { groupType?: string }).groupType ?? "other"] ?? "👥";
                      return (
                        <TouchableOpacity
                          key={g.id}
                          style={[s.listRow, i < filteredGroups.length - 1 && s.listRowBorder]}
                          onPress={() => selectTarget({ type: "group", key: g.id, name: g.name })}
                          activeOpacity={0.7}
                        >
                          <View style={s.groupEmoji}><Text style={{ fontSize: 20 }}>{emoji}</Text></View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.listRowTitle}>{g.name}</Text>
                            <Text style={s.listRowSub}>{g.memberCount} people</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={darkUI.labelMuted} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Friends */}
              {filteredFriends.length > 0 && (
                <>
                  <Text style={[s.secLabel, { marginTop: 16 }]}>Friends</Text>
                  <View style={s.listCard}>
                    {filteredFriends.map((f, i) => {
                      const groupBackedId = syntheticGroupIdFromFriendKey(f.key);
                      const isGroupBackedFriend = !!groupBackedId;
                      const targetKey = isGroupBackedFriend ? groupBackedId : f.key;
                      const on = selectedKeys.has(targetKey);
                      const hue = ACCENT[i % ACCENT.length];
                      return (
                        <TouchableOpacity
                          key={f.key}
                          style={[s.listRow, i < filteredFriends.length - 1 && s.listRowBorder]}
                          onPress={() => selectTarget({ type: isGroupBackedFriend ? "group" : "friend", key: targetKey, name: f.displayName })}
                          activeOpacity={0.7}
                        >
                          <View style={[s.friendAvatar, { backgroundColor: `${hue}22`, borderColor: `${hue}30` }]}>
                            <Text style={[s.friendAvatarTxt, { color: hue }]}>{f.displayName.slice(0, 2).toUpperCase()}</Text>
                          </View>
                          <Text style={[s.listRowTitle, { flex: 1 }]}>{f.displayName}</Text>
                          <View style={[s.radio, on && s.radioOn]}>
                            {on && <View style={s.radioDot} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Device contacts */}
              {contactsPerm === "granted" && filteredDeviceContacts.length > 0 && (
                <>
                  <Text style={[s.secLabel, { marginTop: 16 }]}>From your contacts</Text>
                  <View style={s.listCard}>
                    {filteredDeviceContacts.map((c, i) => (
                      <TouchableOpacity
                        key={`dc-${c.id}`}
                        style={[s.listRow, i < filteredDeviceContacts.length - 1 && s.listRowBorder]}
                        onPress={() => startAddFriend(c)}
                        activeOpacity={0.7}
                      >
                        <View style={[s.friendAvatar, { backgroundColor: "#8B5CF622", borderColor: "#8B5CF644" }]}>
                          <Text style={[s.friendAvatarTxt, { color: "#8B5CF6" }]}>{c.name.slice(0, 2).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.listRowTitle}>{c.name}</Text>
                          {c.email ? (
                            <Text style={s.listRowSub}>{c.email}</Text>
                          ) : c.phone ? (
                            <Text style={s.listRowSub}>{c.phone}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="person-add-outline" size={16} color={darkUI.labelMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {contactsPerm === "undetermined" && q.length > 0 && filteredFriends.length === 0 && (
                <TouchableOpacity style={[s.addFriendRow, { marginTop: 12 }]} onPress={requestContactsAccess}>
                  <Ionicons name="people-circle-outline" size={20} color={colors.primary} />
                  <Text style={s.addFriendTxt}>Search your contacts</Text>
                  <Ionicons name="chevron-forward" size={14} color={darkUI.labelMuted} />
                </TouchableOpacity>
              )}

              {noMatches && (
                <TouchableOpacity style={s.addFriendRow} onPress={() => startAddFriend()}>
                  <Ionicons name="person-add" size={18} color={colors.primary} />
                  <Text style={s.addFriendTxt}>Add &quot;{query.trim()}&quot; as friend</Text>
                </TouchableOpacity>
              )}
              {!noMatches && q.length > 1 && (
                <TouchableOpacity style={[s.addFriendRow, { marginTop: 12 }]} onPress={() => startAddFriend()}>
                  <Ionicons name="person-add" size={18} color={colors.primary} />
                  <Text style={s.addFriendTxt}>Add &quot;{query.trim()}&quot; as friend</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </>
        )}

        {/* ══════════ STEP 2: Enter details ══════════ */}
        {step === 2 && (
          <>
            <View style={s.header}>
              <TouchableOpacity onPress={() => { setStep(1); removeTarget(); }} hitSlop={12} style={s.headerSide}>
                <Ionicons name="chevron-back" size={22} color={darkUI.labelSecondary} />
              </TouchableOpacity>
              <Text style={s.headerTitle}>Enter details</Text>
              <View style={s.headerSide} />
            </View>

            {resolving ? (
              <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : error ? (
              <View style={s.center}>
                <Ionicons name="cloud-offline-outline" size={40} color={darkUI.labelMuted} />
                <Text style={[s.err, { marginTop: 12, marginBottom: 16 }]}>{error}</Text>
                <TouchableOpacity
                  style={s.primaryBtn}
                  onPress={() => { setError(null); setRetryCount((n) => n + 1); }}
                  activeOpacity={0.85}
                >
                  <Text style={s.primaryBtnText}>Try again</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setStep(1); removeTarget(); }} style={{ marginTop: 14 }}>
                  <Text style={[s.listRowSub, { color: colors.primary }]}>← Back to list</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
                {/* Description */}
                <Text style={s.secLabel}>Description</Text>
                <TextInput
                  ref={descInputRef}
                  style={s.textField}
                  value={description}
                  onChangeText={(t) => { setDescription(t); setError(null); }}
                  placeholder="What's this for?"
                  placeholderTextColor={darkUI.labelMuted}
                  returnKeyType="next"
                  maxLength={500}
                />

                {/* Amount */}
                <Text style={[s.secLabel, { marginTop: 16 }]}>Amount</Text>
                <View style={s.amountField}>
                  <Text style={s.amountPrefix}>$</Text>
                  <TextInput
                    style={s.amountFieldInput}
                    value={amount}
                    onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, "")); setError(null); }}
                    placeholder="0.00"
                    placeholderTextColor={darkUI.labelMuted}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    maxLength={20}
                  />
                </View>

                {/* Paid by + split method */}
                <View style={s.paidSplitRow}>
                  <Text style={s.paidSplitTxt}>Paid by </Text>
                  <TouchableOpacity style={s.paidSplitChip} onPress={() => setShowPaidByPicker(true)}>
                    <Text style={s.paidSplitChipTxt}>{payerDisplay}</Text>
                  </TouchableOpacity>
                  <Text style={s.paidSplitTxt}> and split </Text>
                  <TouchableOpacity style={s.paidSplitChip} onPress={() => setShowSplitMethodPicker(true)}>
                    <Text style={s.paidSplitChipTxt}>{splitDisplay.replace("split ", "")}</Text>
                  </TouchableOpacity>
                </View>

                {total > 0 && splitPeople.length > 0 && splitMethod === "equal" && (
                  <Text style={s.eqHint}>${(total / splitPeople.length).toFixed(2)} per person</Text>
                )}

                {error ? <Text style={s.err}>{error}</Text> : null}
              </ScrollView>
            )}

            {!resolving && !error && (
              <View style={s.footer}>
                <TouchableOpacity
                  style={[s.primaryBtn, !canReview && { opacity: 0.5 }]}
                  onPress={() => canReview && setStep(3)}
                  disabled={!canReview}
                  activeOpacity={0.85}
                >
                  <Text style={s.primaryBtnText}>Review summary →</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ══════════ STEP 3: Summary ══════════ */}
        {step === 3 && (
          <>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setStep(2)} hitSlop={12} style={s.headerSide}>
                <Ionicons name="chevron-back" size={22} color={darkUI.labelSecondary} />
              </TouchableOpacity>
              <Text style={s.headerTitle}>Summary</Text>
              <TouchableOpacity onPress={() => nav.replace("/(tabs)")} hitSlop={12} style={s.headerSide}>
                <Ionicons name="close" size={22} color={darkUI.labelSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
              {/* Expense card */}
              <View style={s.expenseCard}>
                <Text style={s.expenseCardLabel}>Expense</Text>
                <Text style={s.expenseCardAmount}>${total.toFixed(2)}</Text>
                <Text style={s.expenseCardDesc}>{description.trim() || "Expense"}</Text>
                <Text style={s.expenseCardMeta}>
                  Paid by {payerDisplay === "you" ? "You" : payerDisplay} · {splitPeople.length} people
                </Text>
              </View>

              {/* They owe you */}
              {oweList.length > 0 && (
                <>
                  <Text style={[s.secLabel, { marginTop: 20 }]}>They owe you</Text>
                  <View style={s.listCard}>
                    {oweList.map((person, i) => {
                      const hue = ACCENT[i % ACCENT.length];
                      return (
                        <View key={person.memberId} style={[s.oweRow, i < oweList.length - 1 && s.listRowBorder]}>
                          <View style={s.oweTop}>
                            <View style={[s.friendAvatar, { backgroundColor: `${hue}22`, borderColor: `${hue}30` }]}>
                              <Text style={[s.friendAvatarTxt, { color: hue }]}>{person.initials}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.listRowTitle}>{person.displayName}</Text>
                              <Text style={s.listRowSub}>their share</Text>
                            </View>
                            <Text style={s.oweAmount}>${person.amount.toFixed(2)}</Text>
                          </View>
                          <TouchableOpacity
                            style={[s.tapToPayBtn, saving && { opacity: 0.5 }]}
                            disabled={saving}
                            onPress={() => {
                              const effPayer = paidByMe ? (myMemberId ?? groupMembers[0]?.id ?? null) : payerMemberId;
                              const goToPay = () => {
                                sfx.paymentTap();
                                resetForm();
                                nav.replace({
                                  pathname: "/(tabs)/pay",
                                  params: {
                                    amount: person.amount.toFixed(2),
                                    groupId: resolvedGroupId ?? "",
                                    payerMemberId: person.memberId,
                                    receiverMemberId: effPayer ?? "",
                                  },
                                });
                              };
                              if (savedRef.current) { goToPay(); return; }
                              save().then(() => { if (savedRef.current) goToPay(); });
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="phone-portrait-outline" size={14} color={darkUI.labelSecondary} />
                            <Text style={s.tapToPayBtnTxt}>Settle now with Tap to Pay</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Dup warning */}
              {dupWarning && (
                <View style={s.dupBanner}>
                  <Ionicons name="warning-outline" size={20} color={prototype.amber} />
                  <Text style={s.dupText}>You may have already added something similar.</Text>
                  <TouchableOpacity onPress={() => { setDupWarning(false); void doSave(); }} style={s.dupSaveAnyway}>
                    <Text style={s.dupSaveAnywayTxt}>Save anyway</Text>
                  </TouchableOpacity>
                </View>
              )}
              {error ? <Text style={s.err}>{error}</Text> : null}
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity
                style={[s.primaryBtnDark, (saving || justSaved) && { opacity: justSaved ? 1 : 0.6 }, justSaved && { backgroundColor: "#3A7D44" }]}
                onPress={async () => {
                  await save();
                  if (savedRef.current) {
                    setJustSaved(true);
                    setTimeout(() => {
                      resetForm();
                      nav.replace("/(tabs)");
                    }, 650);
                  }
                }}
                disabled={saving || justSaved}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : justSaved ? (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={s.primaryBtnText}>Saved!</Text>
                  </>
                ) : (
                  <Text style={s.primaryBtnText}>Done</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* ── Paid by picker ── */}
      <Modal visible={showPaidByPicker} transparent animationType="slide" onRequestClose={() => setShowPaidByPicker(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowPaidByPicker(false)}>
          <Pressable style={s.sheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <View style={s.pickerHead}>
              <Text style={s.pickerTitle}>Paid by</Text>
              <TouchableOpacity onPress={() => setShowPaidByPicker(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color={darkUI.labelMuted} />
              </TouchableOpacity>
            </View>
            <View style={s.listCard}>
              {groupMembers.map((m, mi) => {
                const isMe = resolvedMeId != null && m.id === resolvedMeId;
                const selected = paidByMe ? isMe : payerMemberId === m.id;
                const hue = ACCENT[mi % ACCENT.length];
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[s.listRow, mi < groupMembers.length - 1 && s.listRowBorder]}
                    onPress={() => {
                      if (isMe) { setPaidByMe(true); setPayerMemberId(null); }
                      else { setPaidByMe(false); setPayerMemberId(m.id); }
                      setShowPaidByPicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.friendAvatar, { backgroundColor: `${hue}22`, borderColor: `${hue}30` }]}>
                      <Text style={[s.friendAvatarTxt, { color: hue }]}>{m.display_name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <Text style={[s.listRowTitle, { flex: 1 }]}>{isMe ? "You" : m.display_name}</Text>
                    <View style={[s.radio, selected && s.radioOn]}>
                      {selected && <View style={s.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Split method picker ── */}
      <Modal visible={showSplitMethodPicker} transparent animationType="slide" onRequestClose={() => setShowSplitMethodPicker(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowSplitMethodPicker(false)}>
          <Pressable style={s.sheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <View style={s.pickerHead}>
              <Text style={s.pickerTitle}>Split method</Text>
              <TouchableOpacity onPress={() => setShowSplitMethodPicker(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color={darkUI.labelMuted} />
              </TouchableOpacity>
            </View>
            <View style={s.listCard}>
              {([
                { key: "equal" as SplitMethod, icon: "git-compare-outline" as const, title: "Split equally", desc: total > 0 && splitPeople.length > 0 ? `$${(total / splitPeople.length).toFixed(2)} each` : "Even split" },
                { key: "exact" as SplitMethod, icon: "cash-outline" as const, title: "Unequal amounts", desc: "Enter exact amounts" },
                { key: "percent" as SplitMethod, icon: "pie-chart-outline" as const, title: "By percentages", desc: "Split by % of total" },
                { key: "shares" as SplitMethod, icon: "layers-outline" as const, title: "By shares", desc: "Use ratio (e.g., 2:1:1)" },
              ]).map((opt, i) => {
                const selected = splitMethod === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.splitMethodRow, i < 3 && s.listRowBorder]}
                    onPress={() => {
                      pickSplit(opt.key);
                      setShowSplitMethodPicker(false);
                      if (opt.key !== "equal") setShowSplitDetail(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={s.splitMethodIcon}>
                      <Ionicons name={opt.icon} size={18} color={darkUI.labelSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.listRowTitle}>{opt.title}</Text>
                      <Text style={s.listRowSub}>{opt.desc}</Text>
                    </View>
                    <View style={[s.radio, selected && s.radioOn]}>
                      {selected && <View style={s.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Split detail ── */}
      <Modal visible={showSplitDetail} transparent animationType="slide" onRequestClose={() => setShowSplitDetail(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <Pressable style={s.sheetOverlay} onPress={() => setShowSplitDetail(false)}>
            <Pressable style={[s.sheetCard, { maxHeight: "85%" }]} onPress={(e) => e.stopPropagation()}>
              <View style={s.sheetHandle} />
              <View style={s.pickerHead}>
                <TouchableOpacity onPress={() => setShowSplitDetail(false)} hitSlop={12}>
                  <Ionicons name="chevron-back" size={20} color={darkUI.labelSecondary} />
                </TouchableOpacity>
                <Text style={[s.pickerTitle, { flex: 1, textAlign: "center" }]}>
                  {splitMethod === "exact" ? "By amounts" : splitMethod === "percent" ? "By percentages" : "By shares"}
                </Text>
                <TouchableOpacity onPress={() => setShowSplitDetail(false)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={darkUI.labelMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              <View style={s.listCard}>
                {splitPeople.map((p, i) => {
                  const hue = ACCENT[i % ACCENT.length];
                  const sh = shares.find((x) => x.key === p.key);
                  return (
                    <View key={p.key} style={[s.splitDetailRow, i < splitPeople.length - 1 && s.listRowBorder]}>
                      <View style={[s.friendAvatar, { backgroundColor: `${hue}22`, borderColor: `${hue}30` }]}>
                        <Text style={[s.friendAvatarTxt, { color: hue }]}>{p.name.slice(0, 2).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listRowTitle}>{p.name}</Text>
                        <Text style={s.listRowSub}>
                          {splitMethod === "shares" && `${customSplits[p.key] || "1"} share${(customSplits[p.key] || "1") === "1" ? "" : "s"}`}
                          {splitMethod === "exact" && `$${sh?.share.toFixed(2) ?? "0.00"}`}
                          {splitMethod === "percent" && total > 0
                            ? `= $${((total * (parseFloat(customSplits[p.key] || "0") || 0)) / 100).toFixed(2)}`
                            : splitMethod === "percent" ? "0%" : null}
                        </Text>
                      </View>
                      <View style={s.splitDetailInputWrap}>
                        <TextInput
                          style={s.splitDetailInput}
                          value={customSplits[p.key] ?? ""}
                          selectTextOnFocus
                          onChangeText={(v) => {
                            const cleaned = v.replace(/[^0-9.]/g, "");
                            // Mark this key as touched
                            touchedSplitKeysRef.current = new Set(touchedSplitKeysRef.current).add(p.key);
                            const onlyThisTouched = touchedSplitKeysRef.current.size === 1;

                            if (splitMethod === "shares" || !onlyThisTouched) {
                              // Shares always independent; sticky once a second field has been touched
                              setCustomSplits((prev) => ({ ...prev, [p.key]: cleaned }));
                              return;
                            }
                            // Dynamic: only the first field touched — auto-redistribute others
                            const newVal = parseFloat(cleaned) || 0;
                            const others = splitPeople.filter((o) => o.key !== p.key);
                            if (others.length === 0) {
                              setCustomSplits((prev) => ({ ...prev, [p.key]: cleaned }));
                              return;
                            }
                            const cap = splitMethod === "percent" ? 100 : total;
                            const remaining = Math.max(0, cap - newVal);
                            const perOther = remaining / others.length;
                            setCustomSplits((prev) => {
                              const next = { ...prev, [p.key]: cleaned };
                              others.forEach((o) => {
                                next[o.key] = perOther > 0 ? parseFloat(perOther.toFixed(2)).toString() : "0";
                              });
                              return next;
                            });
                          }}
                          keyboardType="decimal-pad"
                          placeholder={splitMethod === "shares" ? "1" : "0"}
                          placeholderTextColor={darkUI.labelMuted}
                          maxLength={20}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
              {/* Running total vs target */}
              {(() => {
                const inputSum = splitPeople.reduce((a, p) => a + (parseFloat(customSplits[p.key] || "0") || 0), 0);
                const isBalanced = splitMethod === "shares" || Math.abs(
                  splitMethod === "percent" ? inputSum - 100 : inputSum - total
                ) < 0.02;
                return (
                  <View style={[s.remainingRow, !isBalanced && { borderColor: "rgba(239,68,68,0.35)" }]}>
                    <Text style={s.remainingLabel}>
                      {splitMethod === "shares" ? "Total shares" : splitMethod === "percent" ? "Total %" : "Total"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {!isBalanced && (
                        <Text style={{ fontSize: 12, fontFamily: font.semibold, color: "#EF4444" }}>
                          {splitMethod === "percent"
                            ? `${(100 - inputSum).toFixed(1)}% left`
                            : `$${(total - inputSum).toFixed(2)} left`}
                        </Text>
                      )}
                      <Text style={[s.remainingValue, !isBalanced && { color: "#EF4444" }]}>
                        {splitMethod === "shares" && `${inputSum.toFixed(0)} shares`}
                        {splitMethod === "exact" && `$${inputSum.toFixed(2)} / $${total.toFixed(2)}`}
                        {splitMethod === "percent" && `${inputSum.toFixed(1)}% / 100%`}
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </ScrollView>
            <View style={s.footer}>
              <TouchableOpacity style={s.primaryBtnDark} onPress={() => setShowSplitDetail(false)} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

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
            <TextInput style={s.modalIn} value={newFriendName} onChangeText={setNewFriendName} placeholder="Name" placeholderTextColor={darkUI.labelMuted} maxLength={100} />
            <TextInput
              style={[s.modalIn, { marginTop: 10 }]}
              value={newFriendEmail}
              onChangeText={setNewFriendEmail}
              placeholder="Email (optional)"
              placeholderTextColor={darkUI.labelMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={254}
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

  body: { paddingHorizontal: 20, paddingBottom: 40 },
  footer: { paddingHorizontal: 20, paddingBottom: 34, paddingTop: 10 },

  secLabel: { fontSize: 11, fontFamily: font.extrabold, color: darkUI.labelMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },

  // Search bar (step 1)
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, height: 44,
    backgroundColor: darkUI.card, borderRadius: radii.lg, borderWidth: 1, borderColor: darkUI.stroke, marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: font.regular, color: darkUI.label },

  // List card (shared)
  listCard: { backgroundColor: darkUI.card, borderRadius: radii["2xl"], borderWidth: 1, borderColor: darkUI.stroke, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: darkUI.sep },
  listRowTitle: { fontSize: 15, fontFamily: font.semibold, color: darkUI.label },
  listRowSub: { fontSize: 12, fontFamily: font.regular, color: darkUI.labelMuted, marginTop: 1 },

  // Group emoji (step 1)
  groupEmoji: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: prototype.greenBg, borderWidth: 2, borderColor: prototype.greenMid,
    alignItems: "center", justifyContent: "center",
  },

  // Friend avatar
  friendAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  friendAvatarTxt: { fontSize: 14, fontFamily: font.bold },

  // Radio button
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: darkUI.stroke, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: darkUI.label, backgroundColor: darkUI.label },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },

  // Add friend row
  addFriendRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  addFriendTxt: { fontFamily: font.semibold, fontSize: 15, color: colors.primary },

  // Step 2: text field
  textField: {
    backgroundColor: darkUI.card, borderWidth: 1, borderColor: darkUI.stroke, borderRadius: radii["2xl"],
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: font.semibold, color: darkUI.label,
  },
  amountField: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: darkUI.card, borderWidth: 1, borderColor: darkUI.stroke, borderRadius: radii["2xl"],
    paddingHorizontal: 16, paddingVertical: 14,
  },
  amountPrefix: { fontSize: 20, fontFamily: font.bold, color: darkUI.labelSecondary },
  amountFieldInput: { flex: 1, fontSize: 24, fontFamily: font.bold, color: darkUI.label },

  // Paid by + split row (step 2)
  paidSplitRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap",
    gap: 4, paddingVertical: 16, paddingHorizontal: 18, marginTop: 24,
    backgroundColor: darkUI.card, borderRadius: radii["2xl"], borderWidth: 1, borderColor: darkUI.stroke,
  },
  paidSplitTxt: { fontSize: 13, fontFamily: font.medium, color: darkUI.labelSecondary },
  paidSplitChip: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12,
    backgroundColor: darkUI.bgElevated, borderWidth: 1, borderColor: darkUI.stroke,
  },
  paidSplitChipTxt: { fontSize: 13, fontFamily: font.bold, color: darkUI.label },

  eqHint: { textAlign: "center", fontFamily: font.bold, fontSize: 14, color: darkUI.labelMuted, marginTop: 8 },

  // Step 3: expense card
  expenseCard: {
    backgroundColor: darkUI.card, borderRadius: radii["2xl"], borderWidth: 1, borderColor: darkUI.stroke,
    padding: 20,
  },
  expenseCardLabel: { fontSize: 11, fontFamily: font.extrabold, color: darkUI.labelMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  expenseCardAmount: { fontSize: 32, fontFamily: font.black, color: darkUI.label, letterSpacing: -1 },
  expenseCardDesc: { fontSize: 15, fontFamily: font.semibold, color: darkUI.label, marginTop: 4 },
  expenseCardMeta: { fontSize: 13, fontFamily: font.regular, color: darkUI.labelMuted, marginTop: 4 },

  // Step 3: owe rows
  oweRow: { paddingVertical: 12, paddingHorizontal: 8 },
  oweTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  oweAmount: { fontSize: 18, fontFamily: font.black, color: darkUI.label },
  tapToPayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: radii.lg,
    backgroundColor: darkUI.bgElevated, borderWidth: 1, borderColor: darkUI.stroke,
  },
  tapToPayBtnTxt: { fontSize: 13, fontFamily: font.bold, color: darkUI.labelSecondary },

  // Picker / modal headers
  pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 16 },
  pickerTitle: { fontSize: 20, fontFamily: font.black, color: darkUI.label },

  // Split method rows
  splitMethodRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, paddingHorizontal: 12 },
  splitMethodIcon: { width: 40, height: 40, borderRadius: radii.lg, backgroundColor: darkUI.bgElevated, alignItems: "center", justifyContent: "center" },

  // Split detail
  splitDetailRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12 },
  splitDetailInputWrap: {
    width: 80, backgroundColor: darkUI.bgElevated, borderWidth: 1, borderColor: darkUI.stroke,
    borderRadius: radii.lg, paddingHorizontal: 12,
  },
  splitDetailInput: { fontSize: 16, fontFamily: font.bold, color: darkUI.label, paddingVertical: 8, textAlign: "right" },
  remainingRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 16, marginHorizontal: 4, paddingVertical: 16, paddingHorizontal: 16,
    backgroundColor: darkUI.card, borderRadius: radii["2xl"], borderWidth: 1, borderColor: darkUI.stroke,
  },
  remainingLabel: { fontSize: 13, fontFamily: font.extrabold, color: darkUI.labelMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  remainingValue: { fontSize: 18, fontFamily: font.black, color: darkUI.label },

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
  primaryBtnDark: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: darkUI.label, paddingVertical: 16, borderRadius: radii.lg,
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
