import { distributeExtras, computePersonShares, ReceiptItem, ReceiptItemWithExtras, Assignee } from "./receipt-split";

describe("distributeExtras", () => {
  const items: ReceiptItem[] = [
    { id: "1", name: "Burger", quantity: 1, unitPrice: 10, totalPrice: 10 },
    { id: "2", name: "Fries", quantity: 1, unitPrice: 5, totalPrice: 5 },
    { id: "3", name: "Drink", quantity: 1, unitPrice: 5, totalPrice: 5 },
  ];

  it("returns items unchanged when no extras", () => {
    const result = distributeExtras(items, 20, 0, 0);
    expect(result).toHaveLength(3);
    expect(result[0].proportionalExtra).toBe(0);
    expect(result[0].finalPrice).toBe(10);
    expect(result[1].finalPrice).toBe(5);
  });

  it("distributes tax proportionally", () => {
    const result = distributeExtras(items, 20, 4, 0);
    expect(result[0].proportionalExtra).toBe(2); // 10/20 * 4 = 2
    expect(result[0].finalPrice).toBe(12);
    expect(result[1].proportionalExtra).toBe(1); // 5/20 * 4 = 1
    expect(result[1].finalPrice).toBe(6);
    const totalExtras = result.reduce((s, r) => s + r.proportionalExtra, 0);
    expect(totalExtras).toBeCloseTo(4, 2);
  });

  it("distributes tax + tip together", () => {
    const result = distributeExtras(items, 20, 2, 3);
    const totalExtras = result.reduce((s, r) => s + r.proportionalExtra, 0);
    expect(totalExtras).toBeCloseTo(5, 2);
  });

  it("handles zero subtotal without division error", () => {
    const zeroItems: ReceiptItem[] = [
      { id: "1", name: "Free", quantity: 1, unitPrice: 0, totalPrice: 0 },
    ];
    const result = distributeExtras(zeroItems, 0, 2, 0);
    expect(result[0].proportionalExtra).toBe(0);
    expect(result[0].finalPrice).toBe(0);
  });

  it("includes custom extras in distribution", () => {
    const extras = [{ name: "Service fee", amount: 2 }];
    const result = distributeExtras(items, 20, 0, 0, extras);
    const totalExtras = result.reduce((s, r) => s + r.proportionalExtra, 0);
    expect(totalExtras).toBeCloseTo(2, 2);
  });

  it("last item absorbs rounding remainder", () => {
    const unevenItems: ReceiptItem[] = [
      { id: "1", name: "A", quantity: 1, unitPrice: 3.33, totalPrice: 3.33 },
      { id: "2", name: "B", quantity: 1, unitPrice: 3.33, totalPrice: 3.33 },
      { id: "3", name: "C", quantity: 1, unitPrice: 3.34, totalPrice: 3.34 },
    ];
    const result = distributeExtras(unevenItems, 10, 1, 0);
    const totalFinal = result.reduce((s, r) => s + r.finalPrice, 0);
    expect(totalFinal).toBeCloseTo(11, 2);
  });
});

describe("computePersonShares", () => {
  const items: ReceiptItemWithExtras[] = [
    { id: "1", name: "Burger", quantity: 1, unitPrice: 10, totalPrice: 10, proportionalExtra: 2, finalPrice: 12 },
    { id: "2", name: "Fries", quantity: 1, unitPrice: 5, totalPrice: 5, proportionalExtra: 1, finalPrice: 6 },
  ];

  const alice: Assignee = { name: "Alice", memberId: "a1", email: "alice@test.com" };
  const bob: Assignee = { name: "Bob", memberId: "b1", email: null };

  it("assigns full item price to sole assignee", () => {
    const assignments = new Map([
      ["1", [alice]],
      ["2", [bob]],
    ]);
    const shares = computePersonShares(items, assignments);
    expect(shares).toHaveLength(2);
    const aliceShare = shares.find((s) => s.name === "Alice")!;
    expect(aliceShare.totalOwed).toBe(12);
    const bobShare = shares.find((s) => s.name === "Bob")!;
    expect(bobShare.totalOwed).toBe(6);
  });

  it("splits evenly when multiple assignees", () => {
    const assignments = new Map([
      ["1", [alice, bob]],
    ]);
    const shares = computePersonShares(items, assignments);
    const aliceShare = shares.find((s) => s.name === "Alice")!;
    const bobShare = shares.find((s) => s.name === "Bob")!;
    expect(aliceShare.totalOwed + bobShare.totalOwed).toBeCloseTo(12, 2);
  });

  it("skips unassigned items", () => {
    const assignments = new Map([["1", [alice]]]);
    const shares = computePersonShares(items, assignments);
    expect(shares).toHaveLength(1);
    expect(shares[0].totalOwed).toBe(12);
  });

  it("returns empty array when nothing assigned", () => {
    const shares = computePersonShares(items, new Map());
    expect(shares).toHaveLength(0);
  });
});
