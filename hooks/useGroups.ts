import { useState, useEffect, useCallback, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApiFetch, getPersistedResponse, invalidateApiCache } from "../lib/api";
import { getCacheGeneration } from "../lib/api-cache";
import {
  applySettlementToFriendBalance,
  applySettlementToGroupDetail,
  applySettlementToGroupSummary,
  applySettlementToPersonDetail,
  buildOptimisticSettlementActivity,
  rebuildSummary,
  type OptimisticSettlementRequest,
} from "../lib/optimistic-settlement";

export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
  groupType?: string | null;
  imageUrl?: string | null;
  /** Net for you in this group when exactly one currency is outstanding; otherwise null. */
  myBalance: number | null;
  /** Per-currency net for you in this group (Splitwise-style; never add across currencies). */
  myBalances: Array<{ currency: string; amount: number }>;
  lastActivityAt: string;
}

export interface FriendBalance {
  key: string;
  displayName: string;
  /** Single-currency shortcut when `balances.length === 1`; null when multiple currencies. */
  balance: number | null;
  balances: Array<{ currency: string; amount: number }>;
  lastActivityAt?: string | null;
  image_url?: string | null;
  /** Pre-resolved friend group ID (2-person "friend" type group). Eliminates /api/groups/person round trip. */
  friendGroupId?: string;
  friendGroupMembers?: Array<{ id: string; user_id: string | null; display_name: string }>;
}

export interface CurrencyTotalsRow {
  currency: string;
  owedToMe: number;
  iOwe: number;
  net: number;
}

export interface GroupsSummary {
  groups: GroupSummary[];
  friends: FriendBalance[];
  /** Headline totals when a single currency; null when multiple (use `totalsByCurrency`). */
  totalOwedToMe: number | null;
  totalIOwe: number | null;
  netBalance: number | null;
  totalsByCurrency: CurrencyTotalsRow[];
}

/**
 * Module-level cache keyed by summary path. Survives across component
 * mount/unmount so navigating to the Shared tab after the home tab has
 * already fetched doesn't wait on AsyncStorage.
 */
const _memSummary = new Map<string, GroupsSummary>();
const _summaryListeners = new Map<string, Set<(summary: GroupsSummary | null) => void>>();

function _emitSummary(path: string, summary: GroupsSummary | null) {
  _summaryListeners.get(path)?.forEach((fn) => fn(summary));
}

function _setMemSummary(path: string, summary: GroupsSummary) {
  _memSummary.set(path, summary);
  _emitSummary(path, summary);
}

/** Clear the in-memory summary cache (call alongside invalidateApiCache). */
export function clearMemSummaryCache() {
  _memSummary.clear();
}

/** Nuclear: wipe every in-memory shared/split cache. */
export function clearAllSharedCaches() {
  _memSummary.clear();
  _memGroupDetail.clear();
  _memPersonDetail.clear();
  _memTxDetail.clear();
  _memActivity = null;
  _lastSeenGen = getCacheGeneration();
}

/**
 * Generation-based auto-clear: if any mutation bumped the cache generation
 * since we last checked, all _mem* caches are stale. Call this at the top
 * of any hook fetch path to auto-detect staleness without manual invalidation.
 */
let _lastSeenGen = 0;
export function syncCacheGeneration() {
  const current = getCacheGeneration();
  if (current !== _lastSeenGen) {
    _lastSeenGen = current;
    _memSummary.clear();
    _memGroupDetail.clear();
    _memPersonDetail.clear();
    _memTxDetail.clear();
    _memActivity = null;
  }
}

export interface GroupMember {
  id: string;
  user_id: string | null;
  email: string | null;
  display_name: string;
  image_url?: string | null;
  venmo_username?: string | null;
  cashapp_cashtag?: string | null;
  paypal_username?: string | null;
}

