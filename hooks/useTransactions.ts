import { useState, useEffect, useCallback } from "react";
import { AppState } from "react-native";
import { useApiFetch } from "../lib/api";

export interface Transaction {
  id: string;
  merchant: string;
  rawDescription: string;
  amount: number;
  category: string;
  categoryColor: string;
  date: string;
  dateStr: string;
  isRecurring?: boolean;
  hasSplitSuggestion?: boolean;
  merchantColor: string;
}

export function useTransactions() {
  const apiFetch = useApiFetch();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch("/api/plaid/status")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.linked) {
          setLoading(false);
          return;
        }
        setLinked(true);
        return apiFetch("/api/plaid/transactions");
      })
      .then((r) => {
        if (!r || cancelled) return r?.json?.();
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setTransactions(data as Transaction[]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when app returns from background (e.g. after connect flow in browser)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchData();
    });
    return () => sub.remove();
  }, [fetchData]);

  return { transactions, linked, loading, refetch: fetchData };
}
