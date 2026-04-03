/**
 * Home horizontal “From your bank” strip — demo fixtures + live matched bank charges.
 */
import type { Transaction } from "../hooks/useTransactions";
import type { PrototypeBankCharge } from "./prototype-bank-demo";

const EMOJI_BUCKETS = ["🛒", "🚗", "🍕", "☕", "✈️", "🏠", "💳", "🎯", "📱", "🎬"] as const;

export function merchantEmoji(merchant: string): string {
  let h = 0;
  const s = merchant || "?";
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return EMOJI_BUCKETS[Math.abs(h) % EMOJI_BUCKETS.length];
}

/** Row model shared by demo + live (cards + bottom sheet). */
export type HomeBankStripRow = {
  stripId: string;
  merchant: string;
  emoji: string;
  /** Positive dollars for display */
  amount: number;
  /** Under merchant on card */
  cardDetailLine: string;
  cardDetailIsReceipt: boolean;
  hasMailBadge: boolean;
  /** Under title in sheet */
  sheetDateLine: string;
  showReceiptBox: boolean;
  receiptBoxText?: string;
  /** Server receipt uuid for GET /api/receipt/:id (itemized lines). */
  receiptId?: string | null;
  /** Plaid counterparty logo URL. */
  logoUrl?: string | null;
  /** Transaction category for icon fallback (e.g. "FOOD_AND_DRINK"). */
  category?: string | null;
};

export function demoChargeToStripRow(tx: PrototypeBankCharge): HomeBankStripRow {
  return {
    stripId: tx.id,
    merchant: tx.merchant,
    emoji: tx.emoji,
    amount: Math.abs(tx.amount),
    cardDetailLine: tx.hasEmail && tx.emailLine ? tx.emailLine : tx.date,
    cardDetailIsReceipt: Boolean(tx.hasEmail && tx.emailLine),
    hasMailBadge: Boolean(tx.hasEmail),
    sheetDateLine: tx.date,
    showReceiptBox: Boolean(tx.hasEmail && tx.emailLine),
    receiptBoxText: tx.emailLine,
    receiptId: tx.receiptId ?? null,
  };
}

/**
 * Convert any debit transaction into a strip row, tagging receipt-matched ones.
 */
export function transactionToHomeStripRow(tx: Transaction): HomeBankStripRow | null {
  const amt = Number(tx.amount);
  if (!(amt < 0)) return null;

  const amount = Math.abs(amt);
  const receiptSnippet = (tx.receiptMatchLine?.trim() ?? "") || "";
  const hasReceiptSnippet = Boolean(tx.hasReceipt && receiptSnippet);
  const hasReceipt = Boolean(tx.hasReceipt || tx.receiptId);
  const dateLine = tx.dateStr || tx.date || "";

  return {
    stripId: tx.id,
    merchant: tx.merchant || "Purchase",
    emoji: merchantEmoji(tx.merchant || ""),
    amount,
    cardDetailLine: hasReceiptSnippet ? receiptSnippet : dateLine,
    cardDetailIsReceipt: hasReceipt,
    hasMailBadge: hasReceipt,
    sheetDateLine: dateLine,
    showReceiptBox: hasReceipt,
    receiptBoxText: hasReceiptSnippet ? receiptSnippet : undefined,
    receiptId: tx.receiptId ?? null,
    logoUrl: tx.logoUrl ?? null,
    category: tx.category ?? null,
  };
}

/**
 * All recent debit transactions for the home strip.
 * Receipt-matched ones are tagged (hasMailBadge, showReceiptBox) but all are included.
 */
export function buildLiveMatchedStrip(transactions: Transaction[]): HomeBankStripRow[] {
  const eligible: Transaction[] = [];
  for (const tx of transactions) {
    const amt = Number(tx.amount);
    if (!(amt < 0)) continue;
    eligible.push(tx);
  }
  eligible.sort((a, b) => b.date.localeCompare(a.date));
  const rows: HomeBankStripRow[] = [];
  for (const tx of eligible.slice(0, 24)) {
    const row = transactionToHomeStripRow(tx);
    if (row) rows.push(row);
  }
  return rows;
}