export interface GroupDetail {
  id: string;
  name: string;
  isOwner?: boolean;
  /** Clerk user id of the group owner; used to mark the owner row in the member list. */
  owner_id?: string | null;
  invite_token?: string | null;
  image_url?: string | null;
  group_type?: string | null;
  /** ISO timestamp when archived; null/undefined = active */
  archivedAt?: string | null;
  members: GroupMember[];
  activity: Array<{
    id: string;
    merchant: string;
    amount: number;
    currency: string;
    paidBy: string;
    splitCount: number;
    createdAt: string;
    receiptUrl?: string | null;
  }>;
  balances: Array<{
    memberId: string;
    currency: string;
    paid: number;
    owed: number;
    total: number;
  }>;
  suggestions: Array<{
    currency: string;
    fromMemberId: string;
    toMemberId: string;
    amount: number;
    fromMember?: GroupMember;
    toMember?: GroupMember;
  }>;
  /** Total paid into the group when one currency; null when expenses use multiple currencies. */
  totalSpend: number | null;
  totalSpendByCurrency: Array<{ currency: string; amount: number }>;
  /** Current user's share of all split expenses (single currency); null if multi-currency. */
  mySpend?: number | null;
  mySpendByCurrency?: Array<{ currency: string; amount: number }>;
  categoryBreakdown?: Array<{ category: string; amount: number; percent: number }>;
}

export interface PersonDetail {
  displayName: string;
  image_url?: string | null;
  /** One currency only; null when multiple currencies outstanding. */
  balance: number | null;
  currencyBalances: Array<{ currency: string; amount: number }>;
  activity: Array<{
    id: string;
    merchant: string;
    amount: number;
    currency: string;
    groupName: string;
    groupType?: string | null;
    paidByMe: boolean;
    paidByThem: boolean;
    myShare: number;
    theirShare: number;
    effectOnBalance: number;
    createdAt: string;
    receiptUrl?: string | null;
  }>;
  email: string | null;
  key: string;
  settlements?: Array<{
    groupId: string;
    fromMemberId: string;
    toMemberId: string;
    amount: number;
    currency: string;
  }>;
  p2pHandles?: {
    venmo_username: string | null;
    cashapp_cashtag: string | null;
    paypal_username: string | null;
  };
}

export type UseGroupsSummaryOptions = {
  /**
   * When true, GET /api/groups/summary?contacts=1 — all group members & groups (incl. $0 net).
   * Home / Shared / Insights use this so imported Splitwise data appears even when every balance is settled.
   * Default (false) = unsettled-only (matches Splitwise’s “you owe / owed” lists).
   */
  contacts?: boolean;
};

