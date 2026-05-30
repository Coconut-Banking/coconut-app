/** Logs only in development builds — safe for PII-adjacent debugging. */

export function devLog(...args: unknown[]): void {
  if (__DEV__) console.log(...args);
}

export function devWarn(...args: unknown[]): void {
  if (__DEV__) console.warn(...args);
}
