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

// ── Module-level shared state ──
// Multiple tabs call useTransactions(); this cache ensures the pipeline
// runs only once and all consumers share the same data.
let _sharedTx: Transaction[] = [];
let _sharedLinked = false;
let _sharedStatus: PlaidStatus = "ok";
let _sharedHasLoaded = false;
let _inflightPipeline: Promise<void> | null = null;
let _inflightPost: Promise<Response> | null = null;
let _lastPlaidPushAt = Date.now();
let _transientRetryCount = 0;
const _subscribers = new Set<() => void>();
function _notify() { _subscribers.forEach((fn) => fn()); }

export function useTransactions() {
  const apiFetch = useApiFetch();
  const [transactions, setTransactions] = useState<Transaction[]>(_sharedTx);
  const [linked, setLinked] = useState(_sharedLinked);
  const linkedRef = useRef(_sharedLinked);
  const [loading, setLoading] = useState(!_sharedHasLoaded);
  const [status, setStatus] = useState<PlaidStatus>(_sharedStatus);
  const hasShownInitialLoad = useRef(_sharedHasLoaded);
  /** Set true in useEffect cleanup so in-flight pipeline callbacks skip setState after unmount. */
  const fetchCancelledRef = useRef(false);

  // Subscribe to shared-state changes so all hook consumers re-render together.
  useEffect(() => {
    const sync = () => {
      setTransactions(_sharedTx);
      setLinked(_sharedLinked);
      linkedRef.current = _sharedLinked;
      setStatus(_sharedStatus);
      if (_sharedHasLoaded) {
        hasShownInitialLoad.current = true;
        setLoading(false);
      }
    };
    _subscribers.add(sync);
    sync();
    return () => { _subscribers.delete(sync); };
  }, []);

  const fetchData = useCallback((silent = false): Promise<void> => {
    // Deduplicate: if a pipeline is already in flight, piggyback on it.
    if (_inflightPipeline) {
      if (__DEV__) console.log("[pipeline:tx] ♻️ reusing inflight pipeline");
      return _inflightPipeline;
    }

    const isFirstLoad = !_sharedHasLoaded;
    if (__DEV__) console.log("[pipeline:tx] 1. start", { silent, isFirstLoad });
    if (!silent) { _sharedStatus = "ok"; _notify(); }
    if (!silent && isFirstLoad) setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const updateShared = (tx: Transaction[], lnk: boolean, st: PlaidStatus) => {
      _sharedTx = tx;
      _sharedLinked = lnk;
      _sharedStatus = st;
      _sharedHasLoaded = true;
      _notify();
    };

    const p = apiFetch("/api/plaid/status", { signal: controller.signal })
      .then((r) => {
        clearTimeout(timeout);
        if (fetchCancelledRef.current) return null;
        if (__DEV__) console.log("[pipeline:tx] 2. plaid/status", r.status);
        if (r.status === 425) {
          if (_transientRetryCount < 14) {
            _transientRetryCount += 1;
            if (__DEV__) console.log("[pipeline:tx] 2b. 425 retry", _transientRetryCount, "/14");
            setTimeout(() => {
              if (!fetchCancelledRef.current) fetchData(true);
            }, 600);
            return null;
          }
          if (__DEV__) console.log("[pipeline:tx] 2c. 425 max retries → stop");
          return null;
        }
        _transientRetryCount = 0;
        if (r.status === 401) {
          updateShared(_sharedTx, false, "unauthorized");
          return null;
        }
        if (r.status === 404) {
          if (__DEV__) {
            const base = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "") || "(unset EXPO_PUBLIC_API_URL)";
            console.warn(`[pipeline:tx] /api/plaid/status 404 — check API host (e.g. ${base})`);
          }
          updateShared(_sharedTx, false, "api_unreachable");
          return null;
        }
        if (!r.ok) {
          _sharedLinked = false; _notify();
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (fetchCancelledRef.current || !data) return null;
        if (!data.linked) {
          if (__DEV__) console.log("[pipeline:tx] 3. not linked → stop");
          updateShared([], false, "not_linked");
          return null;
        }
        if (__DEV__) console.log("[pipeline:tx] 3. linked → GET /api/plaid/transactions");
        _sharedLinked = true;
        linkedRef.current = true;
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
          if (__DEV__) console.log("[pipeline:tx] 4. output", { count: (data as unknown[]).length });
          updateShared(mapped, true, "ok");
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        _inflightPipeline = null;
        _sharedHasLoaded = true;
        _notify();
      })
      .catch(() => {
        clearTimeout(timeout);
        _inflightPipeline = null;
        _notify();
      });

    _inflightPipeline = p;
    return p;
  }, [apiFetch]);

  /** Show cached data immediately, then kick off Plaid sync in the background. */
  const runFullSync = useCallback(
    async (silent = true) => {
      await fetchData(silent);
      void (async () => {
        if (_inflightPost) {
          if (__DEV__) console.log("[pipeline:tx] ♻️ reusing inflight POST");
          return;
        }
        try {
          const postPromise = apiFetch("/api/plaid/transactions", { method: "POST", body: {} as object });
          _inflightPost = postPromise;
          const res = await postPromise;
          _inflightPost = null;
          if (res.ok) {
            _lastPlaidPushAt = Date.now();
            fetchData(true);
          } else if (__DEV__) {
            console.warn("[pipeline:tx] POST sync failed:", res.status);
          }
        } catch {
          _inflightPost = null;
        }
      })();
    },
    [apiFetch, fetchData],
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
                  _sharedTx = mapped;
                  _sharedLinked = true;
                  _sharedStatus = "ok";
                  _sharedHasLoaded = true;
                  _notify();
                  hasShownInitialLoad.current = true;
                  setLoading(false);
                }
              } catch { /* corrupt */ }
            }
          }
        } catch { /* corrupt */ }
      }

      if (!cancelled) void fetchData(_sharedHasLoaded);
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
      if (!_sharedLinked) return;
      const now = Date.now();
      if (now - _lastPlaidPushAt < FOREGROUND_PLAID_PUSH_MIN_MS) return;
      if (_inflightPost) return;
      void (async () => {
        try {
          if (__DEV__) console.log("[pipeline:tx] foreground Plaid POST (refresh+sync)");
          const postPromise = apiFetch("/api/plaid/transactions", { method: "POST", body: {} as object });
          _inflightPost = postPromise;
          const res = await postPromise;
          _inflightPost = null;
          if (res.ok) {
            _lastPlaidPushAt = Date.now();
            await fetchData(true);
          } else if (__DEV__) {
            console.warn("[pipeline:tx] foreground POST failed:", res.status);
          }
        } catch {
          _inflightPost = null;
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
