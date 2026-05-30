import { describe, it, expect } from "@jest/globals";
import {
  computeEqualShares,
  computePercentShares,
  computeSharesByRatio,
  allocateCrossGroupSettlementPayments,
  sumShareAmountsCents,
  toCents,
} from "../expense-shares";

describe("mobile expense-shares (parity with web)", () => {
  it("equal split sums to total for 7 people on $100", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const shares = computeEqualShares(100, ids);
    expect(sumShareAmountsCents(shares)).toBe(10000);
  });

  it("percent split matches web remainder behavior", () => {
    const shares = computePercentShares(10, [
      { memberId: "a", percent: 33.3 },
      { memberId: "b", percent: 33.3 },
      { memberId: "c", percent: 33.4 },
    ]);
    expect(sumShareAmountsCents(shares)).toBe(1000);
  });

  it("cross-group allocation sums partial payment", () => {
    const out = allocateCrossGroupSettlementPayments(25, [
      { groupId: "g1", payerMemberId: "p", receiverMemberId: "r", amountOwed: 20, currency: "USD" },
      { groupId: "g2", payerMemberId: "p", receiverMemberId: "r", amountOwed: 30, currency: "USD" },
    ]);
    expect(sumShareAmountsCents(out.map((x) => ({ amount: x.payAmount })))).toBe(2500);
  });
});
