import type {
  FriendBalance,
  GroupDetail,
  GroupSummary,
  GroupsSummary,
  PersonDetail,
  RecentActivityItem,
} from "../hooks/useGroups";

const EPS = 0.005;

export type OptimisticSettlementRequest = {
  groupId: string;
  payerMemberId: string;
  receiverMemberId: string;
  amount: number;
  currency: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function moveAmountTowardZero(value: number, delta: number): number {
  if (Math.abs(value) < EPS || delta <= 0) return round2(value);
  if (value > 0) return round2(Math.max(0, value - delta));
  return round2(Math.min(0, value + delta));
}

function normalizeCurrencyBalances<T extends { currency: string; amount: number }>(items: T[]): T[] {
  return items
    .map((item) => ({ ...item, amount: round2(item.amount) }))
    .filter((item) => Math.abs(item.amount) >= EPS)
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function applySettlementToCurrencyBalances(
  balances: Array<{ currency: string; amount: number }>,
  request: OptimisticSettlementRequest,
): Array<{ currency: string; amount: number }> {
  const next = balances.map((entry) =>
    entry.currency === request.currency
      ? { ...entry, amount: moveAmountTowardZero(entry.amount, request.amount) }
      : entry,
  );
  return normalizeCurrencyBalances(next);
}

export function applySettlementToPersonDetail(
  detail: PersonDetail,
  requests: OptimisticSettlementRequest[],
): PersonDetail {
  let currencyBalances = [...detail.currencyBalances];
  let settlements = [...(detail.settlements ?? [])];

  for (const request of requests) {
    currencyBalances = applySettlementToCurrencyBalances(currencyBalances, request);
    settlements = settlements
      .map((settlement) => {
        const matches =
          settlement.groupId === request.groupId &&
          settlement.fromMemberId === request.payerMemberId &&
          settlement.toMemberId === request.receiverMemberId &&
          settlement.currency === request.currency;
        if (!matches) return settlement;
        return {
          ...settlement,
          amount: round2(Math.max(0, settlement.amount - request.amount)),
        };
      })
      .filter((settlement) => settlement.amount >= 0.01);
  }

  return {
    ...detail,
    balance: currencyBalances.length === 1 ? currencyBalances[0].amount : currencyBalances.length === 0 ? 0 : null,
    currencyBalances,
    settlements,
  };
}

export function applySettlementToFriendBalance(
  friend: FriendBalance,
  requests: OptimisticSettlementRequest[],
): FriendBalance {
  let balances = [...friend.balances];
  for (const request of requests) {
    balances = applySettlementToCurrencyBalances(balances, request);
  }
  return {
    ...friend,
    balance: balances.length === 1 ? balances[0].amount : balances.length === 0 ? 0 : null,
    balances,
  };
}

export function applySettlementToGroupSummary(
  group: GroupSummary,
  requests: OptimisticSettlementRequest[],
): GroupSummary {
  let myBalances = [...group.myBalances];
  for (const request of requests) {
    if (request.groupId !== group.id) continue;
    myBalances = applySettlementToCurrencyBalances(myBalances, request);
  }
  return {
    ...group,
    myBalance: myBalances.length === 1 ? myBalances[0].amount : myBalances.length === 0 ? 0 : null,
    myBalances,
  };
}

export function applySettlementToGroupDetail(
  detail: GroupDetail,
  requests: OptimisticSettlementRequest[],
): GroupDetail {
  let suggestions = [...detail.suggestions];
  let balances = detail.balances.map((row) => ({ ...row }));

  for (const request of requests) {
    if (request.groupId !== detail.id) continue;

    suggestions = suggestions
      .map((suggestion) => {
        const matches =
          suggestion.currency === request.currency &&
          suggestion.fromMemberId === request.payerMemberId &&
          suggestion.toMemberId === request.receiverMemberId;
        if (!matches) return suggestion;
        return {
          ...suggestion,
          amount: round2(Math.max(0, suggestion.amount - request.amount)),
        };
      })
      .filter((suggestion) => suggestion.amount >= 0.01);

    balances = balances.map((row) => {
      if (row.currency !== request.currency) return row;
      if (row.memberId !== request.payerMemberId && row.memberId !== request.receiverMemberId) return row;
      return {
        ...row,
        total: moveAmountTowardZero(row.total, request.amount),
      };
    });
  }

  return {
    ...detail,
    suggestions,
    balances: balances.filter((row) => Math.abs(row.total) >= EPS || detail.members.some((m) => m.id === row.memberId)),
  };
}

export function rebuildSummary(summary: GroupsSummary, showAll: boolean): GroupsSummary {
  const friends = showAll ? summary.friends : summary.friends.filter((friend) => friend.balances.length > 0);
  const groups = showAll ? summary.groups : summary.groups.filter((group) => group.myBalances.length > 0);

  const totalsMap = new Map<string, { owedToMe: number; iOwe: number }>();
  for (const friend of friends) {
    for (const balance of friend.balances) {
      const row = totalsMap.get(balance.currency) ?? { owedToMe: 0, iOwe: 0 };
      if (balance.amount > EPS) row.owedToMe += balance.amount;
      else if (balance.amount < -EPS) row.iOwe += Math.abs(balance.amount);
      totalsMap.set(balance.currency, row);
    }
  }

  const totalsByCurrency = [...totalsMap.entries()]
    .map(([currency, totals]) => ({
      currency,
      owedToMe: round2(totals.owedToMe),
      iOwe: round2(totals.iOwe),
      net: round2(totals.owedToMe - totals.iOwe),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    ...summary,
    friends,
    groups,
    totalOwedToMe: totalsByCurrency.length === 1 ? totalsByCurrency[0].owedToMe : totalsByCurrency.length === 0 ? 0 : null,
    totalIOwe: totalsByCurrency.length === 1 ? totalsByCurrency[0].iOwe : totalsByCurrency.length === 0 ? 0 : null,
    netBalance: totalsByCurrency.length === 1 ? totalsByCurrency[0].net : totalsByCurrency.length === 0 ? 0 : null,
    totalsByCurrency,
  };
}

export function buildOptimisticSettlementActivity(
  requests: OptimisticSettlementRequest[],
  counterpartyName: string,
  groupNameById: Map<string, string>,
): RecentActivityItem[] {
  const nowId = Date.now();
  return requests.map((request, index) => ({
    id: `optimistic-settlement-${nowId}-${index}`,
    who: "You",
    action: "settled",
    what: `with ${counterpartyName}`,
    in: groupNameById.get(request.groupId) ?? "",
    direction: "settled",
    amount: round2(request.amount),
    currency: request.currency,
    time: "Just now",
    receiptUrl: null,
  }));
}
