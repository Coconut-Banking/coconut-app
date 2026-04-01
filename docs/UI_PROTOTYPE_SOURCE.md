# Mobile UI source: design prototype

**Canonical reference (do not drift):**

`Create design prototype (1)/src/app/pages/MobileAppPage.tsx`

Supporting tokens live in the same file (`C` object). In the Expo app we mirror those as:

- `lib/theme.ts` → `darkUI`, `prototype` (warm charcoal shell, money green/red, grouped cards)
- Brand CTAs stay **`#3D8E62`** (`colors.primary`), not the prototype’s gold accent.

## Screen map (prototype → app route)

| Prototype | App | Backend / data |
|-----------|-----|------------------|
| `HomeScreen` — balance hero, horizontal bank cards, friends | `(tabs)/index` — **Home** | `useGroupsSummary` (+ demo bank strip) |
| `ActivityScreen` | `(tabs)/activity` | `useRecentActivity` → `/api/groups/recent-activity` |
| `AddExpenseModal` (people → amount & item → split → confirm) | `(tabs)/add-expense` | Groups/expense APIs (existing) |
| Friends / Groups pager + FAB menu | `(tabs)/shared` (hidden tab; open from Home) | `useGroupsSummary`, same APIs |
| `FriendDetail` | `(tabs)/shared/person` | `usePersonDetail` → `/api/groups/person` |
| Group detail | `(tabs)/shared/group` | `useGroupDetail` |
| `TxDetailSheet` / split from bank | Transaction modal on Home + **Split** → add-expense with `prefillDesc` / `prefillAmount` | Plaid txs + manual split |
| Receipt scan / line-item split (not on prototype home) | **Groups & friends** (`/(tabs)/shared`) → FAB **Scan receipt** → `(tabs)/receipt` | `useReceiptSplit` → `/api/receipt/*` |

## Product direction

**Split-first:** **Home** is the default tab; bottom nav matches prototype rhythm (**Home · + · Activity**). **Settings** is off-tab (gear on **Activity**). **Add expense** (`+`) mirrors `AddExpenseModal`: sheet-style chrome (handle, progress dots), **amount + numpad + description → people → split (paid-by chips + mode tabs) → summary → save**.

## When extending features not in the prototype

1. Reuse `darkUI` / `prototype` surfaces and section labels (`SLabel` pattern: 11px, uppercase, muted).
2. Cards: 18px radius, `darkUI.card`, border `darkUI.stroke`, inner dividers `prototype.sep`.
3. Money: **in** `prototype.green` / `moneyInBg`, **out** `prototype.red` / `moneyOutBg`.
4. Primary actions: `colors.primary` (filled buttons, FAB ring).
