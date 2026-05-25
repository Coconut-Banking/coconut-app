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
  accountMask?: string | null;
  accountName?: string | null;
  hasReceipt?: boolean;
  receiptMatchLine?: string;
  alreadySplit?: boolean;
  dbId?: string;
  receiptId?: string | null;
  logoUrl?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

/** `api_unreachable` = HTTP 404 on /api/plaid/status (usually wrong EXPO_PUBLIC_API_URL, not auth). */
export type PlaidStatus = "ok" | "unauthorized" | "not_linked" | "api_unreachable";

/** Free cursor sync (POST) — min gap so we don't hammer the server. No paid Plaid refresh. */
const MIN_FREE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let _sharedTx: Transaction[] = [];
let _sharedLinked = false;
let _sharedStatus: PlaidStatus = "ok";
let _sharedHasLoaded = false;
let _lastServerSyncAt = 0;
let _lastNeedsSync = false;
let _inflightPipeline: Promise<void> | null = null;
let _inflightPost: Promise<Response> | null = null;
let _lastPlaidPushAt = 0;
let _lastFetchAt = 0;
let _emptySyncAttempted = false;
let _transientRetryCount = 0;
const MIN_FETCH_INTERVAL_MS = 5_000;
const _subscribers = new Set<() => void>();

function _notify() {
  _subscribers.forEach((fn) => fn());
}

function _mapRawTransaction(raw: unknown): Transaction {
  const t = raw as Record<string, unknown>;
  const rid = t.receipt_id ?? t.receiptId;
  const base = { ...t } as unknown as Transaction;
  if (rid != null && rid !== "") base.receiptId = String(rid);
  return base;
}

function _applyResponseMeta(res: Response) {
  _lastNeedsSync = res.headers.get("X-Needs-Sync") === "1";
  const syncedHeader = res.headers.get("X-Last-Synced-At");
  if (syncedHeader) {
    const parsed = Date.parse(syncedHeader);
    if (!Number.isNaN(parsed)) _lastServerSyncAt = parsed;
  }
}

function _applyTransactions(data: unknown): number {
  if (!Array.isArray(data)) return _sharedTx.length;
  const mapped = (data as unknown[]).map(_mapRawTransaction);
  _sharedTx = mapped;
  _sharedLinked = true;
  _sharedStatus = "ok";
  _sharedHasLoaded = true;
  return mapped.length;
}

function _shouldRunFreeBackgroundSync(opts: {
  force?: boolean;
  needsSync: boolean;
  txCount: number;
}): boolean {
  if (!_sharedLinked) return false;
  if (_inflightPost) return false;
  const now = Date.now();
  if (opts.force) return true;
  if (now - _lastPlaidPushAt < MIN_FREE_SYNC_INTERVAL_MS) return false;
  if (opts.needsSync) return true;
  if (opts.txCount === 0 && !_emptySyncAttempted) return true;
  return false;
}

function _shouldBackgroundSyncAfterFetch(needsSync: boolean, txCount: number): boolean {
  if (!_sharedLinked) return false;
  if (needsSync) return true;
  return txCount === 0 && !_emptySyncAttempted;
}

let _hydratePromise: Promise<void> | null = null;

export function hydrateTransactionCache(): Promise<void> {
  if (_sharedHasLoaded) return Promise.resolve();
  if (_hydratePromise) return _hydratePromise;

  _hydratePromise = (async () => {
    const [statusCache, txCache] = await Promise.all([
      getPersistedResponse("/api/plaid/status"),
      getPersistedResponse("/api/plaid/transactions"),
    ]);
    if (_sharedHasLoaded) return;
    if (!statusCache) return;
    try {
      const statusData = JSON.parse(statusCache.body);
      if (!statusData?.linked) return;
      _sharedLinked = true;
      _sharedStatus = "ok";
      if (txCache) {
        try {
          const txData = JSON.parse(txCache.body);
          if (Array.isArray(txData)) {
            _sharedTx = (txData as unknown[]).map(_mapRawTransaction);
            _sharedHasLoaded = true;
            _notify();
          }
        } catch { /* corrupt */ }
      }
    } catch { /* corrupt */ }
  })();

  return _hydratePromise;
}

