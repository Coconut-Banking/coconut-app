import type { ReceiptItem } from "./receipt-split";

/** Matches prototype Uber ride — used when receiptId === "__demo__" on home strip. */
export function getDemoItemizedReceipt(): {
  items: ReceiptItem[];
  merchantName: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  extras: Array<{ name: string; amount: number }>;
} {
  const items: ReceiptItem[] = [
    { id: "d1", name: "Trip fare", quantity: 1, unitPrice: 24.5, totalPrice: 24.5 },
    { id: "d2", name: "Booking fee", quantity: 1, unitPrice: 2.25, totalPrice: 2.25 },
    { id: "d3", name: "City fee", quantity: 1, unitPrice: 1.0, totalPrice: 1.0 },
    { id: "d4", name: "Tip", quantity: 1, unitPrice: 4.0, totalPrice: 4.0 },
  ];
  const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
  const tax = 0;
  const tip = 0;
  return {
    items,
    merchantName: "Uber",
    subtotal,
    tax,
    tip,
    total: 31.75,
    extras: [],
  };
}
