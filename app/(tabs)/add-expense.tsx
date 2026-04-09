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
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/expo";
import { sendSmsInvite, sendEmailInvite, shareInvite } from "../../lib/invite";
import { useApiFetch, invalidateApiCache } from "../../lib/api";
import { useGroupsSummary, clearMemSummaryCache, clearMemActivityCache } from "../../hooks/useGroups";
import { useDeviceContacts, type DeviceContact } from "../../hooks/useDeviceContacts";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";
import { font, radii, prototype } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { ThemeColors } from "../../lib/colors";
import { useToast } from "../../components/Toast";
import { haptic } from "../../components/ui";
import { sfx } from "../../lib/sounds";
import { useCurrency } from "../../hooks/useCurrency";

type Target = { type: "group" | "friend"; key: string; name: string; imageUrl?: string | null };
type SplitMethod = "equal" | "exact" | "percent" | "shares";

type RepeatFrequency = "weekly" | "biweekly" | "monthly" | "custom";
type RepeatEndType = "never" | "after_count" | "after_months";
type CustomUnit = "days" | "weeks" | "months";

type GroupMember = {
  id: string;
  user_id: string | null;
  display_name: string;
  venmo_username?: string | null;
};

const ACCENT = ["#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#8B5CF6"];

const SPLIT_METHODS: { key: SplitMethod; label: string; icon: string }[] = [
  { key: "equal", label: "Equal", icon: "git-compare-outline" },
  { key: "percent", label: "%", icon: "pie-chart-outline" },
  { key: "exact", label: "Amt", icon: "cash-outline" },
  { key: "shares", label: "Shares", icon: "layers-outline" },
];

const EXPENSE_CATEGORIES: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: "Food & Drink", icon: "restaurant-outline" },
  { label: "Transportation", icon: "car-outline" },
  { label: "Entertainment", icon: "game-controller-outline" },
  { label: "Shopping", icon: "bag-outline" },
  { label: "Utilities", icon: "flash-outline" },
  { label: "Rent", icon: "home-outline" },
  { label: "Travel", icon: "airplane-outline" },
  { label: "Health", icon: "medkit-outline" },
  { label: "Education", icon: "school-outline" },
  { label: "Other", icon: "ellipsis-horizontal-outline" },
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

/**
 * Module-level caches so resolved group members and friend→group mappings
 * survive across mounts. Navigating back to add-expense for the same
 * person/group skips all API calls.
 */
const _memberCache = new Map<string, GroupMember[]>();
const _friendGroupCache = new Map<string, string>();
let _recentActivity: Array<{ merchant: string; amount: number }> | null = null;

/** Clear add-expense resolution caches (call when groups/members change). */
export function clearMemberCache() {
  _memberCache.clear();
  _friendGroupCache.clear();
}

