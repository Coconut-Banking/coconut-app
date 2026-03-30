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
  merchant_type?: string | null;
  merchant_details?: Record<string, unknown> | null;
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
  extras?: Array<{ name: string; amount: number }>;
  rideshare?: {
    map_url?: string;
    pickup?: string;
    dropoff?: string;
    distance?: string;
    duration?: string;
    driver_name?: string;
    vehicle?: string;
    fare_breakdown?: Record<string, number>;
  };
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
  merchantType: string | null;
  merchantDetails: Record<string, unknown> | null;
  rideshare?: ReceiptDetailPayload["rideshare"];
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
    console.log("[fetchReceiptDetail] trying:", path);
    const res = await apiFetch(path, { method: "GET" });
    console.log("[fetchReceiptDetail] status:", res.status, "for", path);
    if (res.status === 404) { console.log("[fetchReceiptDetail] 404, skipping"); continue; }
    if (!res.ok) { console.log("[fetchReceiptDetail] not ok:", res.status, "skipping"); continue; }
    const data = (await res.json()) as ReceiptDetailPayload;
    console.log("[fetchReceiptDetail] raw data keys:", Object.keys(data));
    console.log("[fetchReceiptDetail] merchant_type:", data.merchant_type);
    console.log("[fetchReceiptDetail] merchant_details:", JSON.stringify(data.merchant_details));
    console.log("[fetchReceiptDetail] rideshare:", JSON.stringify(data.rideshare));
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
      merchantType: data.merchant_type ?? null,
      merchantDetails: data.merchant_details ?? null,
      rideshare: data.rideshare,
      subtotal,
      tax,
      tip,
      total,
      extras,
    };
  }
  console.log("[fetchReceiptDetail] all paths failed, returning null");
  return null;
}
