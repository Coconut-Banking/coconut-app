/** Figma home money display — `$132.00` (Neue Plak), not `US$132.51`. */
export function formatHomeMoney(amount: number, currency = "USD"): string {
  const abs = Math.abs(amount);
  const c = currency.trim().toUpperCase() || "USD";
  if (c === "USD") {
    return `$${abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs);
  } catch {
    return `$${abs.toFixed(2)}`;
  }
}