/** Pre-warm caches from screens that already loaded this data (person, group). */
export function prewarmFriendGroupCache(friendKey: string, groupId: string) {
  _friendGroupCache.set(friendKey, groupId);
}
export function prewarmMemberCache(groupId: string, members: GroupMember[]) {
  _memberCache.set(groupId, members);
}
export function prewarmRecentActivity(activity: Array<{ merchant: string; amount: number }>) {
  _recentActivity = activity;
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
  const { prefillDesc, prefillAmount, prefillNonce, prefillPersonKey, prefillPersonName, prefillPersonType, prefillBankDate, prefillBankCategory, prefillContactName, prefillContactEmail, prefillContactPhone } = useLocalSearchParams<{
    prefillDesc?: string;
    prefillAmount?: string;
    prefillNonce?: string;
    prefillPersonKey?: string;
    prefillPersonName?: string;
    prefillPersonType?: string;
    prefillBankDate?: string;
    prefillBankCategory?: string;
    prefillContactName?: string;
    prefillContactEmail?: string;
    prefillContactPhone?: string;
  }>();
  const { userId } = useAuth();
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const toast = useToast();
  const { summary: realSummary, loading } = useGroupsSummary({ contacts: true });
  const summary = isDemoOn ? demo.summary : realSummary;
  const { contacts: deviceContacts, permissionStatus: contactsPerm, requestAccess: requestContactsAccess } = useDeviceContacts();
  const { currencyCode, symbol: currSymbol } = useCurrency();
  const { theme, isDark } = useTheme();
  const s = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const tint = isDark ? theme.accent : theme.primary;

  // ── State ──
  const [targets, setTargets] = useState<Target[]>([]);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const saving = false;
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackGroups, setFallbackGroups] = useState<Array<{ id: string; name: string; memberCount: number; groupType?: string | null; imageUrl?: string | null }>>([]);
  const [optimisticGroups, setOptimisticGroups] = useState<Array<{ id: string; name: string; memberCount: number; groupType?: string | null; imageUrl?: string | null }>>([]);
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
  const [step, setStep] = useState<1 | 3>(1);
  const [showPaidByPicker, setShowPaidByPicker] = useState(false);
  const [showSplitMethodPicker, setShowSplitMethodPicker] = useState(false);
  const [showSplitDetail, setShowSplitDetail] = useState(false);

  // Add-friend modal
  const [retryCount, setRetryCount] = useState(0);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newFriendName, setNewFriendName] = useState(query);
  const [newFriendEmail, setNewFriendEmail] = useState("");
  const [newFriendPhone, setNewFriendPhone] = useState("");
  const [addingNewPerson, setAddingNewPerson] = useState(false);

  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>("monthly");
  const [showRepeatPicker, setShowRepeatPicker] = useState(false);
  const [customEvery, setCustomEvery] = useState("2");
  const [customUnit, setCustomUnit] = useState<CustomUnit>("weeks");
  const [repeatEndType, setRepeatEndType] = useState<RepeatEndType>("never");
  const [repeatEndCount, setRepeatEndCount] = useState("12");
  const [repeatEndMonths, setRepeatEndMonths] = useState("6");

  const lastPrefillNonce = useRef<string | null>(null);
  const savedRef = useRef(false);
  const touchedSplitKeysRef = useRef<Set<string>>(new Set());
  const searchInputRef = useRef<TextInput>(null);
  const descInputRef = useRef<TextInput>(null);
  const backspacePrimed = useRef<string | null>(null);
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);

  const resetForm = useCallback(() => {
    setStep(1);
    setTargets([]);
    setQuery("");
    setSearchFocused(false);
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
    setCategory(null);
    setNotes("");
    setShowSettlement(false);
    setRetryCount(0);
    setRepeatEnabled(false);
    setRepeatFrequency("monthly");
    setShowRepeatPicker(false);
    setCustomEvery("2");
    setCustomUnit("weeks");
    setRepeatEndType("never");
    setRepeatEndCount("12");
    setRepeatEndMonths("6");
    savedRef.current = false;
    touchedSplitKeysRef.current = new Set();
    setJustSaved(false);
  }, []);

  // Reset form when screen gains focus without fresh prefill params
  useEffect(() => {
    if (isFocused && !prevFocused.current) {
      if (!prefillNonce || prefillNonce === lastPrefillNonce.current) {
        resetForm();
        // Clear stale route params so they don't re-trigger the prefill effect
        nav.setParams({
          prefillDesc: undefined,
          prefillAmount: undefined,
          prefillNonce: undefined,
          prefillPersonKey: undefined,
          prefillPersonName: undefined,
          prefillPersonType: undefined,
          prefillBankDate: undefined,
          prefillBankCategory: undefined,
        } as Record<string, undefined>);
        // Auto-open keyboard on search input
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
    }
    prevFocused.current = isFocused;
  }, [isFocused, prefillNonce, resetForm, nav]);

  // ── Prefill reset ──
  useEffect(() => {
    if (prefillNonce != null && prefillNonce !== "" && lastPrefillNonce.current !== prefillNonce) {
      lastPrefillNonce.current = prefillNonce;
      setQuery("");
      setSearchFocused(false);
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
      if (prefillDesc && prefillDesc.length > 0) setDescription(prefillDesc);
      else setDescription("");
      if (prefillAmount && prefillAmount.length > 0) setAmount(prefillAmount.replace(/[^0-9.]/g, ""));
      else setAmount("");
      setStep(1);
      if (prefillContactName) {
        setNewFriendName(prefillContactName);
        setNewFriendEmail(prefillContactEmail ?? "");
        setNewFriendPhone(prefillContactPhone ?? "");
        setShowAddFriend(true);
      }
    }
  }, [prefillNonce, prefillDesc, prefillAmount, prefillPersonKey, prefillPersonName, prefillPersonType, prefillContactName, prefillContactEmail, prefillContactPhone]);

  // Pre-populate friend group + member caches from the summary so the resolve
  // flow hits cache instead of making sequential /api/groups/person + /members calls.
  useEffect(() => {
    if (!realSummary) return;
    const { friends: sf, groups: sg } = realSummary;
    if (!sf || !sg) return;

    // Server-provided mapping (fast path when server returns friendGroupId)
    for (const f of sf) {
      if (f.friendGroupId && !_friendGroupCache.has(f.key)) {
        _friendGroupCache.set(f.key, f.friendGroupId);
      }
      if (f.friendGroupId && f.friendGroupMembers && !_memberCache.has(f.friendGroupId)) {
        _memberCache.set(
          f.friendGroupId,
          f.friendGroupMembers.map((m) => ({ ...m, venmo_username: null })),
        );
      }
    }

    // Client-side fallback: match friends to their "friend" groups by name.
    // Works without server changes — the summary already has both lists.
    const friendGroups = sg.filter(
      (g) => (g as { groupType?: string }).groupType === "friend" && g.memberCount === 2,
    );
    if (friendGroups.length > 0) {
      const groupByName = new Map(friendGroups.map((g) => [g.name.trim().toLowerCase(), g.id]));
      for (const f of sf) {
        if (_friendGroupCache.has(f.key)) continue;
        const gid = groupByName.get(f.displayName.trim().toLowerCase());
        if (gid) _friendGroupCache.set(f.key, gid);
      }
    }
  }, [realSummary]);

  // ── Fallback groups fetch (skip if summary already has groups) ──
  const summaryGroups = summary?.groups ?? [];
  useEffect(() => {
    if (isDemoOn) return;
    if ((summary?.groups ?? []).length > 0) return;
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
              imageUrl: typeof g.imageUrl === "string" ? g.imageUrl : null,
            }))
          );
        }
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [apiFetch, isDemoOn, summary?.groups?.length]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`coconut.optimistic.friends.${userId}`);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as {
          groups?: Array<{ id: string; name: string; memberCount: number; groupType?: string | null; imageUrl?: string | null }>;
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

  const { friends, groups } = useMemo(() => {
    const mergedFallbackGroups = [...optimisticGroups, ...fallbackGroups.filter((g) => !optimisticGroups.some((o) => o.id === g.id))];
    const fallbackFriendRows = mergedFallbackGroups
      .filter((g) => (g.groupType ?? "other") !== "home")
      .map((g) => ({ key: `grp:${g.id}`, displayName: g.name, balance: 0, balances: [] as { currency: string; amount: number }[] }));
    const fallbackGroupRows = mergedFallbackGroups.map((g) => ({
      id: g.id, name: g.name, memberCount: g.memberCount, imageUrl: g.imageUrl ?? null, myBalance: 0, myBalances: [], lastActivityAt: new Date().toISOString(),
    }));
    const mergedFallbackFriends = [
      ...optimisticFriends,
      ...fallbackFriendRows.filter((f) => !optimisticFriends.some((o) => o.displayName === f.displayName)),
    ];
    const fr = summaryFriends.length > 0
      ? [...summaryFriends, ...optimisticFriends.filter((o) => !summaryFriends.some((s) => s.displayName === o.displayName))]
      : mergedFallbackFriends;
    const gr = summaryGroups.length > 0 ? summaryGroups : fallbackGroupRows;
    return { friends: fr, groups: gr };
  }, [summaryFriends, summaryGroups, optimisticGroups, optimisticFriends, fallbackGroups]);

  const q = query.toLowerCase().trim();

  const { filteredFriends, filteredGroups } = useMemo(() => {
    const friendNameSet = new Set(friends.map((f) => f.displayName.trim().toLowerCase()));
    const visibleGroups = groups.filter((g) => {
      const groupName = g.name.trim().toLowerCase();
      if (g.memberCount <= 2 && friendNameSet.has(groupName)) return false;
      return true;
    });
    return {
      filteredFriends: q ? friends.filter((f) => f.displayName.toLowerCase().includes(q)) : friends,
      filteredGroups: q ? visibleGroups.filter((g) => g.name.toLowerCase().includes(q)) : visibleGroups,
    };
  }, [friends, groups, q]);

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
  const showPicker = targets.length === 0 || (searchFocused && q.length > 0);

  const myMemberId = useMemo(() => {
    const byAuth = groupMembers.find((m) => m.user_id && m.user_id === userId)?.id;
    if (byAuth) return byAuth;
    if (isDemoOn) {
      return groupMembers.find((m) => m.display_name === "You" || m.user_id === "me")?.id ?? groupMembers[0]?.id ?? null;
    }
    return null;
  }, [groupMembers, userId, isDemoOn]);

  const splitPeople = useMemo(() => {
    const isSingleFriend = targets.length === 1 && targets[0].type === "friend";
    if (isSingleFriend && myMemberId && groupMembers.length > 2) {
      const me = groupMembers.find((m) => m.id === myMemberId);
      const friendName = targets[0].name.toLowerCase();
      const them = groupMembers.find(
        (m) => m.id !== myMemberId && m.display_name.toLowerCase() === friendName
      );
      if (me && them) {
        return [
          { key: me.id, name: me.display_name },
          { key: them.id, name: them.display_name },
        ];
      }
    }
    return groupMembers.map((m) => ({ key: m.id, name: m.display_name }));
  }, [groupMembers, targets, myMemberId]);

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
  const canSave = total > 0 && targets.length > 0 && resolvedGroupId && !saving && !resolving;

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

  // Auto-resolve group when targets change (stable deps only — no demo.* objects)
  useEffect(() => {
    if (targets.length === 0) {
      setResolvedGroupId(null);
      setGroupMembers([]);
      return;
    }

    let cancelled = false;
    const abortCtrl = new AbortController();
    const signal = abortCtrl.signal;
    setError(null);
    setResolving(true);
    const _t0 = Date.now();

    const load = async (attempt = 0) => {
      try {
        const d = demoRef.current;
        let gid: string | null = null;

        // ── Demo mode (first target only) ──
        if (isDemoOn) {
          const t = targets[0];
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

        const friendTargets = targets.filter((t) => t.type === "friend");
        const groupTarget = targets.find((t) => t.type === "group");

        // ── Single group target ──
        if (groupTarget) {
          gid = groupTarget.key;
        }
        // ── Single friend ──
        else if (friendTargets.length === 1) {
          const t = friendTargets[0];
          const cachedGid = _friendGroupCache.get(t.key);
          if (cachedGid) {
            gid = cachedGid;
          } else {
            const res = await apiFetch(`/api/groups/person?key=${encodeURIComponent(t.key)}`, { signal });
            if (cancelled) return;
            const data = await res.json();
            if (cancelled) return;
            if (!res.ok) { if (!cancelled) { setError("Could not load friend"); setResolving(false); } return; }
            const sg = data.sharedGroups as { id: string; name: string; memberCount: number; groupType?: string | null; members?: GroupMember[] }[] | undefined;

            // Prefer a dedicated 1:1 friend group — NOT trip/household groups
            // that happen to have only 2 members
            const friendGroup = sg?.find((g) => g.groupType === "friend" && g.memberCount === 2);
            gid = friendGroup?.id ?? null;

            // Cache members from the person response so we skip the /members round trip
            if (friendGroup?.id && friendGroup.members?.length) {
              _memberCache.set(friendGroup.id, dedupeMembers(friendGroup.members));
            }

            if (!gid) {
              // No dedicated friend group exists — create one
              const friendName = data.displayName ?? t.name;
              const friendEmail = data.email ?? null;
              const friendUserId = t.key?.startsWith("user_") ? t.key : null;
              try {
                const groupRes = await apiFetch("/api/groups", {
                  method: "POST",
                  body: { name: friendName, ownerDisplayName: "You", group_type: "friend" } as object,
                  signal,
                });
                const group = await groupRes.json();
                if (cancelled) return;
                if (groupRes.ok && group.id) {
                  const memberBody: Record<string, string> = { displayName: friendName };
                  if (friendEmail) memberBody.email = friendEmail;
                  if (friendUserId) memberBody.userId = friendUserId;
                  await apiFetch(`/api/groups/${group.id}/members`, {
                    method: "POST",
                    body: memberBody as object,
                    signal,
                  });
                  gid = group.id;
                }
              } catch { /* fall through */ }
            }

            if (!gid) { if (!cancelled) { setError("Could not create shared group"); setResolving(false); } return; }
            _friendGroupCache.set(t.key, gid);
          }
        }
        // ── Multiple friends → create/find group for all of them ──
        else if (friendTargets.length > 1) {
          const cacheKey = "multi:" + friendTargets.map((ft) => ft.key).sort().join("|");
          const cachedGid = _friendGroupCache.get(cacheKey);
          if (cachedGid) {
            gid = cachedGid;
          } else {
            const groupName = friendTargets.map((ft) => ft.name).join(", ");
            const groupRes = await apiFetch("/api/groups", {
              method: "POST",
              body: { name: groupName, ownerDisplayName: "You", group_type: "friend" } as object,
              signal,
            });
            const group = await groupRes.json();
            if (cancelled) return;
            if (!groupRes.ok || !group.id) { setError("Could not create group"); setResolving(false); return; }
            gid = group.id;

            await Promise.all(friendTargets.map((ft) => {
              const friendUserId = ft.key?.startsWith("user_") ? ft.key : null;
              const friendEmail = !friendUserId && ft.key?.includes("@") ? ft.key : null;
              const body: Record<string, string> = { displayName: ft.name };
              if (friendUserId) body.userId = friendUserId;
              if (friendEmail) body.email = friendEmail;
              return apiFetch(`/api/groups/${gid}/members`, { method: "POST", body: body as object, signal });
            }));
            if (cancelled) return;
            _friendGroupCache.set(cacheKey, gid!);
            _memberCache.delete(gid!);
          }
        }

        if (!gid) { if (!cancelled) { setError("Could not determine group"); setResolving(false); } return; }
        if (cancelled) return;
        setResolvedGroupId(gid);

        // Use cached members if available
        const cached = _memberCache.get(gid);
        if (cached) {
          setGroupMembers(cached);
          setPayerMemberId(null);
          setPaidByMe(true);
          if (!cancelled) setResolving(false);
          if (__DEV__) console.log(`[add-expense] resolve: ${Date.now() - _t0}ms (cache hit)`);
          return;
        }

        // Fetch only the member list (lightweight)
        const gr = await apiFetch(`/api/groups/${gid}/members`, { signal });
        const raw = await gr.json();
        if (cancelled) return;
        if (!gr.ok) {
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 200));
            if (!cancelled) load(1);
          } else {
            setError("Could not load group — tap Try again");
            setResolving(false);
          }
          return;
        }
        const members = dedupeMembers((Array.isArray(raw) ? raw : raw.members ?? []) as GroupMember[]);
        _memberCache.set(gid, members);
        setGroupMembers(members);
        setPayerMemberId(null);
        setPaidByMe(true);
        if (!cancelled) setResolving(false);
        if (__DEV__) console.log(`[add-expense] resolve: ${Date.now() - _t0}ms (fetched)`);
      } catch (e) {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) return;
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 200));
          if (!cancelled) load(1);
        } else {
          setError("Network error — tap Try again");
          setResolving(false);
        }
      }
    };

    load();
    return () => { cancelled = true; abortCtrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, apiFetch, isDemoOn, retryCount]);

  const startAddFriend = (contact?: DeviceContact) => {
    setNewFriendName(contact?.name ?? query.trim());
    setNewFriendEmail(contact?.email ?? "");
    setNewFriendPhone(contact?.phone ?? "");
    setShowAddFriend(true);
  };

  const handleInviteContact = useCallback(async (c: DeviceContact) => {
    const name = user?.firstName ?? undefined;
    try {
      if (c.phone) await sendSmsInvite([c.phone], name);
      else if (c.email) await sendEmailInvite([c.email], name);
      else await shareInvite(name);
    } catch {
      await shareInvite(name);
    }
  }, [user]);

  const addNewFriend = async () => {
    const name = newFriendName.trim();
    const email = newFriendEmail.trim() || null;
    if (!name) return;
    setAddingNewPerson(true);
    try {
      const groupRes = await apiFetch("/api/groups", { method: "POST", body: { name, ownerDisplayName: "You", group_type: "friend" } as object });
      const group = await groupRes.json();
      if (!groupRes.ok || !group.id) { setError("Failed to create"); return; }
      await apiFetch(`/api/groups/${group.id}/members`, {
        method: "POST",
        body: { displayName: name, ...(email ? { email } : {}), ...(newFriendPhone.trim() ? { phone: newFriendPhone.trim() } : {}) } as object,
      });
      setShowAddFriend(false);
      setNewFriendPhone("");
      setQuery("");
      selectTarget({ type: "group", key: group.id, name });
    } finally {
      setAddingNewPerson(false);
    }
  };

  const selectTarget = useCallback((t: Target) => {
    sfx.pop();
    setQuery("");
    setError(null);
    backspacePrimed.current = null;

    if (t.type === "group") {
      setSearchFocused(false);
      setTargets([t]);
      return;
    }

    // Friends: toggle — keep search focused so user can add more
    setTargets((prev) => {
      if (prev.some((p) => p.type === "group")) return [t];
      if (prev.some((p) => p.key === t.key)) return prev.filter((p) => p.key !== t.key);
      return [...prev, t];
    });
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const removeOneTarget = useCallback((key: string) => {
    setTargets((prev) => prev.filter((p) => p.key !== key));
    backspacePrimed.current = null;
  }, []);

  const handleSearchKeyPress = useCallback(({ nativeEvent }: { nativeEvent: { key: string } }) => {
    if (nativeEvent.key !== "Backspace" || query.length > 0 || targets.length === 0) {
      backspacePrimed.current = null;
      return;
    }
    const lastFriend = [...targets].reverse().find((t) => t.type === "friend");
    if (!lastFriend) return;
    if (backspacePrimed.current === lastFriend.key) {
      setTargets((prev) => prev.filter((p) => p.key !== lastFriend.key));
      backspacePrimed.current = null;
    } else {
      backspacePrimed.current = lastFriend.key;
      setTargets((prev) => [...prev]);
    }
  }, [query, targets]);

  const removeAllTargets = useCallback(() => {
    setTargets([]);
    setResolvedGroupId(null);
    setGroupMembers([]);
    setCustomSplits({});
    setSplitExpanded(false);
  }, []);

  // Reset group state when all targets are removed
  useEffect(() => {
    if (targets.length === 0) {
      setResolvedGroupId(null);
      setGroupMembers([]);
      setCustomSplits({});
      setSplitExpanded(false);
    }
  }, [targets.length]);

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

  const targetLabel = targets.map((t) => t.name).join(", ") || "group";

  const save = async () => {
    if (total <= 0 || !resolvedGroupId || targets.length === 0) return;
    const desc = description.trim() || "Expense";
    const effPayer = paidByMe ? (myMemberId ?? groupMembers[0]?.id ?? null) : payerMemberId;
    if (!effPayer) { setError("Missing payer"); return; }
    if (!splitValid) {
      if (splitMethod === "percent") setError("Percents must add to 100%");
      else setError(`Amounts must add up to ${currSymbol}${total.toFixed(2)}`);
      return;
    }

    // Duplicate check — cache-only, never blocks on a network call
    let warn = false;
    const descTrim = description.trim();
    if (resolvedGroupId && descTrim) {
      if (isDemoOn) {
        const act = demo.groupDetails[resolvedGroupId]?.activity ?? [];
        warn = act.some((row) => Math.abs(Number(row.amount) - total) < 0.02 && descriptionsSimilar(row.merchant, descTrim));
      } else if (_recentActivity) {
        warn = _recentActivity.some(
          (row) =>
            Math.abs(Number(row.amount) - total) < 0.02 && descriptionsSimilar(row.merchant, descTrim)
        );
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
    if (total <= 0 || !resolvedGroupId || targets.length === 0) return;
    const desc = description.trim() || "Expense";
    const effPayer = paidByMe ? (myMemberId ?? groupMembers[0]?.id ?? null) : payerMemberId;
    if (!effPayer) return;

    if (isDemoOn) {
      savedRef.current = true;
      const t = targets[0];
      demo.addExpense(total, desc, t.key, t.type);
      sfx.coin();
      toast.show(`Expense saved · ${currSymbol}${total.toFixed(2)} with ${targetLabel}`);
      DeviceEventEmitter.emit("expense-added");
      return;
    }

    savedRef.current = true;
    setError(null);

    const body: Record<string, unknown> = {
      amount: total,
      description: desc,
      groupId: resolvedGroupId,
      payerMemberId: effPayer,
      currency: currencyCode,
    };
    if (category) body.category = category;
    const notesTrim = notes.trim();
    if (notesTrim) body.notes = notesTrim;
    if (splitMethod === "equal" && targets.length === 1 && targets[0].type === "friend") {
      body.personKey = targets[0].key;
    } else if (splitMethod !== "equal") {
      body.shares = shares.filter((sh) => sh.share > 0.001).map((sh) => ({ memberId: sh.key, amount: Math.round(sh.share * 100) / 100 }));
    }

    // Optimistic: give instant feedback, fire the POST in the background
    sfx.coin();
    toast.show(`Expense saved · ${currSymbol}${total.toFixed(2)} with ${targetLabel}`);
    invalidateApiCache("/api/groups/summary");
    invalidateApiCache(`/api/groups/${resolvedGroupId}`);
    invalidateApiCache("/api/groups/recent-activity");
    if (targets.some((t) => t.type === "friend")) invalidateApiCache("/api/groups/person");
    clearMemSummaryCache();
    clearMemActivityCache();
    DeviceEventEmitter.emit("expense-added", {
      groupId: resolvedGroupId,
      amount: total,
      description: desc,
      currency: currencyCode,
      payerMemberId: effPayer,
      shares: shares.filter((sh) => sh.share > 0.001).map((sh) => ({ memberId: sh.key, amount: sh.share })),
    });
    nav.back();

    const _saveT0 = __DEV__ ? Date.now() : 0;
    apiFetch("/api/manual-expense", { method: "POST", body })
      .then(async (res) => {
        if (__DEV__) console.log(`[add-expense] POST: ${Date.now() - _saveT0}ms`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.show(data?.error || "Save failed — tap to retry", "error");
        }
      })
      .catch(() => {
        toast.show("Save failed — check connection", "error");
      });

    if (repeatEnabled && resolvedGroupId) {
      const personKey = targets.length === 1 && targets[0].type === "friend" ? targets[0].key : undefined;
      let customIntervalDays: number | undefined;
      if (repeatFrequency === "custom") {
        const n = parseInt(customEvery, 10) || 1;
        customIntervalDays = customUnit === "days" ? n : customUnit === "weeks" ? n * 7 : n * 30;
      }
      let endDate: string | undefined;
      let maxOccurrences: number | undefined;
      if (repeatEndType === "after_count") {
        maxOccurrences = parseInt(repeatEndCount, 10) || 12;
      } else if (repeatEndType === "after_months") {
        const mo = parseInt(repeatEndMonths, 10) || 6;
        const d = new Date();
        d.setMonth(d.getMonth() + mo);
        endDate = d.toISOString().split("T")[0];
      }
      apiFetch("/api/recurring-expenses", {
        method: "POST",
        body: {
          groupId: resolvedGroupId,
          personKey,
          amount: total,
          description: desc,
          frequency: repeatFrequency,
          iso_currency_code: currencyCode,
          ...(customIntervalDays ? { customIntervalDays } : {}),
          ...(endDate ? { endDate } : {}),
          ...(maxOccurrences ? { maxOccurrences } : {}),
        },
      }).then(() => {
        const freqLabel = repeatFrequency === "weekly" ? "weekly"
          : repeatFrequency === "biweekly" ? "biweekly"
          : repeatFrequency === "monthly" ? "monthly"
          : `every ${customEvery} ${customUnit}`;
        toast.show(`Will repeat ${freqLabel}`);
      }).catch(() => {});
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
        currency: currencyCode,
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
        <ActivityIndicator size="large" color={tint} />
      </View>
    );
  }

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

        {/* ══════════ COMPOSE VIEW (unified picker + form) ══════════ */}
        {step < 3 && (
          <>
            {/* Header: X | Title | Save */}
            <View style={s.header}>
              <TouchableOpacity onPress={() => nav.replace("/(tabs)")} hitSlop={12} style={s.headerSide}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={s.headerTitle}>Add an expense</Text>
              <TouchableOpacity
                onPress={async () => {
                  await save();
                  if (savedRef.current) {
                    resetForm();
                    nav.back();
                  }
                }}
                hitSlop={12}
                style={s.headerSide}
                disabled={!canSave || saving || justSaved}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={tint} />
                ) : justSaved ? (
                  <Ionicons name="checkmark-circle" size={22} color={theme.success} />
                ) : (
                  <Text style={{ fontFamily: font.bold, fontSize: 15, color: canSave ? tint : theme.textTertiary }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Person row: With you and: [chips] [inline search input] */}
            <View style={s.withRow}>
              <Text style={s.withLabel}>With <Text style={{ fontFamily: font.bold, color: theme.text }}>you</Text> and:</Text>
              <View style={s.withChipsWrap}>
                {targets.map((t, idx) => {
                  const primed = backspacePrimed.current === t.key;
                  return (
                  <View key={t.key} style={[s.withChip, primed && { backgroundColor: `${theme.error}20`, borderColor: `${theme.error}66` }]}>
                    {t.type === "group" && t.imageUrl ? (
                      <Image source={{ uri: t.imageUrl }} style={{ width: 20, height: 20, borderRadius: 5 }} />
                    ) : t.type === "group" ? (
                      <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: theme.cardBorder, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="people" size={11} color={theme.text} />
                      </View>
                    ) : (
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: `${ACCENT[idx % ACCENT.length]}${isDark ? "33" : "22"}`, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 8, fontFamily: font.bold, color: ACCENT[idx % ACCENT.length] }}>{t.name.slice(0, 2).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={{ fontFamily: font.semibold, fontSize: 13, color: primed ? theme.error : theme.text }}>{t.name}</Text>
                    <TouchableOpacity onPress={() => removeOneTarget(t.key)} hitSlop={6} style={{ padding: 1 }}>
                      <Ionicons name="close-circle" size={14} color={primed ? theme.error : theme.textTertiary} />
                    </TouchableOpacity>
                  </View>
                  );
                })}
                <TextInput
                  ref={searchInputRef}
                  style={s.inlineSearchInput}
                  value={query}
                  onChangeText={(t) => { setQuery(t); backspacePrimed.current = null; }}
                  onKeyPress={handleSearchKeyPress}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => { if (!query) { setSearchFocused(false); backspacePrimed.current = null; } }}
                  placeholder={targets.length === 0 ? "Search name or group" : "Add more…"}
                  placeholderTextColor={theme.textTertiary}
                  autoCorrect={false}
                  maxLength={200}
                />
              </View>
            </View>
            <View style={s.withDivider} />

            {/* Body: contact picker OR expense form */}
            {showPicker ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
                {loading && !summary && (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <ActivityIndicator size="small" color={theme.textTertiary} />
                    <Text style={[s.listRowSub, { marginTop: 8 }]}>Loading your groups…</Text>
                  </View>
                )}

                {filteredFriends.length > 0 && (
                  <>
                    <Text style={s.secLabel}>Friends</Text>
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
                            <View style={[s.friendAvatar, { backgroundColor: `${hue}${isDark ? "33" : "22"}`, borderColor: `${hue}${isDark ? "44" : "30"}` }]}>
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

                {filteredGroups.length > 0 && (
                  <>
                    <Text style={[s.secLabel, { marginTop: 16 }]}>Groups</Text>
                    <View style={s.listCard}>
                      {filteredGroups.map((g, i) => {
                        const imageUrl = (g as { imageUrl?: string | null }).imageUrl ?? null;
                        return (
                          <TouchableOpacity
                            key={g.id}
                            style={[s.listRow, i < filteredGroups.length - 1 && s.listRowBorder]}
                            onPress={() => selectTarget({ type: "group", key: g.id, name: g.name, imageUrl })}
                            activeOpacity={0.7}
                          >
                            {imageUrl ? (
                              <Image source={{ uri: imageUrl }} style={s.groupIconImg} />
                            ) : (
                              <View style={s.groupEmoji}>
                                <Ionicons name="people" size={22} color={theme.text} />
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={s.listRowTitle}>{g.name}</Text>
                              <Text style={s.listRowSub}>{g.memberCount} people</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {contactsPerm === "granted" && filteredDeviceContacts.length > 0 && (
                  <>
                    <Text style={[s.secLabel, { marginTop: 16 }]}>From your contacts</Text>
                    <View style={s.listCard}>
                      {filteredDeviceContacts.map((c, i) => (
                        <View
                          key={`dc-${c.id}`}
                          style={[s.listRow, i < filteredDeviceContacts.length - 1 && s.listRowBorder, { flexDirection: "row", alignItems: "center" }]}
                        >
                          <TouchableOpacity
                            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
                            onPress={() => startAddFriend(c)}
                            activeOpacity={0.7}
                          >
                            <View style={[s.friendAvatar, { backgroundColor: "#8B5CF622", borderColor: "#8B5CF644" }]}>
                              <Text style={[s.friendAvatarTxt, { color: "#8B5CF6" }]}>{c.name.slice(0, 2).toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.listRowTitle}>{c.name}</Text>
                              {c.email ? <Text style={s.listRowSub}>{c.email}</Text> : c.phone ? <Text style={s.listRowSub}>{c.phone}</Text> : null}
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleInviteContact(c)} style={s.inviteBtn} hitSlop={8}>
                            <Text style={s.inviteBtnTxt}>Invite</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {contactsPerm === "undetermined" && q.length > 0 && filteredFriends.length === 0 && (
                  <TouchableOpacity style={[s.addFriendRow, { marginTop: 12 }]} onPress={requestContactsAccess}>
                    <Ionicons name="people-circle-outline" size={20} color={tint} />
                    <Text style={s.addFriendTxt}>Search your contacts</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
                  </TouchableOpacity>
                )}

                {noMatches && (
                  <TouchableOpacity style={s.addFriendRow} onPress={() => startAddFriend()}>
                    <Ionicons name="person-add" size={18} color={tint} />
                    <Text style={s.addFriendTxt}>Add &quot;{query.trim()}&quot; as friend</Text>
                  </TouchableOpacity>
                )}
                {!noMatches && q.length > 1 && (
                  <TouchableOpacity style={[s.addFriendRow, { marginTop: 12 }]} onPress={() => startAddFriend()}>
                    <Ionicons name="person-add" size={18} color={tint} />
                    <Text style={s.addFriendTxt}>Add &quot;{query.trim()}&quot; as friend</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            ) : error ? (
              <View style={s.center}>
                <Ionicons name="cloud-offline-outline" size={40} color={theme.textTertiary} />
                <Text style={[s.err, { marginTop: 12, marginBottom: 16 }]}>{error}</Text>
                <TouchableOpacity style={s.primaryBtn} onPress={() => { setError(null); setRetryCount((n) => n + 1); }} activeOpacity={0.85}>
                  <Text style={s.primaryBtnText}>Try again</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={removeAllTargets} style={{ marginTop: 14 }}>
                  <Text style={[s.listRowSub, { color: tint }]}>← Back to list</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={s.compactForm} keyboardShouldPersistTaps="handled">
                  {prefillBankDate ? (
                    <View style={s.bankContextCard}>
                      <Ionicons name="card-outline" size={16} color={theme.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.bankContextMerchant} numberOfLines={1}>{description || prefillDesc || "Purchase"}</Text>
                        <Text style={s.bankContextMeta}>
                          {prefillBankDate}{prefillBankCategory ? ` · ${prefillBankCategory.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}` : ""}
                        </Text>
                      </View>
                      <Text style={s.bankContextAmt}>${amount || prefillAmount || "0.00"}</Text>
                    </View>
                  ) : null}

                  {/* Description row with icon */}
                  <View style={s.compactRow}>
                    <View style={s.compactIcon}>
                      <Ionicons name="receipt-outline" size={20} color={theme.textTertiary} />
                    </View>
                    <TextInput
                      ref={descInputRef}
                      style={s.compactDescInput}
                      value={description}
                      onChangeText={(t) => { setDescription(t); setError(null); }}
                      onFocus={() => setSearchFocused(false)}
                      placeholder="Enter a description"
                      placeholderTextColor={theme.textTertiary}
                      returnKeyType="next"
                      maxLength={500}
                    />
                  </View>
                  <View style={s.compactSep} />

                  {/* Amount row */}
                  <View style={s.compactRow}>
                    <View style={s.compactIcon}>
                      <Text style={{ fontSize: 18, fontFamily: font.bold, color: theme.textTertiary }}>{currSymbol}</Text>
                    </View>
                    <TextInput
                      style={s.compactAmountInput}
                      value={amount}
                      onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, "")); setError(null); }}
                      onFocus={() => setSearchFocused(false)}
                      placeholder="0.00"
                      placeholderTextColor={theme.textTertiary}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      maxLength={20}
                    />
                  </View>
                  <View style={s.compactSep} />

                  {/* Paid by + split chip — always show defaults immediately */}
                  <TouchableOpacity
                    style={s.splitChipRow}
                    onPress={() => { if (!resolving) setShowSplitMethodPicker(true); }}
                    activeOpacity={0.75}
                  >
                    <Text style={s.splitChipText}>
                      Paid by{" "}
                      <Text style={{ fontFamily: font.bold, color: theme.text }}>{payerDisplay}</Text>
                      {" "}and{" "}
                      <Text style={{ fontFamily: font.bold, color: theme.text }}>{splitDisplay}</Text>
                    </Text>
                  </TouchableOpacity>

                  {total > 0 && splitPeople.length > 0 && splitMethod === "equal" && (
                    <Text style={s.eqHint}>{currSymbol}{(total / splitPeople.length).toFixed(2)} per person</Text>
                  )}

                  {/* Category chips */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    contentContainerStyle={[s.categoryChipsContent, { marginTop: 20 }]}
                    style={s.categoryChipsScroll}
                  >
                    {EXPENSE_CATEGORIES.map((c) => {
                      const selected = category === c.label;
                      return (
                        <TouchableOpacity
                          key={c.label}
                          style={[s.categoryChip, selected && s.categoryChipSelected]}
                          onPress={() => { sfx.toggle(); setCategory(selected ? null : c.label); }}
                          activeOpacity={0.75}
                        >
                          <Ionicons name={c.icon} size={16} color={selected ? tint : theme.textSecondary} />
                          <Text style={[s.categoryChipLabel, selected && s.categoryChipLabelSelected]} numberOfLines={1}>{c.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </ScrollView>

                {/* Repeat toggle */}
                <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                  <TouchableOpacity
                    style={[s.repeatRow, repeatEnabled && s.repeatRowActive]}
                    onPress={() => {
                      sfx.toggle();
                      if (repeatEnabled) {
                        setRepeatEnabled(false);
                      } else {
                        setRepeatEnabled(true);
                        setShowRepeatPicker(true);
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={repeatEnabled ? "repeat" : "repeat-outline"}
                      size={18}
                      color={repeatEnabled ? tint : theme.textTertiary}
                    />
                    <Text style={s.repeatLabel}>
                      {repeatEnabled ? "Repeats" : "Repeat this expense"}
                    </Text>
                    {repeatEnabled && (
                      <TouchableOpacity
                        style={s.repeatFreqChip}
                        onPress={() => setShowRepeatPicker(true)}
                        activeOpacity={0.75}
                      >
                        <Text style={s.repeatFreqText}>
                          {repeatFrequency === "weekly" ? "Weekly"
                            : repeatFrequency === "biweekly" ? "Biweekly"
                            : repeatFrequency === "monthly" ? "Monthly"
                            : `Every ${customEvery} ${customUnit}`}
                          {repeatEndType === "after_count" ? ` · ${repeatEndCount}×`
                            : repeatEndType === "after_months" ? ` · ${repeatEndMonths}mo`
                            : ""}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color={theme.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}

        {/* ══════════ STEP 3: Summary ══════════ */}
        {step === 3 && (
          <>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setStep(1)} hitSlop={12} style={s.headerSide}>
                <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={s.headerTitle}>Summary</Text>
              <TouchableOpacity onPress={() => nav.replace("/(tabs)")} hitSlop={12} style={s.headerSide}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.body}>
              {/* Expense card */}
              <View style={s.expenseCard}>
                <Text style={s.expenseCardLabel}>Expense</Text>
                <Text style={s.expenseCardAmount}>{currSymbol}{total.toFixed(2)}</Text>
                <Text style={s.expenseCardDesc}>{description.trim() || "Expense"}</Text>
                {category ? (
                  <Text style={[s.expenseCardMeta, { marginTop: 6 }]}>{category}</Text>
                ) : null}
                {notes.trim() ? (
                  <Text style={[s.expenseCardNotes, { marginTop: 6 }]}>{notes.trim()}</Text>
                ) : null}
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
                            <View style={[s.friendAvatar, { backgroundColor: `${hue}${isDark ? "33" : "22"}`, borderColor: `${hue}${isDark ? "44" : "30"}` }]}>
                              <Text style={[s.friendAvatarTxt, { color: hue }]}>{person.initials}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.listRowTitle}>{person.displayName}</Text>
                              <Text style={s.listRowSub}>their share</Text>
                            </View>
                            <Text style={s.oweAmount}>{currSymbol}{person.amount.toFixed(2)}</Text>
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
                                    currency: currencyCode,
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
                            <Ionicons name="phone-portrait-outline" size={14} color={theme.textSecondary} />
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
                style={[s.primaryBtnDark, (saving || justSaved) && { opacity: justSaved ? 1 : 0.6 }, justSaved && { backgroundColor: theme.success }]}
                onPress={async () => {
                  await save();
                  if (savedRef.current) {
                    resetForm();
                    nav.back();
                  }
                }}
                disabled={saving || justSaved}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={isDark ? theme.background : "#fff"} />
                ) : justSaved ? (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color={isDark ? theme.background : "#fff"} />
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
                <Ionicons name="close" size={20} color={theme.textTertiary} />
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
                    <View style={[s.friendAvatar, { backgroundColor: `${hue}${isDark ? "33" : "22"}`, borderColor: `${hue}${isDark ? "44" : "30"}` }]}>
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
                <Ionicons name="close" size={20} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
            <View style={s.listCard}>
              {([
                { key: "equal" as SplitMethod, icon: "git-compare-outline" as const, title: "Split equally", desc: total > 0 && splitPeople.length > 0 ? `${currSymbol}${(total / splitPeople.length).toFixed(2)} each` : "Even split" },
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
                      <Ionicons name={opt.icon} size={18} color={theme.textSecondary} />
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
                  <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                <Text style={[s.pickerTitle, { flex: 1, textAlign: "center" }]}>
                  {splitMethod === "exact" ? "By amounts" : splitMethod === "percent" ? "By percentages" : "By shares"}
                </Text>
                <TouchableOpacity onPress={() => setShowSplitDetail(false)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
              <View style={s.listCard}>
                {splitPeople.map((p, i) => {
                  const hue = ACCENT[i % ACCENT.length];
                  const sh = shares.find((x) => x.key === p.key);
                  return (
                    <View key={p.key} style={[s.splitDetailRow, i < splitPeople.length - 1 && s.listRowBorder]}>
                      <View style={[s.friendAvatar, { backgroundColor: `${hue}${isDark ? "33" : "22"}`, borderColor: `${hue}${isDark ? "44" : "30"}` }]}>
                        <Text style={[s.friendAvatarTxt, { color: hue }]}>{p.name.slice(0, 2).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listRowTitle}>{p.name}</Text>
                        <Text style={s.listRowSub}>
                          {splitMethod === "shares" && `${customSplits[p.key] || "1"} share${(customSplits[p.key] || "1") === "1" ? "" : "s"}`}
                          {splitMethod === "exact" && `${currSymbol}${sh?.share.toFixed(2) ?? "0.00"}`}
                          {splitMethod === "percent" && total > 0
                            ? `= ${currSymbol}${((total * (parseFloat(customSplits[p.key] || "0") || 0)) / 100).toFixed(2)}`
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
                          placeholderTextColor={theme.textTertiary}
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
                        <Text style={{ fontSize: 12, fontFamily: font.semibold, color: theme.error }}>
                          {splitMethod === "percent"
                            ? `${(100 - inputSum).toFixed(1)}% left`
                            : `${currSymbol}${(total - inputSum).toFixed(2)} left`}
                        </Text>
                      )}
                      <Text style={[s.remainingValue, !isBalanced && { color: theme.error }]}>
                        {splitMethod === "shares" && `${inputSum.toFixed(0)} shares`}
                        {splitMethod === "exact" && `${currSymbol}${inputSum.toFixed(2)} / ${currSymbol}${total.toFixed(2)}`}
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

      {/* ── Repeat schedule picker ── */}
      <Modal visible={showRepeatPicker} transparent animationType="slide" onRequestClose={() => setShowRepeatPicker(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <Pressable style={s.sheetOverlay} onPress={() => setShowRepeatPicker(false)}>
            <Pressable style={[s.sheetCard, { maxHeight: "85%" }]} onPress={(e) => e.stopPropagation()}>
              <View style={s.sheetHandle} />
              <View style={s.pickerHead}>
                <Text style={s.pickerTitle}>Repeat schedule</Text>
                <TouchableOpacity onPress={() => setShowRepeatPicker(false)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* ── HOW OFTEN ── */}
                <Text style={[s.secLabel, { marginBottom: 8 }]}>How often</Text>
                <View style={s.listCard}>
                  {([
                    { key: "weekly" as RepeatFrequency, label: "Every week" },
                    { key: "biweekly" as RepeatFrequency, label: "Every 2 weeks" },
                    { key: "monthly" as RepeatFrequency, label: "Every month" },
                    { key: "custom" as RepeatFrequency, label: "Custom" },
                  ]).map((opt, i) => {
                    const selected = repeatFrequency === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[s.listRow, i < 3 && s.listRowBorder]}
                        onPress={() => { sfx.toggle(); setRepeatFrequency(opt.key); }}
                        activeOpacity={0.7}
                      >
                        <Text style={s.listRowTitle}>{opt.label}</Text>
                        <View style={[s.radio, selected && s.radioOn]}>
                          {selected && <View style={s.radioDot} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom interval inputs */}
                {repeatFrequency === "custom" && (
                  <View style={s.customIntervalRow}>
                    <Text style={s.customIntervalLabel}>Every</Text>
                    <TextInput
                      style={s.customIntervalInput}
                      value={customEvery}
                      onChangeText={(v) => setCustomEvery(v.replace(/[^0-9]/g, ""))}
                      keyboardType="number-pad"
                      maxLength={3}
                      selectTextOnFocus
                    />
                    {(["days", "weeks", "months"] as CustomUnit[]).map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[s.unitChip, customUnit === u && s.unitChipActive]}
                        onPress={() => { sfx.toggle(); setCustomUnit(u); }}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.unitChipText, customUnit === u && s.unitChipTextActive]}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* ── ENDS ── */}
                <Text style={[s.secLabel, { marginTop: 20, marginBottom: 8 }]}>Ends</Text>
                <View style={s.listCard}>
                  {/* Never */}
                  <TouchableOpacity
                    style={[s.listRow, s.listRowBorder]}
                    onPress={() => { sfx.toggle(); setRepeatEndType("never"); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.listRowTitle, { flex: 1 }]}>Never</Text>
                    <View style={[s.radio, repeatEndType === "never" && s.radioOn]}>
                      {repeatEndType === "never" && <View style={s.radioDot} />}
                    </View>
                  </TouchableOpacity>

                  {/* After X times */}
                  <TouchableOpacity
                    style={[s.listRow, s.listRowBorder]}
                    onPress={() => { sfx.toggle(); setRepeatEndType("after_count"); }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={s.listRowTitle}>After</Text>
                      {repeatEndType === "after_count" && (
                        <TextInput
                          style={s.customIntervalInput}
                          value={repeatEndCount}
                          onChangeText={(v) => setRepeatEndCount(v.replace(/[^0-9]/g, ""))}
                          keyboardType="number-pad"
                          maxLength={3}
                          selectTextOnFocus
                        />
                      )}
                      <Text style={s.listRowTitle}>
                        {repeatEndType === "after_count" ? "times" : `${repeatEndCount} times`}
                      </Text>
                    </View>
                    <View style={[s.radio, repeatEndType === "after_count" && s.radioOn]}>
                      {repeatEndType === "after_count" && <View style={s.radioDot} />}
                    </View>
                  </TouchableOpacity>

                  {/* After X months */}
                  <TouchableOpacity
                    style={s.listRow}
                    onPress={() => { sfx.toggle(); setRepeatEndType("after_months"); }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={s.listRowTitle}>After</Text>
                      {repeatEndType === "after_months" && (
                        <TextInput
                          style={s.customIntervalInput}
                          value={repeatEndMonths}
                          onChangeText={(v) => setRepeatEndMonths(v.replace(/[^0-9]/g, ""))}
                          keyboardType="number-pad"
                          maxLength={3}
                          selectTextOnFocus
                        />
                      )}
                      <Text style={s.listRowTitle}>
                        {repeatEndType === "after_months" ? "months" : `${repeatEndMonths} months`}
                      </Text>
                    </View>
                    <View style={[s.radio, repeatEndType === "after_months" && s.radioOn]}>
                      {repeatEndType === "after_months" && <View style={s.radioDot} />}
                    </View>
                  </TouchableOpacity>
                </View>

              </ScrollView>

              {/* Done / Cancel buttons */}
              <View style={[s.footer, { flexDirection: "row", gap: 10 }]}>
                <TouchableOpacity
                  style={[s.primaryBtnDark, { flex: 1 }]}
                  onPress={() => { setRepeatEnabled(true); setShowRepeatPicker(false); }}
                  activeOpacity={0.85}
                >
                  <Text style={s.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={{ alignItems: "center", paddingBottom: 8 }}
                onPress={() => { setRepeatEnabled(false); setShowRepeatPicker(false); }}
              >
                <Text style={{ fontFamily: font.semibold, fontSize: 14, color: theme.negative }}>Don&apos;t repeat</Text>
              </TouchableOpacity>
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
              <TouchableOpacity onPress={() => { setShowAddFriend(false); setNewFriendPhone(""); }}>
                <Ionicons name="close" size={22} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
            <TextInput style={s.modalIn} value={newFriendName} onChangeText={setNewFriendName} placeholder="Name" placeholderTextColor={theme.textTertiary} maxLength={100} />
            <TextInput
              style={[s.modalIn, { marginTop: 10 }]}
              value={newFriendEmail}
              onChangeText={setNewFriendEmail}
              placeholder="Email (optional)"
              placeholderTextColor={theme.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={254}
            />
            <TextInput
              style={[s.modalIn, { marginTop: 10 }]}
              value={newFriendPhone}
              onChangeText={setNewFriendPhone}
              placeholder="Phone (optional)"
              placeholderTextColor={theme.textTertiary}
              keyboardType="phone-pad"
              maxLength={30}
            />
            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 16 }, (!newFriendName.trim() || addingNewPerson) && { opacity: 0.5 }]}
              onPress={addNewFriend}
              disabled={!newFriendName.trim() || addingNewPerson}
            >
              {addingNewPerson ? <ActivityIndicator color={isDark ? theme.background : "#fff"} /> : <Text style={s.primaryBtnText}>Add & select</Text>}
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
              <Ionicons name="checkmark-circle" size={36} color={theme.success} />
              <Text style={s.sheetTitle}>Expense saved</Text>
              <Text style={s.sheetSub}>
                ${total.toFixed(2)} · {description.trim() || "Expense"} · {targetLabel}
              </Text>
            </View>

            <Text style={s.sheetHint}>Collect payment</Text>

            <TouchableOpacity style={s.sheetBtn} onPress={goTapToPay} activeOpacity={0.85}>
              <Ionicons name="phone-portrait-outline" size={20} color={isDark ? theme.background : "#fff"} />
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
              <Ionicons name="logo-usd" size={18} color={theme.text} />
              <Text style={s.sheetBtnOutlineTxt}>{venmoOther ? "Request with Venmo" : "Venmo not linked"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.sheetBtnOutline, { opacity: 0.4 }]}
              disabled
              activeOpacity={0.85}
            >
              <Ionicons name="logo-paypal" size={18} color={theme.text} />
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

function createStyles(theme: ThemeColors, isDark: boolean) {
return StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.background },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  headerSide: { width: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: font.black, color: theme.text, textAlign: "center" },

  body: { paddingHorizontal: 20, paddingBottom: 40 },
  footer: { paddingHorizontal: 20, paddingBottom: 34, paddingTop: 10 },

  secLabel: { fontSize: 11, fontFamily: font.extrabold, color: theme.textTertiary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },

  // Search bar (step 1)
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, height: 44,
    backgroundColor: theme.card, borderRadius: radii.lg, borderWidth: 1, borderColor: theme.cardBorder, marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: font.regular, color: theme.text },

  // List card (shared)
  listCard: { backgroundColor: theme.card, borderRadius: radii["2xl"], borderWidth: 1, borderColor: theme.cardBorder, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
  listRowTitle: { fontSize: 15, fontFamily: font.semibold, color: theme.text },
  listRowSub: { fontSize: 12, fontFamily: font.regular, color: theme.textTertiary, marginTop: 1 },

  // Group icon (step 1)
  groupEmoji: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.surfaceSecondary, borderWidth: 1, borderColor: theme.cardBorder,
    alignItems: "center", justifyContent: "center",
  },
  groupIconImg: {
    width: 40, height: 40, borderRadius: 12,
  },

  // Friend avatar
  friendAvatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, alignItems: "center", justifyContent: "center",
  },
  friendAvatarTxt: { fontSize: 14, fontFamily: font.bold },

  // Radio button
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.cardBorder, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: theme.text, backgroundColor: theme.text },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },

  // Add friend row
  addFriendRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  addFriendTxt: { fontFamily: font.semibold, fontSize: 15, color: isDark ? theme.accent : theme.primary },

  // Unified compose: person row
  withRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingVertical: 10, gap: 6 },
  withLabel: { fontFamily: font.medium, fontSize: 14, color: theme.textSecondary, lineHeight: 26 },
  withChipsWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  withChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: theme.surfaceSecondary, borderRadius: 14,
    paddingLeft: 8, paddingRight: 4, paddingVertical: 3,
    borderWidth: 1, borderColor: theme.cardBorder,
  },
  inlineSearchInput: { flex: 1, minWidth: 80, fontSize: 14, fontFamily: font.regular, color: theme.text, paddingVertical: 2 },
  withDivider: { height: 1, backgroundColor: theme.borderLight, marginHorizontal: 20 },

  // Unified compose: compact form
  compactForm: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  compactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  compactIcon: { width: 32, alignItems: "center", justifyContent: "center" },
  compactDescInput: { flex: 1, fontSize: 16, fontFamily: font.semibold, color: theme.text },
  compactSep: { height: 1, backgroundColor: theme.borderLight, marginLeft: 44 },
  compactAmountInput: { flex: 1, fontSize: 28, fontFamily: font.bold, color: theme.text },

  splitChipRow: {
    alignSelf: "center", marginTop: 20, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: theme.card, borderRadius: radii.lg, borderWidth: 1, borderColor: theme.cardBorder,
  },
  splitChipText: { fontSize: 13, fontFamily: font.medium, color: theme.textSecondary },

  // Repeat toggle
  repeatRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 20, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: theme.card, borderRadius: radii.lg,
    borderWidth: 1, borderColor: theme.cardBorder,
  },
  repeatRowActive: {
    borderColor: isDark ? theme.accent : theme.primary, backgroundColor: theme.surfaceSecondary,
  },
  repeatLabel: {
    flex: 1, fontSize: 14, fontFamily: font.semibold, color: theme.text,
  },
  repeatFreqChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: theme.surfaceSecondary, borderRadius: 8,
    borderWidth: 1, borderColor: theme.cardBorder,
  },
  repeatFreqText: {
    fontSize: 12, fontFamily: font.bold, color: theme.textSecondary,
  },
  customIntervalRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 12, paddingHorizontal: 4,
  },
  customIntervalLabel: {
    fontSize: 14, fontFamily: font.semibold, color: theme.text,
  },
  customIntervalInput: {
    width: 52, fontSize: 16, fontFamily: font.bold, color: theme.text,
    textAlign: "center", paddingVertical: 6,
    backgroundColor: theme.surfaceSecondary, borderRadius: 8,
    borderWidth: 1, borderColor: theme.cardBorder,
  },
  unitChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: theme.cardBorder,
    backgroundColor: theme.card,
  },
  unitChipActive: {
    borderColor: isDark ? theme.accent : theme.primary, backgroundColor: theme.surfaceSecondary,
  },
  unitChipText: {
    fontSize: 13, fontFamily: font.semibold, color: theme.textTertiary,
  },
  unitChipTextActive: {
    color: theme.text,
  },

  // Step 2: text field
  textField: {
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: radii["2xl"],
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: font.semibold, color: theme.text,
  },
  categoryChipsScroll: { marginHorizontal: -4, flexGrow: 0 },
  categoryChipsContent: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2, paddingHorizontal: 4 },
  categoryChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radii.lg, borderWidth: 1, borderColor: theme.cardBorder,
    backgroundColor: theme.card, flexShrink: 0,
  },
  categoryChipSelected: {
    borderColor: isDark ? theme.accent : theme.primary, backgroundColor: theme.surfaceSecondary,
  },
  categoryChipLabel: { fontSize: 13, fontFamily: font.semibold, color: theme.textSecondary, maxWidth: 140 },
  categoryChipLabelSelected: { color: theme.text },
  notesField: {
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: radii["2xl"],
    paddingHorizontal: 16, paddingVertical: 12, minHeight: 72,
    fontSize: 14, fontFamily: font.regular, color: theme.text,
  },
  amountField: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: radii["2xl"],
    paddingHorizontal: 16, paddingVertical: 14,
  },
  amountPrefix: { fontSize: 20, fontFamily: font.bold, color: theme.textSecondary },
  amountFieldInput: { flex: 1, fontSize: 24, fontFamily: font.bold, color: theme.text },

  // Paid by + split row (step 2)
  paidSplitRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap",
    gap: 4, paddingVertical: 16, paddingHorizontal: 18, marginTop: 24,
    backgroundColor: theme.card, borderRadius: radii["2xl"], borderWidth: 1, borderColor: theme.cardBorder,
  },
  paidSplitChip: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12,
    backgroundColor: theme.surfaceSecondary, borderWidth: 1, borderColor: theme.cardBorder,
  },
  paidSplitChipTxt: { fontSize: 13, fontFamily: font.bold, color: theme.text },

  eqHint: { textAlign: "center", fontFamily: font.bold, fontSize: 14, color: theme.textTertiary, marginTop: 8 },

  // Step 3: expense card
  expenseCard: {
    backgroundColor: theme.card, borderRadius: radii["2xl"], borderWidth: 1, borderColor: theme.cardBorder,
    padding: 20,
  },
  expenseCardLabel: { fontSize: 11, fontFamily: font.extrabold, color: theme.textTertiary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  expenseCardAmount: { fontSize: 32, fontFamily: font.black, color: theme.text, letterSpacing: -1 },
  expenseCardDesc: { fontSize: 15, fontFamily: font.semibold, color: theme.text, marginTop: 4 },
  expenseCardMeta: { fontSize: 13, fontFamily: font.regular, color: theme.textTertiary, marginTop: 4 },
  expenseCardNotes: { fontSize: 13, fontFamily: font.regular, color: theme.textSecondary, lineHeight: 18 },

  // Step 3: owe rows
  oweRow: { paddingVertical: 12, paddingHorizontal: 8 },
  oweTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  oweAmount: { fontSize: 18, fontFamily: font.black, color: theme.text },
  tapToPayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, borderRadius: radii.lg,
    backgroundColor: theme.surfaceSecondary, borderWidth: 1, borderColor: theme.cardBorder,
  },
  tapToPayBtnTxt: { fontSize: 13, fontFamily: font.bold, color: theme.textSecondary },

  // Picker / modal headers
  pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 16 },
  pickerTitle: { fontSize: 20, fontFamily: font.black, color: theme.text },

  // Split method rows
  splitMethodRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, paddingHorizontal: 12 },
  splitMethodIcon: { width: 40, height: 40, borderRadius: radii.lg, backgroundColor: theme.surfaceSecondary, alignItems: "center", justifyContent: "center" },

  // Split detail
  splitDetailRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12 },
  splitDetailInputWrap: {
    width: 80, backgroundColor: theme.surfaceSecondary, borderWidth: 1, borderColor: theme.cardBorder,
    borderRadius: radii.lg, paddingHorizontal: 12,
  },
  splitDetailInput: { fontSize: 16, fontFamily: font.bold, color: theme.text, paddingVertical: 8, textAlign: "right" },
  remainingRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 16, marginHorizontal: 4, paddingVertical: 16, paddingHorizontal: 16,
    backgroundColor: theme.card, borderRadius: radii["2xl"], borderWidth: 1, borderColor: theme.cardBorder,
  },
  remainingLabel: { fontSize: 13, fontFamily: font.extrabold, color: theme.textTertiary, textTransform: "uppercase", letterSpacing: 0.8 },
  remainingValue: { fontSize: 18, fontFamily: font.black, color: theme.text },

  // Dup warning
  dupBanner: { flexDirection: "row", flexWrap: "wrap", gap: 10, backgroundColor: "rgba(251,191,36,0.12)", borderWidth: 1, borderColor: "rgba(251,191,36,0.4)", borderRadius: radii.lg, padding: 12, marginTop: 16 },
  dupText: { flex: 1, fontSize: 13, fontFamily: font.regular, color: theme.textSecondary, lineHeight: 18 },
  dupSaveAnyway: { marginTop: 6, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: prototype.amber },
  dupSaveAnywayTxt: { fontSize: 13, fontFamily: font.bold, color: "#fff" },

  bankContextCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.surfaceSecondary, borderRadius: radii.lg, borderWidth: 1, borderColor: theme.cardBorder,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  bankContextMerchant: { fontSize: 14, fontFamily: font.bold, color: theme.text },
  bankContextMeta: { fontSize: 12, fontFamily: font.regular, color: theme.textTertiary, marginTop: 1 },
  bankContextAmt: { fontSize: 16, fontFamily: font.black, color: theme.text },

  err: { fontFamily: font.medium, fontSize: 13, color: theme.negative, marginTop: 8, textAlign: "center" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: isDark ? theme.text : theme.primary, paddingVertical: 16, borderRadius: radii.lg,
  },
  primaryBtnDark: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.text, paddingVertical: 16, borderRadius: radii.lg,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 16, color: isDark ? theme.background : "#fff" },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.overlay, justifyContent: "center", paddingHorizontal: 24, zIndex: 20 },
  modalCard: { backgroundColor: theme.card, borderRadius: radii["2xl"], padding: 20, borderWidth: 1, borderColor: theme.cardBorder },
  modalHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { fontFamily: font.bold, fontSize: 18, color: theme.text },
  modalIn: { backgroundColor: theme.surfaceSecondary, borderWidth: 1, borderColor: theme.cardBorder, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: font.regular, color: theme.text },

  inviteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#8B5CF622",
    borderWidth: 1,
    borderColor: "#8B5CF644",
  },
  inviteBtnTxt: {
    fontSize: 13,
    fontFamily: font.medium,
    color: "#8B5CF6",
  },

  // Settlement sheet
  sheetOverlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: "flex-end" },
  sheetCard: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 40 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.borderLight, alignSelf: "center", marginTop: 10, marginBottom: 16 },
  sheetHeader: { alignItems: "center", marginBottom: 20 },
  sheetTitle: { fontFamily: font.black, fontSize: 22, color: theme.text, marginTop: 10 },
  sheetSub: { fontFamily: font.regular, fontSize: 14, color: theme.textSecondary, marginTop: 6, textAlign: "center" },
  sheetHint: { fontFamily: font.extrabold, fontSize: 11, color: theme.textTertiary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  sheetBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: isDark ? theme.text : theme.primary, paddingVertical: 16, borderRadius: radii.lg, marginBottom: 10,
  },
  sheetBtnTxt: { fontFamily: font.bold, fontSize: 16, color: isDark ? theme.background : "#fff" },
  sheetBtnAmt: { fontFamily: font.regular, fontSize: 14, color: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)" },
  sheetBtnOutline: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: radii.lg, borderWidth: 1, borderColor: theme.cardBorder,
    backgroundColor: theme.card, marginBottom: 10,
  },
  sheetBtnOutlineTxt: { fontFamily: font.bold, fontSize: 15, color: theme.text },
  sheetDone: { alignItems: "center", marginTop: 8, paddingVertical: 12 },
  sheetDoneTxt: { fontFamily: font.semibold, fontSize: 15, color: theme.textSecondary },
});
}
