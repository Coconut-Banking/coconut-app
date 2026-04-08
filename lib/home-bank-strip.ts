/**
 * Home horizontal “From your bank” strip — demo fixtures + live matched bank charges.
 */
import type { Transaction } from "../hooks/useTransactions";
import type { PrototypeBankCharge } from "./prototype-bank-demo";

const EMOJI_BUCKETS = ["🛒", "🚗", "🍕", "☕", "✈️", "🏠", "💳", "🎯", "📱", "🎬"] as const;

/** Last 4 / mask line for display (e.g. "1234" → "••1234"). */
export function formatTransactionAccountIndicator(
  accountName?: string | null,
  accountMask?: string | null
): string | null {
  const name = (accountName ?? "").trim();
  const rawMask = (accountMask ?? "").trim();
  if (!name && !rawMask) return null;
  const maskPart =
    rawMask === ""
      ? ""
      : /[•*]/.test(rawMask)
        ? rawMask
        : `••${rawMask}`;
  if (name && maskPart) return `${name} ${maskPart}`;
  if (name) return name;
  return maskPart || null;
}

/** True when two or more distinct account name/mask pairs appear on transactions. */
export function transactionsImplyMultipleAccounts(transactions: Transaction[]): boolean {
  const keys = new Set<string>();
  for (const tx of transactions) {
    const n = (tx.accountName ?? "").trim();
    const m = (tx.accountMask ?? "").trim();
    if (!n && !m) continue;
    keys.add(`${n}\0${m}`);
  }
  return keys.size >= 2;
}

function prototypeChargesImplyMultipleAccounts(charges: PrototypeBankCharge[]): boolean {
  const keys = new Set<string>();
  for (const tx of charges) {
    const n = (tx.accountName ?? "").trim();
    const m = (tx.accountMask ?? "").trim();
    if (!n && !m) continue;
    keys.add(`${n}\0${m}`);
  }
  return keys.size >= 2;
}

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
  /** Shown under merchant when user has multiple linked accounts (e.g. "Chase ••1234"). */
  accountIndicator?: string | null;
  /** Whether this transaction has already been split. */
  alreadySplit?: boolean;
};

export function demoChargeToStripRow(
  tx: PrototypeBankCharge,
  options?: { showAccountIndicator?: boolean }
): HomeBankStripRow {
  const accountIndicator =
    options?.showAccountIndicator
      ? formatTransactionAccountIndicator(tx.accountName, tx.accountMask)
      : null;
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
    accountIndicator: accountIndicator ?? undefined,
  };
}

/** Convert a raw bank Transaction into a sheet-compatible HomeBankStripRow. */
export function txToSheetRow(tx: {
  id: string;
  merchant?: string;
  rawDescription?: string;
  amount: number;
  dateStr?: string;
  date?: string;
  alreadySplit?: boolean;
  receiptId?: string | null;
  hasReceipt?: boolean;
  logoUrl?: string | null;
  category?: string;
}): HomeBankStripRow {
  const merchant = tx.merchant || tx.rawDescription || "Purchase";
  const hasReceipt = Boolean(tx.receiptId || tx.hasReceipt);
  return {
    stripId: tx.id,
    merchant,
    emoji: merchantEmoji(merchant),
    amount: Math.abs(Number(tx.amount)),
    cardDetailLine: tx.dateStr || tx.date || "",
    cardDetailIsReceipt: false,
    hasMailBadge: hasReceipt,
    sheetDateLine: tx.dateStr || tx.date || "",
    showReceiptBox: hasReceipt,
    receiptId: tx.receiptId ?? null,
    logoUrl: tx.logoUrl ?? null,
    category: tx.category ?? null,
    alreadySplit: tx.alreadySplit,
  };
}

/** Whether visible demo charges include two or more distinct accounts (for strip labels). */
export function visibleDemoChargesImplyMultipleAccounts(
  charges: PrototypeBankCharge[],
  dismissedIds: string[]
): boolean {
  const visible = charges.filter((c) => c.unsplit && !dismissedIds.includes(c.id));
  return prototypeChargesImplyMultipleAccounts(visible);
}

/**
 * Convert any debit transaction into a strip row, tagging receipt-matched ones.
 */
export function transactionToHomeStripRow(
  tx: Transaction,
  options?: { showAccountIndicator?: boolean }
): HomeBankStripRow | null {
  const amt = Number(tx.amount);
  if (!(amt < 0)) return null;

  const amount = Math.abs(amt);
  const receiptSnippet = (tx.receiptMatchLine?.trim() ?? "") || "";
  const hasReceiptSnippet = Boolean(tx.hasReceipt && receiptSnippet);
  const hasReceipt = Boolean(tx.hasReceipt || tx.receiptId);
  const dateLine = tx.dateStr || tx.date || "";
  const accountIndicator =
    options?.showAccountIndicator
      ? formatTransactionAccountIndicator(tx.accountName, tx.accountMask)
      : null;

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
    accountIndicator: accountIndicator ?? undefined,
  };
}

/**
 * All recent debit transactions for the home strip.
 * Receipt-matched ones are tagged (hasMailBadge, showReceiptBox) but all are included.
 */
/**
 * @param forStrip — transactions shown in the strip (often filtered)
 * @param allForAccountCount — full list used to detect multiple linked accounts; defaults to `forStrip`
 */
export function buildLiveMatchedStrip(
  forStrip: Transaction[],
  allForAccountCount: Transaction[] = forStrip
): HomeBankStripRow[] {
  const showAccountIndicator = transactionsImplyMultipleAccounts(allForAccountCount);
  const eligible: Transaction[] = [];
  for (const tx of forStrip) {
    const amt = Number(tx.amount);
    if (!(amt < 0)) continue;
    eligible.push(tx);
  }
  eligible.sort((a, b) => b.date.localeCompare(a.date));
  const rows: HomeBankStripRow[] = [];
  for (const tx of eligible.slice(0, 24)) {
    const row = transactionToHomeStripRow(tx, { showAccountIndicator });
    if (row) rows.push(row);
  }
  return rows;
}