hydrateTransactionCache();

async function triggerFreeSync(
  apiFetch: ReturnType<typeof useApiFetch>,
  opts: { force?: boolean; needsSync?: boolean; txCount?: number },
): Promise<void> {
  if (
    !_shouldRunFreeBackgroundSync({
      force: opts.force,
      needsSync: opts.needsSync ?? _lastNeedsSync,
      txCount: opts.txCount ?? _sharedTx.length,
    })
  ) {
    return;
  }

  if (_inflightPost) {
    if (__DEV__) console.log("[pipeline:tx] ♻️ reusing inflight POST");
    await _inflightPost.catch(() => {});
    return;
  }

  if ((opts.txCount ?? _sharedTx.length) === 0) {
    _emptySyncAttempted = true;
  }

  try {
    if (__DEV__) console.log("[pipeline:tx] free cursor sync (POST, no paid refresh)");
    const postPromise = apiFetch("/api/plaid/transactions", { method: "POST", body: {} as object });
    _inflightPost = postPromise;
    const res = await postPromise;
    _inflightPost = null;
    if (res.ok) {
      _lastPlaidPushAt = Date.now();
      const fresh = await apiFetch("/api/plaid/transactions");
      if (fresh?.ok) {
        _applyResponseMeta(fresh);
        const data = await fresh.json();
        _applyTransactions(data);
      }
    } else if (__DEV__) {
      console.warn("[pipeline:tx] POST sync failed:", res.status);
    }
  } catch {
    _inflightPost = null;
  } finally {
    _notify();
  }
}

