/**
 * Tests the grace period logic for biometric app lock.
 *
 * The app should NOT re-lock when backgrounded briefly (< 30s).
 * It SHOULD lock after being backgrounded for >= 30s.
 * It should NEVER lock on "inactive" (Control Center, notification shade, etc.).
 *
 * Uses a pure-logic extraction of the AppState handler to avoid
 * needing the full React Native runtime.
 */

type AppStateStatus = "active" | "background" | "inactive";

/**
 * Mirrors the AppState handler from BiometricLockProvider.
 * Only "background" records a timestamp; only "active" checks elapsed time.
 * "inactive" is intentionally ignored to avoid locking on Control Center,
 * notification shade, system alerts, etc.
 */
function createLockController(gracePeriodMs: number) {
  let isLocked = false;
  let backgroundedAt: number | null = null;

  const handler = (state: AppStateStatus) => {
    if (state === "background") {
      backgroundedAt = Date.now();
    } else if (state === "active" && backgroundedAt !== null) {
      const elapsed = Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (elapsed >= gracePeriodMs) {
        isLocked = true;
      }
    }
  };

  return {
    handler,
    get isLocked() { return isLocked; },
    unlock() { isLocked = false; },
  };
}

const GRACE_PERIOD_MS = 30_000;

describe("biometric lock grace period", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not re-lock when backgrounded for less than the grace period", () => {
    const ctrl = createLockController(GRACE_PERIOD_MS);

    ctrl.handler("background");
    jest.advanceTimersByTime(5_000);
    ctrl.handler("active");

    expect(ctrl.isLocked).toBe(false);
  });

  it("does not re-lock at the boundary minus 1ms", () => {
    const ctrl = createLockController(GRACE_PERIOD_MS);

    ctrl.handler("background");
    jest.advanceTimersByTime(GRACE_PERIOD_MS - 1);
    ctrl.handler("active");

    expect(ctrl.isLocked).toBe(false);
  });

  it("re-locks at exactly the grace period", () => {
    const ctrl = createLockController(GRACE_PERIOD_MS);

    ctrl.handler("background");
    jest.advanceTimersByTime(GRACE_PERIOD_MS);
    ctrl.handler("active");

    expect(ctrl.isLocked).toBe(true);
  });

  it("re-locks when backgrounded for longer than the grace period", () => {
    const ctrl = createLockController(GRACE_PERIOD_MS);

    ctrl.handler("background");
    jest.advanceTimersByTime(GRACE_PERIOD_MS + 10_000);
    ctrl.handler("active");

    expect(ctrl.isLocked).toBe(true);
  });

  it("does not lock on inactive state (Control Center, notifications)", () => {
    const ctrl = createLockController(GRACE_PERIOD_MS);

    ctrl.handler("inactive");
    jest.advanceTimersByTime(60_000);
    ctrl.handler("active");

    expect(ctrl.isLocked).toBe(false);
  });

  it("handles inactive -> background -> active correctly", () => {
    const ctrl = createLockController(GRACE_PERIOD_MS);

    ctrl.handler("inactive");
    jest.advanceTimersByTime(1_000);
    ctrl.handler("background");
    jest.advanceTimersByTime(GRACE_PERIOD_MS + 1_000);
    ctrl.handler("active");

    expect(ctrl.isLocked).toBe(true);
  });

  it("resets after unlock + short background trip", () => {
    const ctrl = createLockController(GRACE_PERIOD_MS);

    ctrl.handler("background");
    jest.advanceTimersByTime(GRACE_PERIOD_MS + 1_000);
    ctrl.handler("active");
    expect(ctrl.isLocked).toBe(true);

    ctrl.unlock();
    expect(ctrl.isLocked).toBe(false);

    ctrl.handler("background");
    jest.advanceTimersByTime(2_000);
    ctrl.handler("active");
    expect(ctrl.isLocked).toBe(false);
  });
});
