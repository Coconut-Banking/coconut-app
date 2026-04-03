import { merchantEmoji, transactionToHomeStripRow, buildLiveMatchedStrip } from "./home-bank-strip";
import type { Transaction } from "../hooks/useTransactions";

describe("merchantEmoji", () => {
  it("returns a consistent emoji for the same merchant", () => {
    const a = merchantEmoji("Starbucks");
    const b = merchantEmoji("Starbucks");
    expect(a).toBe(b);
  });

  it("returns an emoji string", () => {
    const result = merchantEmoji("Test");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles empty string without crashing", () => {
    expect(() => merchantEmoji("")).not.toThrow();
  });
});

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "tx-1",
  merchant: "Uber",
  amount: -25,
  date: "2026-01-15",
  category: "Transport",
  ...overrides,
} as Transaction);

describe("transactionToHomeStripRow", () => {
  it("converts a debit transaction to a strip row", () => {
    const row = transactionToHomeStripRow(makeTx());
    expect(row).not.toBeNull();
    expect(row!.merchant).toBe("Uber");
    expect(row!.amount).toBe(25);
  });

  it("returns null for credit (positive) transactions", () => {
    expect(transactionToHomeStripRow(makeTx({ amount: 50 }))).toBeNull();
  });

  it("returns null for zero amount", () => {
    expect(transactionToHomeStripRow(makeTx({ amount: 0 }))).toBeNull();
  });

  it("defaults merchant to 'Purchase' when empty", () => {
    const row = transactionToHomeStripRow(makeTx({ merchant: "" }));
    expect(row!.merchant).toBe("Purchase");
  });
});

describe("buildLiveMatchedStrip", () => {
  it("returns only debit transactions", () => {
    const txs = [
      makeTx({ id: "1", amount: -10, date: "2026-01-01" }),
      makeTx({ id: "2", amount: 50, date: "2026-01-02" }),
      makeTx({ id: "3", amount: -20, date: "2026-01-03" }),
    ];
    const rows = buildLiveMatchedStrip(txs);
    expect(rows).toHaveLength(2);
  });

  it("sorts by date descending", () => {
    const txs = [
      makeTx({ id: "1", amount: -10, date: "2026-01-01" }),
      makeTx({ id: "2", amount: -20, date: "2026-01-15" }),
      makeTx({ id: "3", amount: -5, date: "2026-01-10" }),
    ];
    const rows = buildLiveMatchedStrip(txs);
    expect(rows[0].stripId).toBe("2");
    expect(rows[1].stripId).toBe("3");
    expect(rows[2].stripId).toBe("1");
  });

  it("limits to 24 items", () => {
    const txs = Array.from({ length: 30 }, (_, i) =>
      makeTx({ id: `tx-${i}`, amount: -10, date: `2026-01-${String(i + 1).padStart(2, "0")}` })
    );
    const rows = buildLiveMatchedStrip(txs);
    expect(rows.length).toBeLessThanOrEqual(24);
  });

  it("returns empty for no transactions", () => {
    expect(buildLiveMatchedStrip([])).toHaveLength(0);
  });
});
