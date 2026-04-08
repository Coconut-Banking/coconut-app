import { useCallback, useRef } from "react";
import { useAuth } from "@clerk/expo";
import { DeviceEventEmitter } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-app.dev";
const SKIP_AUTH = process.env.EXPO_PUBLIC_SKIP_AUTH === "true";

function unauthResponse() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "X-Coconut-Auth": "signed-out" },
  });
}

let _tokenPromise: Promise<string | null> | null = null;
let _lastGoodToken: string | null = null;
let _refreshPromise: Promise<string | null> | null = null;
let _consecutive401s = 0;
const MAX_CONSECUTIVE_401S = 4;

let _rateLimitedUntil = 0;
const _endpointBackoff = new Map<string, number>();
const BACKOFF_BASE_MS = 3000;
const BACKOFF_MAX_MS = 30000;

const _inflightGets = new Map<string, Promise<Response>>();

const MAX_CACHE_ENTRIES = 50;
const _responseCache = new Map<string, { body: unknown; status: number; ts: number }>();
const CACHE_TTL_MS: Record<string, number> = {
  "/api/plaid/status": 60_000,
  "/api/plaid/transactions": 60_000,
  "/api/groups/summary": 45_000,
  "/api/groups/recent-activity": 30_000,
  "/api/groups/person": 30_000,
  "/api/plaid/accounts": 120_000,
  "/api/splitwise/status": 120_000,
  "/api/gmail/status": 300_000,
  "/api/stripe/connect/status": 300_000,
};

const GROUP_DETAIL_RE = /^\/api\/groups\/[a-f0-9-]+$/;

function getCacheTtl(path: string): number {
  for (const [prefix, ttl] of Object.entries(CACHE_TTL_MS)) {
    if (path === prefix || path.startsWith(prefix + "?")) return ttl;
  }
  if (GROUP_DETAIL_RE.test(path)) return 10_000;
  return 0;
}

const PERSIST_PATHS = new Set([
  "/api/groups/summary",
  "/api/groups/recent-activity",
  "/api/plaid/transactions",
  "/api/plaid/status",
  "/api/plaid/accounts",
]);

function shouldPersist(path: string): boolean {
  for (const p of PERSIST_PATHS) {
    if (path === p || path.startsWith(p + "?")) return true;
  }
  return false;
}

const PERSIST_PREFIX = "coconut.api.cache.";

function persistToStorage(path: string, body: string, status: number) {
  AsyncStorage.setItem(
    PERSIST_PREFIX + path,
    JSON.stringify({ body, status, ts: Date.now() })
  ).catch(() => {});
}

export async function getPersistedResponse(path: string): Promise<{ body: string; status: number; ts: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(PERSIST_PREFIX + path);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function invalidateApiCache(path?: string) {
  if (path) {
    Array.from(_responseCache.keys()).forEach((key) => {
      if (key === path || key.startsWith(path + "?")) _responseCache.delete(key);
    });
  } else {
    _responseCache.clear();
  }
}

const MAX_CONCURRENT = 6;
let _activeRequests = 0;
const _requestQueue: Array<{ resolve: (v: void) => void }> = [];

function acquireSlot(): Promise<void> {
  if (_activeRequests < MAX_CONCURRENT) {
    _activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => _requestQueue.push({ resolve }));
}

function releaseSlot(): void {
  const next = _requestQueue.shift();
  if (next) {
    next.resolve();
  } else if (_activeRequests > 0) {
    _activeRequests--;
  }
}

function isOfflineError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("offline") || msg.includes("network request failed") || msg.includes("clerk_offline");
}

/** Track when we last got a 401 so we can skip redundant calls with a known-bad token. */
let _tokenKnownBadUntil = 0;

/** Call this when a 401 is received — suppresses redundant calls for a short window. */
export function markTokenBad() {
  _tokenKnownBadUntil = Date.now() + 3000;
  _consecutive401s++;
  if (_consecutive401s >= MAX_CONSECUTIVE_401S) {
    if (__DEV__) console.warn(`[api] ${_consecutive401s} consecutive 401s — session likely dead, clearing cached token`);
    _lastGoodToken = null;
    _tokenPromise = null;
    DeviceEventEmitter.emit("session-expired");
  }
}

/** Call this when a fresh token is confirmed working. */
export function markTokenGood() {
  _tokenKnownBadUntil = 0;
  _consecutive401s = 0;
}

