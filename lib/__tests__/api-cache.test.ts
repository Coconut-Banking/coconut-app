/**
 * Tests for the cache infrastructure in lib/api-cache.ts:
 * - Generation-based invalidation
 * - RAM cache read/write with TTL + generation
 * - Inflight GET abort on generation bump
 * - invalidateApiCache targeted clearing
 * - writeCache respects TTL=0 paths
 */
import {
  getCacheGeneration,
  readCache,
  writeCache,
  invalidateApiCache,
  bumpCacheGeneration,
  getCacheTtl,
  shouldPersist,
  _responseCache,
  _inflightGets,
  _inflightAborts,
  __resetForTests,
} from "../api-cache";

beforeEach(() => {
  __resetForTests();
});

describe("cache generation", () => {
  test("starts at 0", () => {
    expect(getCacheGeneration()).toBe(0);
  });

  test("bumpCacheGeneration increments", () => {
    bumpCacheGeneration();
    expect(getCacheGeneration()).toBe(1);
    bumpCacheGeneration();
    expect(getCacheGeneration()).toBe(2);
  });

  test("bumpCacheGeneration clears RAM cache", () => {
    writeCache("/api/groups/summary", { groups: [] }, 200);
    expect(_responseCache.size).toBe(1);
    bumpCacheGeneration();
    expect(_responseCache.size).toBe(0);
  });

  test("bumpCacheGeneration calls the async storage callback", () => {
    const cb = jest.fn();
    bumpCacheGeneration(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test("bumpCacheGeneration aborts inflight GETs", () => {
    const controller = new AbortController();
    _inflightAborts.set("/api/groups/summary", controller);
    _inflightGets.set("/api/groups/summary", Promise.resolve(new Response()));

    expect(controller.signal.aborted).toBe(false);
    bumpCacheGeneration();
    expect(controller.signal.aborted).toBe(true);
    expect(_inflightAborts.size).toBe(0);
    expect(_inflightGets.size).toBe(0);
  });
});

describe("readCache / writeCache", () => {
  test("writeCache + readCache round-trip for a cached path", () => {
    const body = { groups: [{ id: "g1" }] };
    writeCache("/api/groups/summary", body, 200);
    const entry = readCache("/api/groups/summary");
    expect(entry).not.toBeNull();
    expect(entry!.body).toEqual(body);
    expect(entry!.status).toBe(200);
  });

  test("readCache returns null for TTL=0 paths", () => {
    writeCache("/api/splitwise/status", { connected: true }, 200);
    expect(readCache("/api/splitwise/status")).toBeNull();
  });

  test("readCache returns null for paths not in the TTL map", () => {
    writeCache("/api/some/random/path", {}, 200);
    expect(readCache("/api/some/random/path")).toBeNull();
  });

  test("readCache returns null after generation bump", () => {
    writeCache("/api/groups/summary", { groups: [] }, 200);
    expect(readCache("/api/groups/summary")).not.toBeNull();

    bumpCacheGeneration();
    // Re-check: the entry was cleared by the bump
    expect(readCache("/api/groups/summary")).toBeNull();
  });

  test("entry written in old generation is rejected even if re-inserted", () => {
    writeCache("/api/groups/summary", { old: true }, 200);
    const gen0Entry = _responseCache.get("/api/groups/summary");

    bumpCacheGeneration();

    // Manually re-insert the old entry (simulating stale GET completing)
    if (gen0Entry) _responseCache.set("/api/groups/summary", gen0Entry);

    // readCache should reject it because gen doesn't match
    expect(readCache("/api/groups/summary")).toBeNull();
  });

  test("writeCache does not exceed MAX_CACHE_ENTRIES", () => {
    for (let i = 0; i < 60; i++) {
      writeCache(`/api/groups/summary?page=${i}`, { i }, 200);
    }
    expect(_responseCache.size).toBeLessThanOrEqual(50);
  });
});

describe("invalidateApiCache", () => {
  test("targeted: clears matching path", () => {
    writeCache("/api/groups/summary", {}, 200);
    writeCache("/api/groups/summary?contacts=1", {}, 200);
    writeCache("/api/plaid/status", {}, 200);

    invalidateApiCache("/api/groups/summary");
    expect(_responseCache.has("/api/groups/summary")).toBe(false);
    expect(_responseCache.has("/api/groups/summary?contacts=1")).toBe(false);
    expect(_responseCache.has("/api/plaid/status")).toBe(true);
  });

  test("no args: clears everything", () => {
    writeCache("/api/groups/summary", {}, 200);
    writeCache("/api/plaid/status", {}, 200);

    invalidateApiCache();
    expect(_responseCache.size).toBe(0);
  });
});

describe("getCacheTtl", () => {
  test("returns configured TTL for known paths", () => {
    expect(getCacheTtl("/api/groups/summary")).toBe(45_000);
    expect(getCacheTtl("/api/plaid/status")).toBe(60_000);
    expect(getCacheTtl("/api/splitwise/status")).toBe(0);
  });

  test("returns TTL for query-string variants", () => {
    expect(getCacheTtl("/api/groups/summary?contacts=1")).toBe(45_000);
  });

  test("returns 10s for group detail paths", () => {
    expect(getCacheTtl("/api/groups/a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(10_000);
  });

  test("returns 0 for unknown paths", () => {
    expect(getCacheTtl("/api/something/else")).toBe(0);
  });
});

describe("shouldPersist", () => {
  test("persists summary and plaid paths", () => {
    expect(shouldPersist("/api/groups/summary")).toBe(true);
    expect(shouldPersist("/api/plaid/transactions")).toBe(true);
    expect(shouldPersist("/api/plaid/status")).toBe(true);
  });

  test("persists group detail UUIDs", () => {
    expect(shouldPersist("/api/groups/a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
  });

  test("does not persist arbitrary paths", () => {
    expect(shouldPersist("/api/splitwise/status")).toBe(false);
    expect(shouldPersist("/api/some/other")).toBe(false);
  });
});
