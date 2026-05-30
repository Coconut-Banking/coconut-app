// Receipt Split — proportional tax/tip distribution (port from web)

export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptItemWithExtras extends ReceiptItem {
  proportionalExtra: number;
  finalPrice: number;
}

export interface Assignee {
  name: string;
  memberId: string | null;
  email?: string | null;
}

export interface PersonShare {
  name: string;
  memberId: string | null;
  email?: string | null;
  items: Array<{ itemName: string; shareAmount: number }>;
  totalOwed: number;
}

export function distributeExtras(
  items: ReceiptItem[],
  subtotal: number,
  tax: number,
  tip: number,
  extras: Array<{ name: string; amount: number }> = []
): ReceiptItemWithExtras[] {
  const extrasSum = extras.reduce((s, e) => s + e.amount, 0);
  const extraPool = tax + tip + extrasSum;
  if (subtotal === 0 || extraPool === 0) {
    return items.map((item) => ({
      ...item,
      proportionalExtra: 0,
      finalPrice: item.totalPrice,
    }));
  }
  let allocatedExtra = 0;
  return items.map((item, index) => {
    const proportion = item.totalPrice / subtotal;
    let extra: number;
    if (index === items.length - 1) {
      extra = Math.round((extraPool - allocatedExtra) * 100) / 100;
    } else {
      extra = Math.round(proportion * extraPool * 100) / 100;
      allocatedExtra += extra;
    }
    return {
      ...item,
      proportionalExtra: extra,
      finalPrice: Math.round((item.totalPrice + extra) * 100) / 100,
    };
  });
}

/**
 * Integer-cent split per item (matches web lib/receipt-split.ts).
 * Remainder cents go to the first N assignees.
 */
export function computePersonShares(
  items: ReceiptItemWithExtras[],
  assignments: Map<string, Assignee[]>
): PersonShare[] {
  const personMap = new Map<string, PersonShare>();

  for (const item of items) {
    const assignees = assignments.get(item.id);
    if (!assignees || assignees.length === 0) continue;

    const totalCents = Math.round(item.finalPrice * 100);
    const baseCents = Math.floor(totalCents / assignees.length);
    const remainderCents = totalCents - baseCents * assignees.length;

    assignees.forEach((assignee, idx) => {
      const key = assignee.name.toLowerCase();
      if (!personMap.has(key)) {
        personMap.set(key, {
          name: assignee.name,
          memberId: assignee.memberId,
          email: assignee.email,
          items: [],
          totalOwed: 0,
        });
      }
      const person = personMap.get(key)!;
      const amountCents = baseCents + (idx < remainderCents ? 1 : 0);
      const amount = amountCents / 100;

      person.items.push({ itemName: item.name, shareAmount: amount });
      person.totalOwed = Math.round((person.totalOwed + amount) * 100) / 100;
    });
  }

  return Array.from(personMap.values());
}