export function useGroupsSummary(options?: UseGroupsSummaryOptions) {
  syncCacheGeneration();
  const contacts = options?.contacts === true;
  const summaryPath = contacts ? "/api/groups/summary?contacts=1" : "/api/groups/summary";
  const apiFetch = useApiFetch();

  const mem = _memSummary.get(summaryPath) ?? null;
  const [summary, setSummary] = useState<GroupsSummary | null>(mem);
  const [loading, setLoading] = useState(!mem);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  const fetchSummary = useCallback(
    async (_showLoading = false) => {
      // Never set loading=true once we already have data — the caller
      // should treat refetch as a silent background refresh so the user
      // never sees a spinner or skeleton when switching tabs.
      const hasData = _memSummary.has(summaryPath) || summary != null;
      if (!hasData) setLoading(true);
      try {
        const res = await apiFetch(summaryPath);
        if (res.ok) {
          retryCount.current = 0;
          const data = await res.json();
          if (__DEV__) {
            if (__DEV__) console.log(
              "[summary]",
              contacts ? "contacts" : "outstanding",
              `friends: ${data.friends?.length ?? 0}`,
              `groups: ${data.groups?.length ?? 0}`
            );
          }
          _setMemSummary(summaryPath, data);
          setSummary(data);
        } else if (res.status === 429 || res.status === 503 || res.status >= 500) {
          if (retryCount.current < 5) {
            retryCount.current += 1;
            const delay = Math.min(3000 * Math.pow(1.5, retryCount.current - 1), 15000);
            if (__DEV__) console.log(`[summary] retry ${retryCount.current}/5 in ${delay}ms`);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => fetchSummary(false), delay);
          }
        }
        // Never setSummary(null) on error — keep stale data visible
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiFetch, summaryPath, contacts]
  );

  // Clears local state AND API-level cache, then refetches. Use for pull-to-refresh
  // and after mutations so the UI doesn't show stale balances.
  const forceRefetch = useCallback(async () => {
    _memSummary.delete(summaryPath);
    invalidateApiCache(summaryPath);
    setSummary(null);
    setLoading(true);
    await fetchSummary(false);
  }, [fetchSummary, summaryPath]);

  useEffect(() => {
    retryCount.current = 0;
    let cancelled = false;

    // If we already have in-memory data (from prefetch or previous mount),
    // skip the AsyncStorage read and go straight to network refresh.
    if (_memSummary.has(summaryPath)) {
      const cached = _memSummary.get(summaryPath)!;
      setSummary(cached);
      setLoading(false);
      fetchSummary(false);
      return () => {
        cancelled = true;
        if (retryTimer.current) clearTimeout(retryTimer.current);
      };
    }

    fetchSummary(false);
    getPersistedResponse(summaryPath).then((cached) => {
      if (cached && !cancelled && !_memSummary.has(summaryPath)) {
        try {
          const data = JSON.parse(cached.body);
          _setMemSummary(summaryPath, data);
          setSummary(data);
          setLoading(false);
        } catch { /* corrupt cache */ }
      }
    });

    return () => {
      cancelled = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSummary]);

  useEffect(() => {
    const listeners = _summaryListeners.get(summaryPath) ?? new Set<(summary: GroupsSummary | null) => void>();
    const onSummary = (next: GroupsSummary | null) => {
      setSummary(next);
      setLoading(false);
    };
    listeners.add(onSummary);
    _summaryListeners.set(summaryPath, listeners);
    return () => {
      listeners.delete(onSummary);
      if (listeners.size === 0) _summaryListeners.delete(summaryPath);
    };
  }, [summaryPath]);

  return { summary, loading, refetch: fetchSummary, forceRefetch };
}

/**
 * Call from the home tab (or any early screen) to warm the contacts summary
 * cache in the background. When the user later navigates to Shared, the hook
 * picks up _memSummary instantly — no spinner.
 */
export function usePrefetchContactsSummary(delayMs = 0) {
  const apiFetch = useApiFetch();
  useEffect(() => {
    const path = "/api/groups/summary?contacts=1";
    if (_memSummary.has(path)) return;
    let cancelled = false;
    const run = async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (cancelled) return;
      try {
        const [persisted, res] = await Promise.all([
          getPersistedResponse(path),
          apiFetch(path),
        ]);
        if (persisted && !_memSummary.has(path)) {
          try {
            _setMemSummary(path, JSON.parse(persisted.body));
          } catch { /* corrupt */ }
        }
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          _setMemSummary(path, data);
        }
      } catch { /* best-effort */ }
    };
    void run();
    return () => { cancelled = true; };
  }, [apiFetch, delayMs]);
}

const _memGroupDetail = new Map<string, GroupDetail>();
const _groupDetailListeners = new Map<string, Set<(detail: GroupDetail | null) => void>>();

function _emitGroupDetail(id: string, detail: GroupDetail | null) {
  _groupDetailListeners.get(id)?.forEach((fn) => fn(detail));
}

function _setMemGroupDetail(id: string, detail: GroupDetail) {
  _memGroupDetail.set(id, detail);
  _emitGroupDetail(id, detail);
}

