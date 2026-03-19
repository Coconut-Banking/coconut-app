import { useState, useEffect, useCallback } from "react";
import { useApiFetch } from "../lib/api";

export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
  myBalance: number;
  lastActivityAt: string;
}

export interface FriendBalance {
  key: string;
  displayName: string;
  balance: number;
}

export interface GroupsSummary {
  groups: GroupSummary[];
  friends: FriendBalance[];
  totalOwedToMe: number;
  totalIOwe: number;
  netBalance: number;
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
  members: GroupMember[];
  activity: Array<{
    id: string;
    merchant: string;
    amount: number;
    paidBy: string;
    splitCount: number;
    createdAt: string;
  }>;
  balances: Array<{ memberId: string; paid: number; owed: number; total: number }>;
  suggestions: Array<{
    fromMemberId: string;
    toMemberId: string;
    amount: number;
    fromMember?: GroupMember;
    toMember?: GroupMember;
  }>;
  totalSpend: number;
}

export interface PersonDetail {
  displayName: string;
  balance: number;
  activity: Array<{
    id: string;
    merchant: string;
    amount: number;
    groupName: string;
    paidByMe: boolean;
    paidByThem: boolean;
    myShare: number;
    theirShare: number;
    effectOnBalance: number;
    createdAt: string;
  }>;
  email: string | null;
  key: string;
  settlements?: Array<{ groupId: string; fromMemberId: string; toMemberId: string; amount: number }>;
}

export function useGroupsSummary() {
  const apiFetch = useApiFetch();
  const [summary, setSummary] = useState<GroupsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await apiFetch("/api/groups/summary");
      if (res.ok) {
        const data = await res.json();
        if (__DEV__) console.log("[summary] friends:", data.friends?.length ?? 0, "groups:", data.groups?.length ?? 0, "_debug:", JSON.stringify(data._debug));
        setSummary(data);
      } else setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSummary(true);
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
      if (!silent) setLoading(true);
      try {
        const res = await apiFetch(`/api/groups/${id}`);
        if (res.ok) {
          const data = await res.json();
          setDetail(data);
        } else setDetail(null);
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
      if (!silent) setLoading(true);
      try {
        const res = await apiFetch(
          `/api/groups/person?key=${encodeURIComponent(key)}`
        );
        if (res.ok) {
          const data = await res.json();
          setDetail(data);
        } else setDetail(null);
      } finally {
        if (!silent) setLoading(false);
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

export interface RecentActivityItem {
  id: string;
  who: string;
  action: string;
  what: string;
  in: string;
  direction: "get_back" | "owe" | "settled";
  amount: number;
  time: string;
}

export function useRecentActivity(enabled = true) {
  const apiFetch = useApiFetch();
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch("/api/groups/recent-activity");
      if (res.ok) {
        const data = await res.json();
        setActivity(data.activity ?? []);
      } else setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, enabled]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return { activity, loading, refetch: fetchActivity };
}
