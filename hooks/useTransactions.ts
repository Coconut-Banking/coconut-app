import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import { useApiFetch, getPersistedResponse } from "../lib/api";

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
  /** Linked email receipt (Gmail) matched to this bank charge */
  hasReceipt?: boolean;
  receiptMatchLine?: string;
  /** Already added to a group split — hide from “split this” home strip */
  alreadySplit?: boolean;
  /** Internal `transactions.id` for APIs that need DB uuid */
  dbId?: string;
  /**
   * Parsed receipt id when this bank charge is linked to an email receipt (same id as /api/receipt/* on web).
   * Backend may send `receipt_id` or `receiptId`.
   */
  receiptId?: string | null;
  /** Plaid counterparty logo URL (high-quality, from Plaid CDN). */
  logoUrl?: string | null;
}

/** `api_unreachable` = HTTP 404 on /api/plaid/status (usually wrong EXPO_PUBLIC_API_URL, not auth). */
export type PlaidStatus = "ok" | "unauthorized" | "not_linked" | "api_unreachable";

/** Throttle POST /api/plaid/transactions (Plaid refresh + sync) when returning to the app. */
const FOREGROUND_PLAID_PUSH_MIN_MS = 20 * 60 * 1000;

export function useTransactions() {
  const apiFetch = useApiFetch();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [linked, setLinked] = useState(false);
  const linkedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PlaidStatus>("ok");
  const hasShownInitialLoad = useRef(false);
  const transientRetryCount = useRef(0);
  const lastPlaidPushAtRef = useRef(Date.now());
  /** Set true in useEffect cleanup so in-flight pipeline callbacks skip setState after unmount. */
  const fetchCancelledRef = useRef(false);

  const fetchData = useCallback((silent = false): Promise<void> => {
    const isFirstLoad = !hasShownInitialLoad.current;
    if (__DEV__) console.log("[pipeline:tx] 1. start", { silent, isFirstLoad });
    if (!silent) setStatus("ok");
    if (!silent && isFirstLoad) setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    return apiFetch("/api/plaid/status", { signal: controller.signal })
      .then((r) => {
        clearTimeout(timeout);
        if (fetchCancelledRef.current) return null;
        if (__DEV__) console.log("[pipeline:tx] 2. plaid/status", r.status);
        if (r.status === 425) {
          if (transientRetryCount.current < 14) {
            transientRetryCount.current += 1;
            if (__DEV__) console.log("[pipeline:tx] 2b. 425 retry", transientRetryCount.current, "/14");
            setTimeout(() => {
              if (!fetchCancelledRef.current) fetchData(true);
            }, 600);
            return null;
          }
          if (__DEV__) console.log("[pipeline:tx] 2c. 425 max retries → stop");
          setLoading(false);
          return null;
        }
        transientRetryCount.current = 0;
        if (r.status === 401) {
          linkedRef.current = false;
          setStatus("unauthorized");
          setLoading(false);
          return null;
        }
        if (r.status === 404) {
          if (__DEV__) {
            const base = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "") || "(unset EXPO_PUBLIC_API_URL)";
            console.warn(`[pipeline:tx] /api/plaid/status 404 — check API host (e.g. ${base})`);
          }
          linkedRef.current = false;
          setStatus("api_unreachable");
          setLoading(false);
          return null;
        }
        if (!r.ok) {
          linkedRef.current = false;
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (fetchCancelledRef.current || !data) return null;
        if (!data.linked) {
          if (__DEV__) console.log("[pipeline:tx] 3. not linked → stop");
          linkedRef.current = false;
          setLinked(false);
          setTransactions([]);
          setStatus("not_linked");
          setLoading(false);
          return null;
        }
        if (__DEV__) console.log("[pipeline:tx] 3. linked → GET /api/plaid/transactions");
        linkedRef.current = true;
        setLinked(true);
        return apiFetch("/api/plaid/transactions", { signal: controller.signal });
      })
      .then((r) => {
        if (fetchCancelledRef.current || !r || !r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (fetchCancelledRef.current) return;
        if (Array.isArray(data)) {
          const mapped = (data as unknown[]).map((raw) => {
            const t = raw as Record<string, unknown>;
            const rid = t.receipt_id ?? t.receiptId;
            const base = { ...t } as unknown as Transaction;
            if (rid != null && rid !== "") base.receiptId = String(rid);
            return base;
          });
          if (__DEV__) {
            const withReceipt = mapped.filter((tx) => tx.hasReceipt || tx.receiptId);
            const sample = mapped.slice(0, 2).map((tx) => ({
              id: tx.id,
              merchant: tx.merchant,
              hasReceipt: tx.hasReceipt,
              receiptId: tx.receiptId,
              receiptMatchLine: tx.receiptMatchLine,
              hasSplitSuggestion: tx.hasSplitSuggestion,
            }));
            // Log raw API fields for Target to diagnose missing receipt_id
            const targetTxs = (data as unknown[]).filter((raw) => {
              const t = raw as Record<string, unknown>;
              return String(t.merchant_name ?? t.merchant ?? "").toLowerCase().includes("target");
            });
            if (targetTxs.length > 0) {
              console.log("[pipeline:tx] TARGET raw fields:", JSON.stringify(
                targetTxs.map((raw) => {
                  const t = raw as Record<string, unknown>;
                  return {
                    id: t.id,
                    merchant_name: t.merchant_name,
                    merchant: t.merchant,
                    amount: t.amount,
                    date: t.date,
                    receipt_id: t.receipt_id,
                    receiptId: t.receiptId,
                    has_receipt: t.has_receipt,
                    hasReceipt: t.hasReceipt,
                    receipt_match_line: t.receipt_match_line,
                  };
                })
              ));
            }
            console.log("[pipeline:tx] 4. receipt debug", {
              total: mapped.length,
              withReceipt: withReceipt.length,
              sample,
            });
          }
          setTransactions(mapped);
          if (__DEV__) console.log("[pipeline:tx] 4. output", { count: (data as unknown[]).length });
        }
      })
      .finally(() => {
        if (!fetchCancelledRef.current) {
          clearTimeout(timeout);
          hasShownInitialLoad.current = true;
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!fetchCancelledRef.current) setLoading(false);
      });
  }, [apiFetch]);

  /** Show cached data immediately, then kick off Plaid sync in the background. */
  const runFullSync = useCallback(
    async (silent = true) => {
      await fetchData(silent);
      void (async () => {
        try {
          await apiFetch("/api/plaid/transactions", { method: "POST", body: {} as object });
          lastPlaidPushAtRef.current = Date.now();
          fetchData(true);
        } catch {
          // Sync may fail; cached data is already displayed
        }
      })();
    },
    [apiFetch, fetchData]
  );

  // Initial load: serve persisted data instantly, then GET (fast). POST sync on pull-to-refresh.
  useEffect(() => {
    fetchCancelledRef.current = false;
    let cancelled = false;

    (async () => {
      const [statusCache, txCache] = await Promise.all([
        getPersistedResponse("/api/plaid/status"),
        getPersistedResponse("/api/plaid/transactions"),
      ]);

      if (cancelled) return;

      if (statusCache) {
        try {
          const statusData = JSON.parse(statusCache.body);
          if (statusData.linked) {
            linkedRef.current = true;
            setLinked(true);
            setStatus("ok");
            if (txCache) {
              try {
                const txData = JSON.parse(txCache.body);
                if (Array.isArray(txData)) {
                  const mapped = (txData as unknown[]).map((raw) => {
                    const t = raw as Record<string, unknown>;
                    const rid = t.receipt_id ?? t.receiptId;
                    const base = { ...t } as unknown as Transaction;
                    if (rid != null && rid !== "") base.receiptId = String(rid);
                    return base;
                  });
                  setTransactions(mapped);
                  hasShownInitialLoad.current = true;
                  setLoading(false);
                }
              } catch { /* corrupt */ }
            }
          }
        } catch { /* corrupt */ }
      }

      if (!cancelled) void fetchData(hasShownInitialLoad.current);
    })();

    return () => {
      cancelled = true;
      fetchCancelledRef.current = true;
    };
  }, [fetchData]);

  // When app returns from background: refetch DB; periodically nudge Plaid (refresh + sync) like pull-to-refresh.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void fetchData(true);
      if (!linkedRef.current) return;
      const now = Date.now();
      if (now - lastPlaidPushAtRef.current < FOREGROUND_PLAID_PUSH_MIN_MS) return;
      lastPlaidPushAtRef.current = now;
      void (async () => {
        try {
          if (__DEV__) console.log("[pipeline:tx] foreground Plaid POST (refresh+sync)");
          await apiFetch("/api/plaid/transactions", { method: "POST", body: {} as object });
          await fetchData(true);
        } catch {
          // Non-fatal — user already has DB snapshot from fetchData above
        }
      })();
    });
    return () => sub.remove();
  }, [fetchData, apiFetch]);

  // Settings → Disconnect bank does not unmount tabs; force a fresh Plaid status read.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("bank-disconnected", () => {
      void fetchData(true);
    });
    return () => sub.remove();
  }, [fetchData]);

  return { transactions, linked, loading, status, refetch: fetchData, runFullSync };
}
