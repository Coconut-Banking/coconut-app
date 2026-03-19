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
  isPending?: boolean;
  /** Last 4 of account for bank tag, e.g. "1234" */
  accountMask?: string | null;
  /** Account name for bank tag, e.g. "Chase Checking" */
  accountName?: string | null;
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

  const fetchData = useCallback((silent = false): Promise<void> => {
    let cancelled = false;
    const isFirstLoad = !hasShownInitialLoad.current;
    console.log(`[useTransactions] fetchData started silent=${silent} isFirstLoad=${isFirstLoad}`);
    setStatus("ok");
    if (!silent && isFirstLoad) setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    return apiFetch("/api/plaid/status", { signal: controller.signal })
      .then((r) => {
        clearTimeout(timeout);
        if (cancelled) return null;
        console.log(`[useTransactions] plaid/status → ${r.status}`);
        if (r.status === 425) {
          if (transientRetryCount.current < 14) {
            transientRetryCount.current += 1;
            console.log(`[useTransactions] 425 retry ${transientRetryCount.current}/14`);
            setTimeout(() => {
              if (!cancelled) fetchData(true);
            }, 600);
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
        if (cancelled || !data) return null;
        if (!data.linked) {
          console.log("[useTransactions] not linked, loading=false");
          setStatus("not_linked");
          setLoading(false);
          return null;
        }
        console.log("[useTransactions] linked! fetching transactions");
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

  const runSyncThenFetch = useCallback(
    async (silent = true) => {
      // Fetch cached transactions first (fast), then sync in background
      await fetchData(silent);
      try {
        await apiFetch("/api/plaid/transactions", { method: "POST", body: {} as object });
        fetchData(true);
      } catch {
        // Sync may fail; cached data is already displayed
      }
    },
    [apiFetch, fetchData]
  );

  useEffect(() => {
    runSyncThenFetch(false);
  }, [runSyncThenFetch]);

  // Sync and refetch when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runSyncThenFetch(true);
    });
    return () => sub.remove();
  }, [runSyncThenFetch]);

  return { transactions, linked, loading, status, refetch: fetchData };
}