export function useGroupDetail(id: string | null) {
  syncCacheGeneration();
  const apiFetch = useApiFetch();
  const cached = id ? _memGroupDetail.get(id) ?? null : null;
  const [detail, setDetail] = useState<GroupDetail | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const prevId = useRef(id);
  const hasDetail = useRef(!!cached);
  const hydratedFromDisk = useRef(false);

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!id) {
        setDetail(null);
        hasDetail.current = false;
        setLoading(false);
        return;
      }
      if (!silent && !hasDetail.current) setLoading(true);
      try {
        let res = await apiFetch(`/api/groups/${id}`);
        if (!res.ok && !hasDetail.current) {
          await new Promise((r) => setTimeout(r, 500));
          invalidateApiCache(`/api/groups/${id}`);
          res = await apiFetch(`/api/groups/${id}`);
        }
        if (res.ok) {
          const data = await res.json();
          _setMemGroupDetail(id, data);
          setDetail(data);
          hasDetail.current = true;
        } else if (!hasDetail.current) {
          setDetail(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [id, apiFetch]
  );

  useEffect(() => {
    if (prevId.current !== id) {
      const mem = id ? _memGroupDetail.get(id) ?? null : null;
      if (mem) {
        setDetail(mem);
        hasDetail.current = true;
        setLoading(false);
      } else {
        setDetail(null);
        hasDetail.current = false;
      }
      hydratedFromDisk.current = false;
      prevId.current = id;
    }
    if (!id) { fetchDetail(); return; }

    if (!hydratedFromDisk.current) {
      hydratedFromDisk.current = true;
      fetchDetail(false);
      getPersistedResponse(`/api/groups/${id}`).then((cached) => {
        if (cached && !hasDetail.current) {
          try {
            const data = JSON.parse(cached.body);
            setDetail(data);
            hasDetail.current = true;
            setLoading(false);
          } catch { /* ignore corrupt cache */ }
        }
      });
    } else {
      fetchDetail(hasDetail.current);
    }
  }, [fetchDetail, id]);

  useEffect(() => {
    if (!id) return;
    const listeners = _groupDetailListeners.get(id) ?? new Set<(detail: GroupDetail | null) => void>();
    const onDetail = (next: GroupDetail | null) => {
      setDetail(next);
      setLoading(false);
      hasDetail.current = !!next;
    };
    listeners.add(onDetail);
    _groupDetailListeners.set(id, listeners);
    return () => {
      listeners.delete(onDetail);
      if (listeners.size === 0) _groupDetailListeners.delete(id);
    };
  }, [id]);

  return { detail, loading, refetch: fetchDetail };
}

const PERSON_POLL_BASE_MS = 30_000;
const PERSON_POLL_MID_MS = 60_000;
const PERSON_POLL_SLOW_MS = 120_000;

const _memPersonDetail = new Map<string, PersonDetail>();
const _personDetailListeners = new Map<string, Set<(detail: PersonDetail | null) => void>>();

function _emitPersonDetail(key: string, detail: PersonDetail | null) {
  _personDetailListeners.get(key)?.forEach((fn) => fn(detail));
}

function _setMemPersonDetail(key: string, detail: PersonDetail) {
  _memPersonDetail.set(key, detail);
  _emitPersonDetail(key, detail);
}

export function usePersonDetail(key: string | null) {
  syncCacheGeneration();
  const apiFetch = useApiFetch();
  const cached = key ? _memPersonDetail.get(key) ?? null : null;
  const [detail, setDetail] = useState<PersonDetail | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const prevKey = useRef(key);
  const hasDetail = useRef(!!cached);
  const pollCount = useRef(0);

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!key) {
        setDetail(null);
        hasDetail.current = false;
        setLoading(false);
        return;
      }
      if (!silent && !hasDetail.current) setLoading(true);
      try {
        const res = await apiFetch(
          `/api/groups/person?key=${encodeURIComponent(key)}`
        );
        if (res.ok) {
          const data = await res.json();
          _setMemPersonDetail(key, data);
          setDetail(data);
          hasDetail.current = true;
        } else if (!hasDetail.current) {
          setDetail(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [key, apiFetch]
  );

  const refetch = useCallback(
    (silent = false) => {
      pollCount.current = 0;
      return fetchDetail(silent);
    },
    [fetchDetail]
  );

  useEffect(() => {
    if (prevKey.current !== key) {
      const mem = key ? _memPersonDetail.get(key) ?? null : null;
      if (mem) {
        setDetail(mem);
        hasDetail.current = true;
        setLoading(false);
      } else {
        setDetail(null);
        hasDetail.current = false;
      }
      prevKey.current = key;
      pollCount.current = 0;
    }
    fetchDetail(hasDetail.current);
  }, [fetchDetail, key]);

  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const interval =
        pollCount.current >= 10 ? PERSON_POLL_SLOW_MS :
        pollCount.current >= 5  ? PERSON_POLL_MID_MS :
        PERSON_POLL_BASE_MS;
      timer = setTimeout(() => {
        pollCount.current += 1;
        fetchDetail(true).then(schedule, schedule);
      }, interval);
    };
    schedule();
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        clearTimeout(timer); // pause polling when backgrounded
      } else {
        schedule(); // resume polling when app comes back
      }
    });
    return () => { clearTimeout(timer); appStateSub.remove(); };
  }, [key, fetchDetail]);

  useEffect(() => {
    if (!key) return;
    const listeners = _personDetailListeners.get(key) ?? new Set<(detail: PersonDetail | null) => void>();
    const onDetail = (next: PersonDetail | null) => {
      setDetail(next);
      setLoading(false);
      hasDetail.current = !!next;
    };
    listeners.add(onDetail);
    _personDetailListeners.set(key, listeners);
    return () => {
      listeners.delete(onDetail);
      if (listeners.size === 0) _personDetailListeners.delete(key);
    };
  }, [key]);

  return { detail, loading, refetch };
}

