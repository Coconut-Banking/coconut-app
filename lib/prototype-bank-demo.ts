/**
 * Demo bank charges — mirrors `MobileAppPage.tsx` `ALL_BANK_TX` shape for the Balances horizontal strip.
 * Only used for prototype UI (demo mode or placeholder when no live bank strip yet).
 */
export type PrototypeBankCharge = {
  id: string;
  merchant: string;
  emoji: string;
  amount: number;
  date: string;
  /** Optional context copy (avoid “split with X” suggestions; flow is user-picked). */
  hint: string;
  unsplit: boolean;
  /** Blue mail badge + snippet row */
  hasEmail?: boolean;
  emailLine?: string;
  /** Demo itemized receipt preview (no API) */
  receiptId?: string;
};

export const PROTOTYPE_DEMO_BANK_CHARGES: PrototypeBankCharge[] = [
  {
    id: "b1",
    merchant: "Whole Foods",
    emoji: "🛒",
    amount: 84.2,
    date: "Mar 21",
    hint: "Groceries charge",
    unsplit: true,
  },
  {
    id: "b2",
    merchant: "Uber",
    emoji: "🚗",
    amount: 31.75,
    date: "Mar 20",
    hint: "Ride charge",
    unsplit: true,
    hasEmail: true,
    emailLine: "11:48 PM · Nobu → Mission",
    receiptId: "__demo__",
  },
  {
    id: "b3",
    merchant: "Uber Eats",
    emoji: "🍕",
    amount: 54.9,
    date: "Mar 21",
    hint: "Delivery order",
    unsplit: true,
    hasEmail: true,
    emailLine: "Hana Japanese · 2847 Mission St",
  },
  {
    id: "b4",
    merchant: "Lyft",
    emoji: "🛵",
    amount: 18.5,
    date: "Mar 22",
    hint: "Ride charge",
    unsplit: true,
    hasEmail: true,
    emailLine: "9:14 PM · Haight → SFO",
  },
  {
    id: "b5",
    merchant: "Starbucks",
    emoji: "☕",
    amount: 12.8,
    date: "Mar 23",
    hint: "Personal",
    unsplit: false,
  },
];
