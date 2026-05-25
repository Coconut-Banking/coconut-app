import { findSettlementForPerson } from "../payment-link";

describe("findSettlementForPerson", () => {
  const suggestions = [
    {
      fromMemberId: "m-koushik",
      toMemberId: "m-me",
      fromName: "Koushik",
      toName: "You",
      amount: 7.63,
    },
    {
      fromMemberId: "m-aaran",
      toMemberId: "m-me",
      fromName: "Aaran Muraleetharan",
      toName: "You",
      amount: 7.63,
    },
  ];

  const members = [
    { id: "m-koushik", displayName: "Koushik" },
    { id: "m-aaran", displayName: "Aaran Muraleetharan" },
  ];

  it("matches by member id when display name differs from assignee name", () => {
    const hit = findSettlementForPerson(
      { name: "Koushik Paul", memberId: "m-koushik", totalOwed: 7.63 },
      suggestions,
      members,
    );
    expect(hit?.fromMemberId).toBe("m-koushik");
  });

  it("matches fuzzy first name", () => {
    const hit = findSettlementForPerson(
      { name: "Aaran", memberId: null, totalOwed: 7.63 },
      suggestions,
      members,
    );
    expect(hit?.fromMemberId).toBe("m-aaran");
  });

  it("ignores memberId from a different group", () => {
    const hit = findSettlementForPerson(
      { name: "Koushik", memberId: "m-old-group-id", totalOwed: 7.63 },
      suggestions,
      members,
    );
    expect(hit?.fromMemberId).toBe("m-koushik");
  });
});