export interface TransactionDetail {
  id: string;
  description: string;
  amount: number | null;
  currency: string;
  date: string | null;
  createdAt: string;
  groupName: string | null;
  groupId: string;
  groupType?: string | null;
  paidBy: { memberId: string; displayName: string; isMe: boolean; image_url?: string | null } | null;
  shares: Array<{ memberId: string; displayName: string; isMe: boolean; amount: number; image_url?: string | null }>;
  notes: string | null;
  category: string | null;
  receiptUrl: string | null;
}

const _memTxDetail = new Map<string, TransactionDetail>();

export function useTransactionDetail(id: string | null) {
  syncCacheGeneration();
  const apiFetch = useApiFetch();
  const cached = id ? _memTxDetail.get(id) ?? null : null;
  const [detail, setDetail] = useState<TransactionDetail | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const prevId = useRef(id);
  const hasDetail = useRef(!!cached);

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!id) {
        setDetail(null);
        hasDetail.current = false;
        setLoading(false);
        return;
      }
      if (!silent && !hasDetail.current) setLoading(true);
      try {
        const res = await apiFetch(`/api/groups/transaction?id=${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json();
          _memTxDetail.set(id, data);
          setDetail(data);
          hasDetail.current = true;
        } else if (!silent) {
          setDetail(null);
          hasDetail.current = false;
        }
      } finally {
        setLoading(false);
      }
    },
    [id, apiFetch]
  );

  useEffect(() => {
    if (prevId.current !== id) {
      const mem = id ? _memTxDetail.get(id) ?? null : null;
      if (mem) {
        setDetail(mem);
        hasDetail.current = true;
        setLoading(false);
      } else {
        setDetail(null);
        hasDetail.current = false;
      }
      prevId.current = id;
    }
    fetchDetail(hasDetail.current);
  }, [fetchDetail, id]);

  return { detail, loading, refetch: fetchDetail };
}

export interface RecentActivityItem {
  id: string;
  who: string;
  action: string;
  what: string;
  in: string;
  direction: "get_back" | "owe" | "settled";
  amount: number;
  currency?: string;
  time: string;
  receiptUrl?: string | null;
}

const ACTIVITY_PATH = "/api/groups/recent-activity";
let _memActivity: RecentActivityItem[] | null = null;
const _activityListeners = new Set<(items: RecentActivityItem[]) => void>();

function _setMemActivity(items: RecentActivityItem[]) {
  _memActivity = items;
  _activityListeners.forEach((fn) => fn(items));
}

/** Clear the in-memory activity cache (call alongside invalidateApiCache). */
export function clearMemActivityCache() {
  _memActivity = null;
}

const LAST_SEEN_KEY = "coconut.activity.lastSeenId";
let _lastSeenActivityId: string | null = null;
let _lastSeenLoaded = false;
let _hasUnseen = false;
const _unseenListeners = new Set<(v: boolean) => void>();

function _setHasUnseen(v: boolean) {
  if (_hasUnseen === v) return;
  _hasUnseen = v;
  _unseenListeners.forEach((fn) => fn(v));
}

async function _loadLastSeen(): Promise<string | null> {
  if (_lastSeenLoaded) return _lastSeenActivityId;
  _lastSeenLoaded = true;
  try {
    const v = await AsyncStorage.getItem(LAST_SEEN_KEY);
    if (v) _lastSeenActivityId = v;
  } catch { /* non-fatal */ }
  return _lastSeenActivityId;
}

// Eagerly start loading the persisted value at module init
_loadLastSeen();

// Eagerly hydrate _memActivity from disk cache at module init so the
// Activity tab can render instantly even before usePrefetchActivity completes.
getPersistedResponse(ACTIVITY_PATH).then((cached) => {
  if (cached && !_memActivity) {
    try {
      const items = JSON.parse(cached.body).activity ?? [];
      _setMemActivity(items);
    } catch { /* corrupt cache */ }
  }
});

/** Mark all current activity as "seen" — call when the Activity tab is focused. */
export function markActivitySeen() {
  if (_memActivity?.[0]) {
    _lastSeenActivityId = _memActivity[0].id;
    AsyncStorage.setItem(LAST_SEEN_KEY, _memActivity[0].id).catch(() => {});
  }
  _setHasUnseen(false);
}

/** Hook that returns true when there's unseen activity (for badge dot). */
export function useHasUnseenActivity(): boolean {
  const [unseen, setUnseen] = useState(_hasUnseen);
  useEffect(() => {
    _unseenListeners.add(setUnseen);
    setUnseen(_hasUnseen);
    return () => { _unseenListeners.delete(setUnseen); };
  }, []);
  return unseen;
}

const ACTIVITY_DEBOUNCE_MS = 2_000;

export function useRecentActivity(enabled = true) {
  syncCacheGeneration();
  const apiFetch = useApiFetch();
  const mem = _memActivity;
  const [activity, setActivity] = useState<RecentActivityItem[]>(mem ?? []);
  const [loading, setLoading] = useState(!mem);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const lastFetchTs = useRef(0);
  const hydratedRef = useRef(!!mem);

  const fetchActivity = useCallback(async (force = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const now = Date.now();
    if (!force && now - lastFetchTs.current < ACTIVITY_DEBOUNCE_MS) return;
    lastFetchTs.current = now;
    try {
      const res = await apiFetch(ACTIVITY_PATH);
      if (res.ok) {
        retryCount.current = 0;
        const data = await res.json();
        const items: RecentActivityItem[] = data.activity ?? [];
        _setMemActivity(items);
        setActivity(items);
        if (items[0] && items[0].id !== _lastSeenActivityId) {
          _setHasUnseen(true);
        }
      } else if (res.status === 429 || res.status === 503 || res.status >= 500) {
        if (retryCount.current < 5) {
          retryCount.current += 1;
          const delay = Math.min(3000 * Math.pow(1.5, retryCount.current - 1), 15000);
          if (__DEV__) console.log(`[activity] retry ${retryCount.current}/5 in ${delay}ms`);
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => fetchActivity(), delay);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, enabled]);

  // Subscribe to _memActivity changes from prefetch / disk hydration so the
  // hook picks up data even if it arrived after this component mounted.
  useEffect(() => {
    const onActivity = (items: RecentActivityItem[]) => {
      hydratedRef.current = true;
      setActivity(items);
      setLoading(false);
    };
    _activityListeners.add(onActivity);
    // Catch the case where _memActivity was set between useState init and this effect
    if (_memActivity && !hydratedRef.current) {
      hydratedRef.current = true;
      setActivity(_memActivity);
      setLoading(false);
    }
    return () => { _activityListeners.delete(onActivity); };
  }, []);

  useEffect(() => {
    retryCount.current = 0;

    if (_memActivity) {
      hydratedRef.current = true;
      setActivity(_memActivity);
      setLoading(false);
      fetchActivity();
      return () => { if (retryTimer.current) clearTimeout(retryTimer.current); };
    }

    // No memory cache yet — network refresh will update via _setMemActivity
    fetchActivity();

    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchActivity]);

  return { activity, loading, refetch: fetchActivity };
}

/**
 * Prefetch recent activity in the background (call from home tab).
 * Populates _memActivity so Activity tab renders instantly.
 */
export function usePrefetchActivity(delayMs = 0) {
  const apiFetch = useApiFetch();
  useEffect(() => {
    if (_memActivity) return;
    let cancelled = false;
    const run = async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (cancelled) return;
      try {
        const networkPromise = apiFetch(ACTIVITY_PATH);
        const [, persisted] = await Promise.all([
          _loadLastSeen(),
          getPersistedResponse(ACTIVITY_PATH),
        ]);
        if (persisted && !_memActivity) {
          try { _setMemActivity(JSON.parse(persisted.body).activity ?? []); } catch { /* corrupt */ }
        }
        if (cancelled) return;
        const res = await networkPromise;
        if (res.ok) {
          const data = await res.json();
          const items: RecentActivityItem[] = data.activity ?? [];
          _setMemActivity(items);
          if (items[0] && items[0].id !== _lastSeenActivityId) {
            _setHasUnseen(true);
          }
        }
      } catch { /* best-effort */ }
    };
    void run();
    return () => { cancelled = true; };
  }, [apiFetch, delayMs]);
}

export function applyOptimisticSettlementUpdate(args: {
  requests: OptimisticSettlementRequest[];
  personKey?: string | null;
  counterpartyName: string;
}) {
  const { requests, personKey, counterpartyName } = args;
  if (requests.length === 0) return;

  if (personKey) {
    const cachedPerson = _memPersonDetail.get(personKey);
    if (cachedPerson) {
      _setMemPersonDetail(personKey, applySettlementToPersonDetail(cachedPerson, requests));
    }
  }

  for (const [path, summary] of _memSummary.entries()) {
    let next = summary;
    if (personKey) {
      next = {
        ...next,
        friends: next.friends.map((friend) =>
          friend.key === personKey ? applySettlementToFriendBalance(friend, requests) : friend,
        ),
      };
    }
    next = {
      ...next,
      groups: next.groups.map((group) => applySettlementToGroupSummary(group, requests)),
    };
    _setMemSummary(path, rebuildSummary(next, path.includes("contacts=1")));
  }

  const groupNameById = new Map<string, string>();
  for (const request of requests) {
    const cachedGroup = _memGroupDetail.get(request.groupId);
    if (cachedGroup) {
      groupNameById.set(request.groupId, cachedGroup.name);
      _setMemGroupDetail(request.groupId, applySettlementToGroupDetail(cachedGroup, [request]));
    }
  }

  const optimisticActivity = buildOptimisticSettlementActivity(requests, counterpartyName, groupNameById);
  _setMemActivity([...optimisticActivity, ...(_memActivity ?? [])]);
  if (optimisticActivity[0] && optimisticActivity[0].id !== _lastSeenActivityId) {
    _setHasUnseen(true);
  }
}
