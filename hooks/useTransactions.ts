import { useState, useEffect, useCallback, useRef } from "react";
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
  const hasShownInitialLoad = useRef(false);

  const fetchData = useCallback((silent = false): Promise<void> => {
    let cancelled = false;
    const isFirstLoad = !hasShownInitialLoad.current;
    if (!silent && isFirstLoad) setLoading(true);
    return apiFetch("/api/plaid/status")
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
        if (!cancelled) {
          hasShownInitialLoad.current = true;
          setLoading(false);
        }
      })
      .catch(() => { /* swallow so refetch never rejects */ });
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch when app returns from background (e.g. after connect flow in browser)
  // Use silent=true to avoid flickering — don't show loading spinner on refetch
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetchData(true);
    });
    return () => sub.remove();
  }, [fetchData]);

  return { transactions, linked, loading, refetch: fetchData };
}
