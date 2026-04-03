import { useState, useEffect, useCallback, useRef } from "react";
import { useApiFetch } from "../lib/api";

export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
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

export interface GroupMember {
  id: string;
  user_id: string | null;
  email: string | null;
  display_name: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  isOwner?: boolean;
  invite_token?: string | null;
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
}

export interface PersonDetail {
  displayName: string;
  /** One currency only; null when multiple currencies outstanding. */
  balance: number | null;
  currencyBalances: Array<{ currency: string; amount: number }>;
  activity: Array<{
    id: string;
    merchant: string;
    amount: number;
    currency: string;
    groupName: string;
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
  const contacts = options?.contacts === true;
  const summaryPath = contacts ? "/api/groups/summary?contacts=1" : "/api/groups/summary";
  const apiFetch = useApiFetch();
  const [summary, setSummary] = useState<GroupsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  const fetchSummary = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const res = await apiFetch(summaryPath);
        if (res.ok) {
          retryCount.current = 0;
          const data = await res.json();
          if (__DEV__)
            console.log(
              "[summary]",
              contacts ? "contacts" : "outstanding",
              "friends:",
              data.friends?.length ?? 0,
              "groups:",
              data.groups?.length ?? 0
            );
          setSummary(data);
        } else if (res.status === 429 || res.status === 503 || res.status >= 500) {
          if (retryCount.current < 5) {
            retryCount.current += 1;
            const delay = Math.min(3000 * Math.pow(1.5, retryCount.current - 1), 15000);
            if (__DEV__) console.log(`[summary] retry ${retryCount.current}/5 in ${delay}ms`);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => fetchSummary(false), delay);
          }
        } else if (showLoading) {
          setSummary(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, summaryPath, contacts]
  );

  useEffect(() => {
    retryCount.current = 0;
    fetchSummary(true);
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, [fetchSummary]);

  return { summary, loading, refetch: fetchSummary };
}

export function useGroupDetail(id: string | null) {
  const apiFetch = useApiFetch();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!id) {
        setDetail(null);
        setLoading(false);
        return;
      }
      if (!silent) {
        setDetail(null);
        setLoading(true);
      }
      try {
        const res = await apiFetch(`/api/groups/${id}`);
        if (res.ok) {
          const data = await res.json();
          setDetail(data);
        } else setDetail(null);
      } finally {
        setLoading(false);
      }
    },
    [id, apiFetch]
  );

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { detail, loading, refetch: fetchDetail };
}

const PERSON_POLL_MS = 30000;

export function usePersonDetail(key: string | null) {
  const apiFetch = useApiFetch();
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!key) {
        setDetail(null);
        setLoading(false);
        return;
      }
      if (!silent) {
        setDetail(null);
        setLoading(true);
      }
      try {
        const res = await apiFetch(
          `/api/groups/person?key=${encodeURIComponent(key)}`
        );
        if (res.ok) {
          const data = await res.json();
          setDetail(data);
        } else setDetail(null);
      } finally {
        setLoading(false);
      }
    },
    [key, apiFetch]
  );

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!key) return;
    const interval = setInterval(() => fetchDetail(true), PERSON_POLL_MS);
    return () => clearInterval(interval);
  }, [key, fetchDetail]);

  return { detail, loading, refetch: fetchDetail };
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
  paidBy: { memberId: string; displayName: string; isMe: boolean } | null;
  shares: Array<{ memberId: string; displayName: string; isMe: boolean; amount: number }>;
  notes: string | null;
  category: string | null;
  receiptUrl: string | null;
}

export function useTransactionDetail(id: string | null) {
  const apiFetch = useApiFetch();
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(
    async (silent = false) => {
      if (!id) {
        setDetail(null);
        setLoading(false);
        return;
      }
      if (!silent) {
        setDetail(null);
        setLoading(true);
      }
      try {
        const res = await apiFetch(`/api/groups/transaction?id=${encodeURIComponent(id)}`);
        if (res.ok) setDetail(await res.json());
        else setDetail(null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id, apiFetch]
  );

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

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

export function useRecentActivity(enabled = true) {
  const apiFetch = useApiFetch();
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  const fetchActivity = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch("/api/groups/recent-activity");
      if (res.ok) {
        retryCount.current = 0;
        const data = await res.json();
        setActivity(data.activity ?? []);
      } else if (res.status === 429 || res.status === 503 || res.status >= 500) {
        if (retryCount.current < 5) {
          retryCount.current += 1;
          const delay = Math.min(3000 * Math.pow(1.5, retryCount.current - 1), 15000);
          if (__DEV__) console.log(`[activity] retry ${retryCount.current}/5 in ${delay}ms`);
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(() => fetchActivity(), delay);
        }
      } else {
        setActivity([]);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, enabled]);

  useEffect(() => {
    retryCount.current = 0;
    fetchActivity();
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, [fetchActivity]);

  return { activity, loading, refetch: fetchActivity };
}
