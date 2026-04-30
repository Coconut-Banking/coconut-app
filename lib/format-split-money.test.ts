import { formatSplitCurrencyAmount, friendBalanceLines, groupBalanceLines } from "./format-split-money";

describe("formatSplitCurrencyAmount", () => {
  it("formats USD amount", () => {
    const result = formatSplitCurrencyAmount(25.5, "USD");
    expect(result).toMatch(/25\.50/);
  });

  it("uses absolute value", () => {
    const result = formatSplitCurrencyAmount(-10, "USD");
    expect(result).toMatch(/10\.00/);
  });

  it("defaults to USD for empty currency", () => {
    const result = formatSplitCurrencyAmount(5, "");
    expect(result).toMatch(/5\.00/);
  });

  it("falls back to plain format for invalid currency", () => {
    const result = formatSplitCurrencyAmount(5, "INVALID_CURRENCY_CODE");
    expect(result).toBe("5.00 INVALID_CURRENCY_CODE");
  });
});

describe("friendBalanceLines", () => {
  it("returns balances array when present", () => {
    const balances = [{ currency: "USD", amount: 10 }];
    expect(friendBalanceLines({ balances })).toEqual(balances);
  });

  it("falls back to balance as USD", () => {
    expect(friendBalanceLines({ balance: 15 })).toEqual([{ currency: "USD", amount: 15 }]);
  });

  it("returns empty for zero balance", () => {
    expect(friendBalanceLines({ balance: 0 })).toEqual([]);
  });

  it("returns empty for tiny balance below threshold", () => {
    expect(friendBalanceLines({ balance: 0.004 })).toEqual([]);
  });

  it("returns empty when no balance data", () => {
    expect(friendBalanceLines({})).toEqual([]);
  });
});

describe("groupBalanceLines", () => {
  it("returns myBalances when present", () => {
    const myBalances = [{ currency: "EUR", amount: 20 }];
    expect(groupBalanceLines({ myBalances })).toEqual(myBalances);
  });

  it("falls back to myBalance as USD", () => {
    expect(groupBalanceLines({ myBalance: -5 })).toEqual([{ currency: "USD", amount: -5 }]);
  });

  it("returns empty for null myBalance", () => {
    expect(groupBalanceLines({ myBalance: null })).toEqual([]);
  });
});
