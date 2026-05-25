export type TxSourceTab = "all" | "receipts";

export function transactionHasEmailReceipt(tx: {
  hasReceipt?: boolean;
  receiptId?: string | null;
}): boolean {
  return Boolean(tx.hasReceipt || tx.receiptId);
}