async function getTokenWithRetry(
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>,
): Promise<string | null> {
  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    try {
      const cached = await getToken({ skipCache: false });
      if (cached) {
        _lastGoodToken = cached;
        return cached;
      }
    } catch (e) {
      if (isOfflineError(e) && _lastGoodToken) {
        if (__DEV__) console.warn("[api] offline — using cached token");
        return _lastGoodToken;
      }
    }

    // One fast retry with skipCache, then give up.
    try {
      const token = await getToken({ skipCache: true });
      if (token) {
        _lastGoodToken = token;
        return token;
      }
    } catch (e) {
      if (isOfflineError(e) && _lastGoodToken) {
        if (__DEV__) console.warn("[api] offline — using cached token after retry");
        return _lastGoodToken;
      }
    }

    return _lastGoodToken ?? null;
  })();

  try {
    return await _tokenPromise;
  } finally {
    _tokenPromise = null;
  }
}

export function useApiFetch() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const ref = useRef({ getToken, isLoaded, isSignedIn });
  ref.current = { getToken, isLoaded, isSignedIn };

  return useCallback(
    async (
      path: string,
      opts: Omit<RequestInit, "body"> & { body?: object | FormData } = {}
    ) => {
      if (SKIP_AUTH) return unauthResponse();

      const { isLoaded: loaded, isSignedIn: signedIn, getToken: gt } = ref.current;
      if (loaded && !signedIn) return unauthResponse();

      const token = await getTokenWithRetry(gt);
      if (!token) {
        const { isLoaded: loadedNow, isSignedIn: signedInNow } = ref.current;
        if (loadedNow && !signedInNow) return unauthResponse();
        return new Response(
          JSON.stringify({ error: "Session token unavailable" }),
          { status: 425, headers: { "Content-Type": "application/json", "X-Coconut-Auth": "token-missing" } }
        );
      }

      const headers: Record<string, string> = {
        ...(opts.headers as Record<string, string>),
      };
      if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }

      const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
      let body: FormData | string | undefined;
      if (opts.body instanceof FormData) {
        body = opts.body;
      } else if (opts.body && typeof opts.body === "object") {
        body = JSON.stringify(opts.body);
      }

      const now = Date.now();
      if (now < _rateLimitedUntil) {
        return new Response(
          JSON.stringify({ error: "Rate limited — try again shortly" }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
      const backoffUntil = _endpointBackoff.get(path) ?? 0;
      if (now < backoffUntil) {
        return new Response(
          JSON.stringify({ error: "Backing off after server error" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }

      // Short-circuit if we recently got a 401 — don't waste roundtrips with a known-bad token.
      if (Date.now() < _tokenKnownBadUntil) {
        if (__DEV__) console.log(`[api] ⏭ skipping ${path} (token known bad)`);
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      const method = (opts.method ?? "GET").toUpperCase();
      if (__DEV__) console.log(`[api] → ${method} ${path}`);

      if (method === "GET") {
        const ttl = getCacheTtl(path);
        if (ttl > 0) {
          const cached = _responseCache.get(path);
          if (cached && Date.now() - cached.ts < ttl) {
            if (__DEV__) console.log(`[api] 💾 cache hit ${path}`);
            return new Response(JSON.stringify(cached.body), {
              status: cached.status,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        const inflight = _inflightGets.get(path);
        if (inflight) {
          if (__DEV__) console.log(`[api] ♻️ reusing inflight GET ${path}`);
          return inflight.then((r) => r.clone());
        }
      }

      const timeoutMs = path.includes("plaid/transactions")
        ? 45_000
        : path.includes("splitwise/import")
          ? 180_000
          : path.includes("receipt/parse")
            ? 60_000
            : path.includes("gmail/auth") || path.includes("gmail/scan")
              ? 30_000
              : 20_000;

      const doFetch = async (authToken: string) => {
        const reqHeaders = { ...headers, Authorization: `Bearer ${authToken}` };
        if (!timeoutMs) {
          return fetch(url, { ...opts, headers: reqHeaders, body });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, { ...opts, headers: reqHeaders, body, signal: controller.signal });
          clearTimeout(timer);
          return response;
        } catch (e) {
          clearTimeout(timer);
          throw e;
        }
      };

      const executeFetch = async (): Promise<Response> => {
        try {
          const response = await doFetch(token);
          if (__DEV__) {
            console.log(`[api] ← ${path} ${response.status}`);
            if (!response.ok) {
              response.clone().text().then((t) => console.warn(`[api] error body: ${t.slice(0, 300)}`)).catch(() => {});
            }
          }

          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get("Retry-After") ?? "10", 10);
            const waitMs = Math.max(retryAfter * 1000, BACKOFF_BASE_MS);
            _rateLimitedUntil = Date.now() + waitMs;
            if (__DEV__) console.warn(`[api] 429 rate limited — pausing all requests for ${waitMs}ms`);
            return response;
          }

          if (response.status >= 500) {
            const prev = _endpointBackoff.get(path) ?? 0;
            const elapsed = Date.now() - prev;
            const nextBackoff = prev > 0 && elapsed < BACKOFF_MAX_MS * 2
              ? Math.min((elapsed < BACKOFF_BASE_MS ? BACKOFF_BASE_MS * 2 : elapsed * 2), BACKOFF_MAX_MS)
              : BACKOFF_BASE_MS;
            _endpointBackoff.set(path, Date.now() + nextBackoff);
            if (__DEV__) console.warn(`[api] 5xx on ${path} — backing off ${nextBackoff}ms`);
            return response;
          }

          _endpointBackoff.delete(path);

          if (response.ok) {
            markTokenGood();
          }

          if (response.status === 401) {
            markTokenBad();
            _tokenPromise = null;
            let refreshed = false;
            const pending = _refreshPromise;
            if (pending) {
              const freshToken = await pending;
              if (freshToken && freshToken !== token) {
                if (__DEV__) console.log(`[api] 401 retry (shared refresh) → ${path}`);
                const retry = await doFetch(freshToken);
                if (__DEV__) console.log(`[api] ← retry ${path} ${retry.status}`);
                if (retry.ok) markTokenGood();
                refreshed = retry.ok;
                return retry;
              }
            } else {
              const p = (async () => {
                try {
                  const t = await gt({ skipCache: true });
                  if (t) _lastGoodToken = t;
                  return t;
                } catch { return null; }
              })();
              _refreshPromise = p;
              const freshToken = await p;
              if (_refreshPromise === p) _refreshPromise = null;
              if (freshToken && freshToken !== token) {
                if (__DEV__) console.log(`[api] 401 retry with fresh token → ${path}`);
                const retry = await doFetch(freshToken);
                if (__DEV__) console.log(`[api] ← retry ${path} ${retry.status}`);
                if (retry.ok) markTokenGood();
                refreshed = retry.ok;
                return retry;
              }
            }
            if (!refreshed) {
              _lastGoodToken = null;
            }
          }

          return response;
        } catch (e) {
          const isAbort = e instanceof Error && e.name === "AbortError";
          const msg = isAbort ? "Network request timed out" : (e instanceof Error ? e.message : "Network request failed");
          if (__DEV__) console.warn(`[api] fetch failed: ${path}`, msg);
          return new Response(
            JSON.stringify({ error: isAbort ? "Request timed out. Please try again." : "Network request failed. Check your connection and retry." }),
            { status: 503, statusText: msg, headers: { "Content-Type": "application/json" } }
          );
        }
      };

      if (method === "GET") {
        const promise = (async () => {
          await acquireSlot();
          try {
            const res = await executeFetch();
            const ttl = getCacheTtl(path);
            if (res.ok) {
              const clone = res.clone();
              clone.text().then((body) => {
                if (ttl > 0) {
                  const parsed = JSON.parse(body);
                  if (_responseCache.size >= MAX_CACHE_ENTRIES) {
                    const firstKey = _responseCache.keys().next().value;
                    if (firstKey !== undefined) _responseCache.delete(firstKey);
                  }
                  _responseCache.set(path, { body: parsed, status: res.status, ts: Date.now() });
                }
                if (shouldPersist(path)) {
                  // Skip persistence for responses > 2 MB to avoid AsyncStorage limits
                  if (body.length <= 2 * 1024 * 1024) {
                    persistToStorage(path, body, res.status);
                  }
                }
              }).catch(() => {});
            }
            return res;
          } finally { releaseSlot(); }
        })();
        _inflightGets.set(path, promise);
        try {
          const res = await promise;
          return res;
        } finally {
          _inflightGets.delete(path);
        }
      }

      invalidateApiCache(path);
      await acquireSlot();
      try { return await executeFetch(); } finally { releaseSlot(); }
    },
    // Empty deps: auth is read from `ref.current` each call. Clerk's `getToken` often gets a new
    // function identity every render; including it here recreated `apiFetch` every render and
    // retriggered every `useEffect([apiFetch])` → infinite updates (e.g. useGroupsSummary).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable fetcher; live auth via ref
    []
  );
}
