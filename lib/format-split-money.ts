/**
 * Display amounts for split balances (per ISO currency; never mix currencies in one number).
 */
export function formatSplitCurrencyAmount(amount: number, currency: string): string {
  const c = currency.trim().toUpperCase() || "USD";
  const abs = Math.abs(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs);
  } catch {
    return `${abs.toFixed(2)} ${c}`;
  }
}

export function friendBalanceLines(f: {
  balances?: { currency: string; amount: number }[];
  balance?: number | null;
}, defaultCurrency = "USD"): { currency: string; amount: number }[] {
  if (f.balances && f.balances.length > 0) return f.balances;
  if (f.balance != null && Math.abs(f.balance) >= 0.005) {
    return [{ currency: defaultCurrency, amount: f.balance }];
  }
  return [];
}

export function groupBalanceLines(g: {
  myBalances?: { currency: string; amount: number }[];
  myBalance?: number | null;
}, defaultCurrency = "USD"): { currency: string; amount: number }[] {
  if (g.myBalances && g.myBalances.length > 0) return g.myBalances;
  if (g.myBalance != null && Math.abs(g.myBalance) >= 0.005) {
    return [{ currency: defaultCurrency, amount: g.myBalance }];
  }
  return [];
}
