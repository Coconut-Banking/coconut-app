/**
 * Pure cache primitives for the API layer — no React, Expo, or RN dependencies.
 * Testable in isolation. Imported by lib/api.ts and hooks/useGroups.ts.
 */

// ── Generation counter ──────────────────────────────────────────────────
let _cacheGeneration = 0;

export function getCacheGeneration(): number {
  return _cacheGeneration;
}

// ── RAM response cache ──────────────────────────────────────────────────
const MAX_CACHE_ENTRIES = 50;

interface CacheEntry {
  body: unknown;
  status: number;
  ts: number;
  gen: number;
}

export const _responseCache = new Map<string, CacheEntry>();

const CACHE_TTL_MS: Record<string, number> = {
  "/api/plaid/status": 60_000,
  "/api/plaid/transactions": 60_000,
  "/api/groups/summary": 45_000,
  "/api/groups/recent-activity": 30_000,
  "/api/groups/person": 30_000,
  "/api/plaid/accounts": 120_000,
  "/api/splitwise/status": 0,
  "/api/gmail/status": 300_000,
  "/api/stripe/connect/status": 300_000,
  "/api/subscriptions": 60_000,
};

const GROUP_DETAIL_RE = /^\/api\/groups\/[a-f0-9-]+$/;

export function getCacheTtl(path: string): number {
  for (const [prefix, ttl] of Object.entries(CACHE_TTL_MS)) {
    if (path === prefix || path.startsWith(prefix + "?")) return ttl;
  }
  if (GROUP_DETAIL_RE.test(path)) return 10_000;
  return 0;
}

/**
 * Read from the RAM cache. Returns the cached entry only if it belongs
 * to the current generation and hasn't expired.
 */
export function readCache(path: string): CacheEntry | null {
  const ttl = getCacheTtl(path);
  if (ttl <= 0) return null;
  const entry = _responseCache.get(path);
  if (!entry) return null;
  if (entry.gen !== _cacheGeneration) return null;
  if (Date.now() - entry.ts >= ttl) return null;
  return entry;
}

/**
 * Write to the RAM cache, tagged with the current generation.
 */
export function writeCache(path: string, body: unknown, status: number): void {
  if (getCacheTtl(path) <= 0) return;
  if (_responseCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = _responseCache.keys().next().value;
    if (firstKey !== undefined) _responseCache.delete(firstKey);
  }
  _responseCache.set(path, { body, status, ts: Date.now(), gen: _cacheGeneration });
}

// ── Inflight GET tracking ───────────────────────────────────────────────
export const _inflightGets = new Map<string, Promise<Response>>();
export const _inflightAborts = new Map<string, AbortController>();

// ── Invalidation ────────────────────────────────────────────────────────

/** Targeted invalidation: clear specific path(s) from the RAM cache. */
export function invalidateApiCache(path?: string) {
  if (path) {
    for (const key of Array.from(_responseCache.keys())) {
      if (key === path || key.startsWith(path + "?")) _responseCache.delete(key);
    }
  } else {
    _responseCache.clear();
  }
}

/**
 * Nuclear invalidation: bump generation, clear all RAM caches, abort
 * inflight GETs (prevents stale re-caching).
 *
 * Accepts an optional callback to wipe async storage — injected by
 * lib/api.ts so this module stays pure (no AsyncStorage import).
 */
export function bumpCacheGeneration(clearAsyncStorage?: () => void) {
  _cacheGeneration++;
  _responseCache.clear();

  for (const [, controller] of _inflightAborts) {
    try { controller.abort(); } catch { /* ignore */ }
  }
  _inflightAborts.clear();
  _inflightGets.clear();

  if (clearAsyncStorage) clearAsyncStorage();
}

// ── Persistence helpers ─────────────────────────────────────────────────
const PERSIST_PATHS = new Set([
  "/api/groups/summary",
  "/api/groups/recent-activity",
  "/api/plaid/transactions",
  "/api/plaid/status",
  "/api/plaid/accounts",
]);

export const PERSIST_PREFIX = "coconut.api.cache.";

export function shouldPersist(path: string): boolean {
  for (const p of PERSIST_PATHS) {
    if (path === p || path.startsWith(p + "?")) return true;
  }
  if (GROUP_DETAIL_RE.test(path)) return true;
  return false;
}

// ── For tests: reset all internal state ─────────────────────────────────
export function __resetForTests() {
  _cacheGeneration = 0;
  _responseCache.clear();
  _inflightGets.clear();
  _inflightAborts.clear();
}
