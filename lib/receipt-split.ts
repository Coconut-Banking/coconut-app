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

export function computePersonShares(
  items: ReceiptItemWithExtras[],
  assignments: Map<string, Assignee[]>
): PersonShare[] {
  const personMap = new Map<string, PersonShare>();
  for (const item of items) {
    const assignees = assignments.get(item.id);
    if (!assignees || assignees.length === 0) continue;
    const sharePerPerson = Math.round((item.finalPrice / assignees.length) * 100) / 100;
    let allocated = 0;
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
      let amount: number;
      if (idx === assignees.length - 1) {
        amount = Math.round((item.finalPrice - allocated) * 100) / 100;
      } else {
        amount = sharePerPerson;
        allocated += amount;
      }
      person.items.push({ itemName: item.name, shareAmount: amount });
      person.totalOwed = Math.round((person.totalOwed + amount) * 100) / 100;
    });
  }
  return Array.from(personMap.values());
}
