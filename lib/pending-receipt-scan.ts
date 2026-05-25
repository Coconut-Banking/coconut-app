/** One-shot handoff from scan-receipt → receipt tab (survives brief remounts; not URL params). */
export type PendingReceiptScan = {
  uri: string;
  mimeType: string;
  name: string;
};

let pending: PendingReceiptScan | null = null;
let consumed = false;

export function setPendingReceiptScan(scan: PendingReceiptScan): void {
  pending = scan;
  consumed = false;
}

/** Returns pending scan once per set; later calls return null until set again. */
export function takePendingReceiptScan(): PendingReceiptScan | null {
  if (consumed || !pending) return null;
  consumed = true;
  const scan = pending;
  pending = null;
  return scan;
}

export function hasPendingReceiptScan(): boolean {
  return !consumed && pending !== null;
}

export function clearPendingReceiptScan(): void {
  pending = null;
  consumed = false;
}
