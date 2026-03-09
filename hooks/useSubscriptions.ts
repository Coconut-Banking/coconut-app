import { useState, useEffect, useCallback } from "react";
import { useApiFetch } from "../lib/api";

export interface Subscription {
  id: string;
  merchant: string;
  amount: number;
  frequency: string;
  lastCharged?: string;
  nextDue?: string;
  category: string;
  transactionCount?: number;
}

export function useSubscriptions() {
  const apiFetch = useApiFetch();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubs = useCallback(async () => {
    try {
      const res = await apiFetch("/api/subscriptions");
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSubs();
  }, [fetchSubs]);

  return { subscriptions, loading, refetch: fetchSubs };
}