export function usePrefetchTransactions(delayMs = 0) {
  const apiFetch = useApiFetch();
  useEffect(() => {
    if (_sharedHasLoaded && _sharedTx.length > 0 && _inflightPipeline) return;
    let cancelled = false;
    const run = async () => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (cancelled) return;

      const networkPromise = apiFetch("/api/plaid/transactions").catch(() => null);
      await hydrateTransactionCache();
      if (cancelled || _inflightPipeline) return;

      if (_sharedLinked) {
        const p = (async () => {
          try {
            const res = await networkPromise;
            if (cancelled || !res || !res.ok) return;
            _applyResponseMeta(res);
            const data = await res.json();
            if (cancelled) return;
            const count = _applyTransactions(data);
            _notify();
            if (_shouldBackgroundSyncAfterFetch(_lastNeedsSync, count)) {
              void triggerFreeSync(apiFetch, { needsSync: _lastNeedsSync, txCount: count });
            }
          } finally {
            _inflightPipeline = null;
            _sharedHasLoaded = true;
            _notify();
          }
        })();
        _inflightPipeline = p;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch]);
}

export function useTransactions() {
  const apiFetch = useApiFetch();
  const [transactions, setTransactions] = useState<Transaction[]>(_sharedTx);
  const [linked, setLinked] = useState(_sharedLinked);
  const linkedRef = useRef(_sharedLinked);
  const [loading, setLoading] = useState(!_sharedHasLoaded && _sharedTx.length === 0);
  const [status, setStatus] = useState<PlaidStatus>(_sharedStatus);
  const fetchCancelledRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      setTransactions((prev) => (prev === _sharedTx ? prev : _sharedTx));
      setLinked((prev) => (prev === _sharedLinked ? prev : _sharedLinked));
      linkedRef.current = _sharedLinked;
      setStatus((prev) => (prev === _sharedStatus ? prev : _sharedStatus));
      if (_sharedHasLoaded || _sharedTx.length > 0) setLoading(false);
    };
    _subscribers.add(sync);
    sync();
    return () => {
      _subscribers.delete(sync);
    };
  }, []);

  const fetchData = useCallback(
    (silent = false): Promise<void> => {
      if (_inflightPipeline) {
        return _inflightPipeline;
      }

      const now = Date.now();
      if (silent && now - _lastFetchAt < MIN_FETCH_INTERVAL_MS) {
        return _inflightPipeline ?? Promise.resolve();
      }
      _lastFetchAt = now;

      const isFirstLoad = !_sharedHasLoaded && _sharedTx.length === 0;
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

      const handleTxResponse = async (
        res: Response | null | undefined,
        opts?: { maybeBackgroundSync?: boolean },
      ) => {
        if (!res?.ok) return _sharedTx.length;
        _applyResponseMeta(res);
        const data = await res.json();
        if (fetchCancelledRef.current) return _sharedTx.length;
        const count = Array.isArray(data) ? _applyTransactions(data) : _sharedTx.length;
        if (opts?.maybeBackgroundSync && _shouldBackgroundSyncAfterFetch(_lastNeedsSync, count)) {
          void triggerFreeSync(apiFetch, { needsSync: _lastNeedsSync, txCount: count });
        }
        return count;
      };

      if (_sharedLinked === true) {
        const p2 = apiFetch("/api/plaid/transactions", { signal: controller.signal })
          .then(async (r) => {
            clearTimeout(timeout);
            await handleTxResponse(r, { maybeBackgroundSync: true });
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
        _inflightPipeline = p2;
        return p2;
      }

      const p = Promise.all([
        apiFetch("/api/plaid/status", { signal: controller.signal }),
        apiFetch("/api/plaid/transactions", { signal: controller.signal }),
      ])
        .then(async ([statusRes, txRes]) => {
          clearTimeout(timeout);
          if (fetchCancelledRef.current) return;

          if (statusRes.status === 425) {
            if (_transientRetryCount < 14) {
              _transientRetryCount += 1;
              setTimeout(() => {
                if (!fetchCancelledRef.current) fetchData(true);
              }, 600);
            }
            return;
          }
          _transientRetryCount = 0;

          if (statusRes.status === 401) {
            updateShared(_sharedTx, false, "unauthorized");
            return;
          }
          if (statusRes.status === 404) {
            updateShared(_sharedTx, false, "api_unreachable");
            return;
          }
          if (!statusRes.ok) {
            _sharedLinked = false;
            _notify();
            return;
          }

          const statusData = await statusRes.json();
          if (!statusData?.linked) {
            updateShared([], false, "not_linked");
            return;
          }

          _sharedLinked = true;
          linkedRef.current = true;
          await handleTxResponse(txRes, { maybeBackgroundSync: true });
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
    },
    [apiFetch],
  );

  const runFullSync = useCallback(
    async (silent = true) => {
      await fetchData(silent);
      void triggerFreeSync(apiFetch, {
        force: true,
        needsSync: _lastNeedsSync,
        txCount: _sharedTx.length,
      });
    },
    [apiFetch, fetchData],
  );

  useEffect(() => {
    fetchCancelledRef.current = false;
    let cancelled = false;

    (async () => {
      await hydrateTransactionCache();
      if (cancelled) return;
      void fetchData(_sharedHasLoaded && _sharedTx.length > 0);
    })();

    return () => {
      cancelled = true;
      fetchCancelledRef.current = true;
    };
  }, [fetchData]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void fetchData(true);
    });
    return () => sub.remove();
  }, [fetchData, apiFetch]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("bank-disconnected", () => {
      _emptySyncAttempted = false;
      _lastServerSyncAt = 0;
      void fetchData(true);
    });
    return () => sub.remove();
  }, [fetchData]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("bank-connected", () => {
      _emptySyncAttempted = false;
      void runFullSync(true);
    });
    return () => sub.remove();
  }, [runFullSync]);

  return {
    transactions,
    linked,
    loading,
    status,
    refetch: fetchData,
    runFullSync,
  };
}
