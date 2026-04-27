/**
 * Module-level lock so only one component attempts connectReader at a time.
 * The eager connector acquires this at app start; pay.tsx waits for it
 * before attempting its own connection.
 */
let _promise: Promise<void> | null = null;
let _resolve: (() => void) | null = null;

export function acquireConnectLock(): boolean {
  if (_promise) return false;
  _promise = new Promise<void>((r) => { _resolve = r; });
  return true;
}

export function releaseConnectLock(): void {
  _resolve?.();
  _promise = null;
  _resolve = null;
}

export function waitForConnectLock(): Promise<void> {
  return _promise ?? Promise.resolve();
}
