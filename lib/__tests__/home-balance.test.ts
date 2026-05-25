import type { GroupsSummary } from "../../hooks/useGroups";
import { computeHomeDisplayTotals, partitionSummary } from "../home-balance";

function makeSummary(overrides: Partial<GroupsSummary> = {}): GroupsSummary {
  return {
    groups: [],
    friends: [],
    totalOwedToMe: 0,
    totalIOwe: 0,
    netBalance: 0,
    totalsByCurrency: [],
    ...overrides,
  };
}

describe("partitionSummary", () => {
  it("puts unsettled group in Out when friend is settled (API friend totals are zero)", () => {
    const summary = makeSummary({
      friends: [
        {
          key: "sam",
          displayName: "Sam",
          balance: 0,
          balances: [],
        },
      ],
      groups: [
        {
          id: "trip",
          name: "Trip",
          memberCount: 3,
          myBalance: -40,
          myBalances: [{ currency: "USD", amount: -40 }],
          lastActivityAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      totalOwedToMe: 0,
      totalIOwe: 0,
      netBalance: 0,
      totalsByCurrency: [{ currency: "USD", owedToMe: 0, iOwe: 0, net: 0 }],
    });

    const partition = partitionSummary(summary);
    expect(partition.owedToYou).toHaveLength(0);
    expect(partition.youOwe).toHaveLength(1);
    expect(partition.youOwe[0].title).toBe("Trip");
    expect(partition.youOwe[0].lines).toEqual([{ currency: "USD", amount: 40 }]);
  });

  it("shows settled friend in In and unsettled group in Out independently", () => {
    const summary = makeSummary({
      friends: [
        {
          key: "alex",
          displayName: "Alex",
          balance: 25,
          balances: [{ currency: "USD", amount: 25 }],
        },
      ],
      groups: [
        {
          id: "ski",
          name: "Ski trip",
          memberCount: 4,
          myBalance: -10,
          myBalances: [{ currency: "USD", amount: -10 }],
          lastActivityAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      totalsByCurrency: [{ currency: "USD", owedToMe: 25, iOwe: 0, net: 25 }],
    });

    const partition = partitionSummary(summary);
    expect(partition.owedToYou.map((r) => r.title)).toEqual(["Alex"]);
    expect(partition.youOwe.map((r) => r.title)).toEqual(["Ski trip"]);
  });
});

describe("computeHomeDisplayTotals", () => {
  it("includes group debt in In/Out pills even when API friend-only net is zero", () => {
    const summary = makeSummary({
      groups: [
        {
          id: "trip",
          name: "Trip",
          memberCount: 3,
          myBalance: -40,
          myBalances: [{ currency: "USD", amount: -40 }],
          lastActivityAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      totalsByCurrency: [{ currency: "USD", owedToMe: 0, iOwe: 0, net: 0 }],
    });
    const partition = partitionSummary(summary);
    const totals = computeHomeDisplayTotals(summary, partition);

    expect(totals.settled).toBe(false);
    expect(totals.iOwe).toBe(40);
    expect(totals.owedToMe).toBe(0);
    expect(totals.net).toBe(-40);
  });

  it("aggregates friend In and group Out for headline net", () => {
    const summary = makeSummary({
      friends: [
        {
          key: "alex",
          displayName: "Alex",
          balance: 25,
          balances: [{ currency: "USD", amount: 25 }],
        },
      ],
      groups: [
        {
          id: "ski",
          name: "Ski trip",
          memberCount: 4,
          myBalance: -10,
          myBalances: [{ currency: "USD", amount: -10 }],
          lastActivityAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      totalsByCurrency: [{ currency: "USD", owedToMe: 25, iOwe: 0, net: 25 }],
    });
    const partition = partitionSummary(summary);
    const totals = computeHomeDisplayTotals(summary, partition);

    expect(totals.owedToMe).toBe(25);
    expect(totals.iOwe).toBe(10);
    expect(totals.net).toBe(15);
    expect(totals.settled).toBe(false);
  });
});
