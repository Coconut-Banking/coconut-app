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

export type PlaidStatus = "ok" | "unauthorized" | "not_linked";

export function useTransactions() {
  const apiFetch = useApiFetch();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PlaidStatus>("ok");
  const hasShownInitialLoad = useRef(false);

  const fetchData = useCallback((silent = false): Promise<void> => {
    let cancelled = false;
    setStatus("ok");
    const isFirstLoad = !hasShownInitialLoad.current;
    if (!silent && isFirstLoad) setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    return apiFetch("/api/plaid/status", { signal: controller.signal })
      .then((r) => {
        clearTimeout(timeout);
        if (cancelled) return null;
        if (r.status === 401 || r.status === 404) {
          // 404 = Clerk's protect() for unauthenticated; 401 = our middleware
          setStatus("unauthorized");
          setLoading(false);
          return null;
        }
        if (!r.ok) {
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled || !data) return null;
        if (!data.linked) {
          setStatus("not_linked");
          setLoading(false);
          return null;
        }
        setLinked(true);
        return apiFetch("/api/plaid/transactions");
      })
      .then((r) => {
        if (cancelled || !r || !r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setTransactions(data as Transaction[]);
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          hasShownInitialLoad.current = true;
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });
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

  return { transactions, linked, loading, status, refetch: fetchData };
}
