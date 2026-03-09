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

  const fetchSummary = useCallback(async () => {
    try {
      const res = await apiFetch("/api/groups/summary");
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      } else setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSummary();
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
