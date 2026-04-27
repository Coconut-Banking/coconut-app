import {
  applySettlementToFriendBalance,
  applySettlementToGroupDetail,
  applySettlementToGroupSummary,
  applySettlementToPersonDetail,
  buildOptimisticSettlementActivity,
  rebuildSummary,
  type OptimisticSettlementRequest,
} from "../optimistic-settlement";
import type { GroupDetail, GroupsSummary, PersonDetail } from "../../hooks/useGroups";

const request: OptimisticSettlementRequest = {
  groupId: "g1",
  payerMemberId: "m2",
  receiverMemberId: "m1",
  amount: 10,
  currency: "USD",
};

describe("optimistic settlement helpers", () => {
  it("reduces a positive person balance and removes the matching settlement", () => {
    const detail: PersonDetail = {
      displayName: "Aaran",
      balance: 13.75,
      currencyBalances: [{ currency: "USD", amount: 13.75 }],
      activity: [],
      email: "aaran@example.com",
      key: "aaran",
      settlements: [{ groupId: "g1", fromMemberId: "m2", toMemberId: "m1", amount: 10, currency: "USD" }],
    };

    const next = applySettlementToPersonDetail(detail, [request]);

    expect(next.currencyBalances).toEqual([{ currency: "USD", amount: 3.75 }]);
    expect(next.balance).toBe(3.75);
    expect(next.settlements).toEqual([]);
  });

  it("reduces a negative friend balance toward zero", () => {
    const next = applySettlementToFriendBalance(
      {
        key: "aaran",
        displayName: "Aaran",
        balance: -15,
        balances: [{ currency: "USD", amount: -15 }],
      },
      [{ ...request, payerMemberId: "m1", receiverMemberId: "m2" }],
    );

    expect(next.balances).toEqual([{ currency: "USD", amount: -5 }]);
    expect(next.balance).toBe(-5);
  });

  it("removes a settled suggestion and zeros related group balances", () => {
    const detail: GroupDetail = {
      id: "g1",
      name: "Trip",
      members: [
        { id: "m1", user_id: "u1", email: null, display_name: "You" },
        { id: "m2", user_id: "u2", email: null, display_name: "Aaran" },
      ],
      activity: [],
      balances: [
        { memberId: "m1", currency: "USD", paid: 0, owed: 0, total: 10 },
        { memberId: "m2", currency: "USD", paid: 0, owed: 0, total: -10 },
      ],
      suggestions: [{ currency: "USD", fromMemberId: "m2", toMemberId: "m1", amount: 10 }],
      totalSpend: null,
      totalSpendByCurrency: [],
      mySpend: null,
      mySpendByCurrency: [],
    };

    const next = applySettlementToGroupDetail(detail, [request]);

    expect(next.suggestions).toEqual([]);
    expect(next.balances.map((b) => b.total)).toEqual([0, 0]);
  });

  it("rebuilds outstanding summary by removing settled zero-balance entries", () => {
    const summary: GroupsSummary = {
      groups: [
        {
          id: "g1",
          name: "Trip",
          memberCount: 2,
          myBalance: 10,
          myBalances: [{ currency: "USD", amount: 10 }],
          lastActivityAt: "2026-04-09T00:00:00.000Z",
        },
      ],
      friends: [
        {
          key: "aaran",
          displayName: "Aaran",
          balance: 10,
          balances: [{ currency: "USD", amount: 10 }],
        },
      ],
      totalOwedToMe: 10,
      totalIOwe: 0,
      netBalance: 10,
      totalsByCurrency: [{ currency: "USD", owedToMe: 10, iOwe: 0, net: 10 }],
    };

    const next = rebuildSummary(
      {
        ...summary,
        groups: [applySettlementToGroupSummary(summary.groups[0], [request])],
        friends: [applySettlementToFriendBalance(summary.friends[0], [request])],
      },
      false,
    );

    expect(next.groups).toEqual([]);
    expect(next.friends).toEqual([]);
    expect(next.totalOwedToMe).toBe(0);
    expect(next.totalIOwe).toBe(0);
    expect(next.netBalance).toBe(0);
  });

  it("builds optimistic activity rows for settlements", () => {
    const items = buildOptimisticSettlementActivity([request], "Aaran", new Map([["g1", "Trip"]]));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      who: "You",
      action: "settled",
      what: "with Aaran",
      in: "Trip",
      direction: "settled",
      amount: 10,
      currency: "USD",
      time: "Just now",
    });
  });
});
