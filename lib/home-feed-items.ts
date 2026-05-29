import type { RecentActivityItem } from "../hooks/useGroups";
import type { BillRow } from "../hooks/useBills";
import type { HomeFeedFilter } from "./home-feed-filter";

export type HomeFeedItem =
  | { kind: "activity"; id: string; activity: RecentActivityItem }
  | { kind: "bill"; id: string; bill: BillRow };

function activityHaystack(it: RecentActivityItem): string {
  return [it.who, it.action, it.what, it.in, it.time, it.amount.toFixed(2)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function billHaystack(b: BillRow): string {
  return [b.label, b.groupName, b.payerName, b.receiverName, b.amount.toFixed(2), b.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function billSortKey(b: BillRow): number {
  const iso = b.paidAt ?? b.createdAt;
  return new Date(iso).getTime();
}

export function activityMatchesFeedFilter(
  item: RecentActivityItem,
  filter: HomeFeedFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "bills") return false;
  if (filter === "splits") {
    return item.direction === "get_back" || item.direction === "owe";
  }
  if (filter === "payments") return item.direction === "settled";
  return true;
}

export function buildHomeFeedItems(params: {
  activity: RecentActivityItem[];
  billsToPay: BillRow[];
  billsWaiting: BillRow[];
  billsCollecting: BillRow[];
  billsPaid: BillRow[];
  filter: HomeFeedFilter;
  search: string;
}): HomeFeedItem[] {
  const q = params.search.trim().toLowerCase();

  if (params.filter === "bills") {
    const bills = [
      ...params.billsCollecting,
      ...params.billsToPay,
      ...params.billsWaiting,
      ...params.billsPaid,
    ].sort((a, b) => billSortKey(b) - billSortKey(a));
    const rows: HomeFeedItem[] = bills.map((bill) => ({
      kind: "bill",
      id: `bill-${bill.id}`,
      bill,
    }));
    if (!q) return rows;
    return rows.filter((row) => row.kind === "bill" && billHaystack(row.bill).includes(q));
  }

  if (params.filter === "all") {
    const collectingRows: HomeFeedItem[] = params.billsCollecting.map((bill) => ({
      kind: "bill",
      id: `bill-${bill.id}`,
      bill,
    }));
    let acts = params.activity;
    if (q) acts = acts.filter((a) => activityHaystack(a).includes(q));
    const actRows = acts.map((activity) => ({
      kind: "activity" as const,
      id: activity.id,
      activity,
    }));
    const merged = [...collectingRows, ...actRows];
    if (!q) return merged;
    return merged.filter(
      (row) =>
        row.kind === "bill" ||
        (row.kind === "activity" && activityHaystack(row.activity).includes(q)),
    );
  }

  let acts = params.activity.filter((a) => activityMatchesFeedFilter(a, params.filter));
  if (q) acts = acts.filter((a) => activityHaystack(a).includes(q));

  return acts.map((activity) => ({ kind: "activity", id: activity.id, activity }));
}
