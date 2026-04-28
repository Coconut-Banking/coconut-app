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
  const transientRetryCount = useRef(0);
  const fetchGenRef = useRef(0);

  const fetchData = useCallback((silent = false): Promise<void> => {
    const gen = ++fetchGenRef.current;
    const isCancelled = () => fetchGenRef.current !== gen;
    const isFirstLoad = !hasShownInitialLoad.current;
    console.log(`[useTransactions] fetchData started silent=${silent} isFirstLoad=${isFirstLoad}`);
    setStatus("ok");
    if (!silent && isFirstLoad) setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    return apiFetch("/api/plaid/status", { signal: controller.signal })
      .then((r) => {
        clearTimeout(timeout);
        if (isCancelled()) return null;
        console.log(`[useTransactions] plaid/status → ${r.status}`);
        if (r.status === 425) {
          if (transientRetryCount.current < 8) {
            transientRetryCount.current += 1;
            console.log(`[useTransactions] 425 retry ${transientRetryCount.current}/8`);
            setTimeout(() => {
              if (!isCancelled()) fetchData(true);
            }, 800);
            return null;
          }
          console.log("[useTransactions] 425 max retries, setting loading=false");
          setLoading(false);
          return null;
        }
        transientRetryCount.current = 0;
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
        if (isCancelled() || !data) return null;
        if (!data.linked) {
          console.log("[useTransactions] not linked, loading=false");
          setStatus("not_linked");
          setLoading(false);
          return null;
        }
        console.log("[useTransactions] linked! fetching transactions");
        setLinked(true);
        const txController = new AbortController();
        const txTimeout = setTimeout(() => txController.abort(), 10000);
        return apiFetch("/api/plaid/transactions", { signal: txController.signal })
          .finally(() => clearTimeout(txTimeout));
      })
      .then((r) => {
        if (isCancelled() || !r || !r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (isCancelled()) return;
        if (Array.isArray(data)) setTransactions(data as Transaction[]);
      })
      .finally(() => {
        if (!isCancelled()) {
          clearTimeout(timeout);
          hasShownInitialLoad.current = true;
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!isCancelled()) setLoading(false);
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
