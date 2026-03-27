/**
 * Itemized receipt preview for a bank charge linked to an email-parsed receipt.
 * Backend (coconut-web) should expose the same receipt row used by /api/receipt/parse.
 *
 * Primary: GET /api/receipt/:receiptId — JSON with receipt_items, totals (same shape as parse response).
 * Fallback: GET /api/receipt/:receiptId/items — if your API only exposes line items here.
 */
import type { ReceiptItem } from "./receipt-split";

export type ReceiptDetailPayload = {
  id?: string;
  merchant_name?: string;
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
  extras?: Array<{ name: string; amount: number }>;
  receipt_items?: Array<{
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    sort_order?: number;
  }>;
};

type ApiFetch = (
  path: string,
  opts?: { method?: string; body?: object | FormData; headers?: HeadersInit }
) => Promise<Response>;

function mapItems(data: ReceiptDetailPayload): ReceiptItem[] {
  const raw = data.receipt_items ?? [];
  const sorted = [...raw].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  return sorted.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: Number(i.quantity),
    unitPrice: Number(i.unit_price),
    totalPrice: Number(i.total_price),
  }));
}

export async function fetchReceiptDetailForTransaction(
  apiFetch: ApiFetch,
  receiptId: string
): Promise<{
  items: ReceiptItem[];
  merchantName: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  extras: Array<{ name: string; amount: number }>;
} | null> {
  const paths = [
    `/api/email-receipts/${encodeURIComponent(receiptId)}`,
    `/api/receipt/${encodeURIComponent(receiptId)}`,
    `/api/receipt/${encodeURIComponent(receiptId)}/items`,
  ];

  for (const path of paths) {
    const res = await apiFetch(path, { method: "GET" });
    if (res.status === 404) continue;
    if (!res.ok) continue;
    const data = (await res.json()) as ReceiptDetailPayload;
    const items = mapItems(data);
    const subFromItems = items.reduce((s, i) => s + i.totalPrice, 0);
    const subtotal = Number(data.subtotal ?? subFromItems);
    const tax = Number(data.tax ?? 0);
    const tip = Number(data.tip ?? 0);
    const extras = Array.isArray(data.extras) ? data.extras : [];
    const extrasSum = extras.reduce((s, e) => s + e.amount, 0);
    const total =
      data.total != null && !Number.isNaN(Number(data.total))
        ? Number(data.total)
        : subtotal + tax + tip + extrasSum;
    return {
      items,
      merchantName: data.merchant_name ?? "",
      subtotal,
      tax,
      tip,
      total,
      extras,
    };
  }
  return null;
}
