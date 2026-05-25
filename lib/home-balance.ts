import type { GroupsSummary } from "../hooks/useGroups";
import { friendBalanceLines, groupBalanceLines } from "./format-split-money";

const EPS = 0.005;

export type HomeOweRow = {
  key: string;
  title: string;
  subtitle: string;
  lines: { currency: string; amount: number }[];
  imageUrl?: string | null;
  isGroup?: boolean;
};

export type HomeBalancePartition = {
  owedToYou: HomeOweRow[];
  youOwe: HomeOweRow[];
};

export type HomeDisplayTotals = {
  currency: string;
  owedToMe: number;
  iOwe: number;
  net: number;
  settled: boolean;
  multiCurrency: boolean;
};

/** Split friends + multi-person groups into In / Out expand rows (matches Splits tab lists). */
export function partitionSummary(
  summary: GroupsSummary | null,
  defaultCurrency = "USD",
): HomeBalancePartition {
  const owedToYou: HomeOweRow[] = [];
  const youOwe: HomeOweRow[] = [];

  for (const f of summary?.friends ?? []) {
    const lines = friendBalanceLines(f, defaultCurrency).filter((l) => Math.abs(l.amount) >= EPS);
    if (lines.length === 0) continue;
    const net = lines.reduce((s, l) => s + l.amount, 0);
    const row: HomeOweRow = {
      key: `f-${f.key}`,
      title: f.displayName,
      subtitle: net > 0 ? "owes you" : "you owe",
      lines: lines.map((l) => ({ currency: l.currency, amount: Math.abs(l.amount) })),
      imageUrl: f.image_url,
    };
    if (net > EPS) owedToYou.push(row);
    else if (net < -EPS) youOwe.push(row);
  }

  for (const g of summary?.groups ?? []) {
    const lines = groupBalanceLines(g, defaultCurrency).filter((l) => Math.abs(l.amount) >= EPS);
    if (lines.length === 0) continue;
    const net = lines.reduce((s, l) => s + l.amount, 0);
    const row: HomeOweRow = {
      key: `g-${g.id}`,
      title: g.name,
      subtitle: `${g.memberCount} members`,
      lines: lines.map((l) => ({ currency: l.currency, amount: Math.abs(l.amount) })),
      imageUrl: g.imageUrl,
      isGroup: true,
    };
    if (net > EPS) owedToYou.push(row);
    else if (net < -EPS) youOwe.push(row);
  }

  return { owedToYou, youOwe };
}

function sumLinesForCurrency(rows: HomeOweRow[], currency: string): number {
  let total = 0;
  for (const row of rows) {
    for (const line of row.lines) {
      if (line.currency === currency) total += line.amount;
    }
  }
  return Math.round(total * 100) / 100;
}

function pickPrimaryCurrency(summary: GroupsSummary | null, defaultCurrency: string): string {
  const rows = summary?.totalsByCurrency ?? [];
  if (rows.length === 0) return defaultCurrency;
  return rows.find((r) => r.currency === defaultCurrency)?.currency ?? rows[0].currency;
}

/**
 * Headline In/Out/net for home — includes group balances in the expand pills,
 * not only friend-level totals from the API summary.
 */
export function computeHomeDisplayTotals(
  summary: GroupsSummary | null,
  partition: HomeBalancePartition,
  defaultCurrency = "USD",
): HomeDisplayTotals {
  const currency = pickPrimaryCurrency(summary, defaultCurrency);
  const owedToMe = sumLinesForCurrency(partition.owedToYou, currency);
  const iOwe = sumLinesForCurrency(partition.youOwe, currency);
  const net = Math.round((owedToMe - iOwe) * 100) / 100;
  const settled =
    Math.abs(net) < EPS &&
    partition.owedToYou.length === 0 &&
    partition.youOwe.length === 0;

  const currencies = new Set<string>();
  for (const row of [...partition.owedToYou, ...partition.youOwe]) {
    for (const line of row.lines) currencies.add(line.currency);
  }
  const multiCurrency = currencies.size > 1;

  return { currency, owedToMe, iOwe, net, settled, multiCurrency };
}
