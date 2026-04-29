export interface PersonBalance {
  personId: string;
  balance: number;
}

export interface SimplifiedTransfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Minimize the number of transfers needed to settle all balances in a group.
 *
 * Positive balance = person is owed money (creditor).
 * Negative balance = person owes money (debtor).
 *
 * Greedy algorithm: repeatedly match the largest debtor with the largest
 * creditor, transferring the smaller of the two absolute values. This
 * produces an optimal (minimum-count) set of transfers for the common case
 * and is O(n log n) for n participants.
 */
export function simplifyDebts(balances: PersonBalance[]): SimplifiedTransfer[] {
  const EPSILON = 0.005;

  const creditors: { personId: string; amount: number }[] = [];
  const debtors: { personId: string; amount: number }[] = [];

  for (const { personId, balance } of balances) {
    if (balance > EPSILON) {
      creditors.push({ personId, amount: balance });
    } else if (balance < -EPSILON) {
      debtors.push({ personId, amount: -balance });
    }
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: SimplifiedTransfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const transfer = Math.round(Math.min(creditor.amount, debtor.amount) * 100) / 100;

    if (transfer > EPSILON) {
      transfers.push({ from: debtor.personId, to: creditor.personId, amount: transfer });
    }

    creditor.amount = Math.round((creditor.amount - transfer) * 100) / 100;
    debtor.amount = Math.round((debtor.amount - transfer) * 100) / 100;

    if (creditor.amount < EPSILON) ci++;
    if (debtor.amount < EPSILON) di++;
  }

  return transfers;
}

/**
 * Convenience wrapper for multi-currency groups: run the simplification
 * independently per currency and return a flat list of transfers tagged
 * with their currency.
 */
export function simplifyDebtsByCurrency(
  balances: Array<{ memberId: string; currency: string; total: number }>,
): Array<SimplifiedTransfer & { currency: string }> {
  const byCurrency = new Map<string, PersonBalance[]>();

  for (const { memberId, currency, total } of balances) {
    if (!byCurrency.has(currency)) byCurrency.set(currency, []);
    byCurrency.get(currency)!.push({ personId: memberId, balance: total });
  }

  const results: Array<SimplifiedTransfer & { currency: string }> = [];

  for (const [currency, perCurrency] of byCurrency) {
    for (const t of simplifyDebts(perCurrency)) {
      results.push({ ...t, currency });
    }
  }

  return results;
}
