# Coconut E2E Audit: Splitwise Parity, Flow Integrity & State Persistence

> **Scope**: Mobile app only (React Native/Expo). Web dashboard is out of scope.
> **Estimated time**: ~8 hours total. Split into Core (Phases 0–1, 3: ~4h) and Extended (Phases 2, 4, 5: ~4h).

---

## PREREQUISITES — Test Environment Setup

Before starting, ensure:

1. **Two test users** — User A (primary tester) and User B (secondary, for real-time sync and multi-user flows). Both signed in on separate devices or simulators. **Both must be members of at least one shared group.**
2. **Physical iPhone required** for Tap to Pay tests only. All other tests can run on simulator.
3. **Plaid sandbox** credentials configured (for bank linking tests).
4. **Stripe test mode** enabled (for Tap to Pay and Stripe Connect tests).
5. **Demo mode OFF** unless explicitly testing demo mode.
6. **`EXPO_PUBLIC_SKIP_AUTH=false`** — verify this env var is NOT set to true, or all auth tests pass trivially.
7. **Start with a clean-ish state** — User A should have at least 1 existing group and 1 bank account linked.
8. **Network monitor** ready (Charles Proxy, Proxyman, or Xcode network inspector) for cache/offline/API verification tests.
9. **API base URL**: confirm `EXPO_PUBLIC_API_URL` in `.env` or app config.

---

## OUTPUT LEGEND

For each item, report:
- ✅ Pass — works as expected
- ⚠️ Partial — works but with issues (describe what's wrong)
- ❌ Fail — broken or missing (describe what happens instead)
- 🔍 Unreachable — code exists but no UI path leads to it
- 🚫 Blocked — can't test (explain why: missing credentials, hardware, etc.)

Priority markers on each item:
- **[P0]** — Critical: app-breaking if this fails
- **[P1]** — Important: major UX degradation
- **[P2]** — Nice-to-have: polish, edge cases

---

## PHASE 0: SMOKE TEST (~5 min — stop if anything fails)

All items are **[P0]**.

- [ ] App launches without crash
- [ ] Sign in with Google OAuth succeeds
- [ ] Home tab loads with balance summary (or valid empty state)
- [ ] Shared tab shows groups and/or friends
- [ ] Activity tab shows recent items (or valid empty state)
- [ ] Bank tab shows transactions (or valid "link bank" CTA)
- [ ] Settings tab loads all cards without crash
- [ ] FAB (floating action buttons) visible on Home/Shared/Activity tabs
- [ ] Sign up flow works (`app/(auth)/sign-up.tsx`) — new account creation
- [ ] Forgot password flow works (`app/(auth)/forgot-password.tsx`) — sends reset email

---

## PHASE 1: CORE SPLITWISE FEATURE PARITY (~2.5h)

### 1.0 Onboarding / Setup Wizard [P0]

The setup wizard (`app/setup.tsx`) is the first thing a new user sees.

- [ ] **[P0]** First launch after sign-up → setup wizard appears (not skipped)
- [ ] **[P0]** Step 1 — Bank: Plaid Link opens → can link or skip
- [ ] **[P1]** Step 2 — Splitwise: OAuth flow opens → can import or skip
- [ ] **[P1]** Step 3 — Tap to Pay / Stripe Connect: can onboard or skip
- [ ] **[P1]** Step 4 — Email/Gmail: can toggle or skip
- [ ] **[P0]** Skip button on each step advances to next step
- [ ] **[P0]** Completing all steps → `markSetupComplete()` → routes to `/(tabs)` → never shows setup again
- [ ] **[P1]** Exit mid-setup (kill app) → relaunch → resumes setup (does NOT skip to tabs)
- [ ] **[P1]** Settings → "Re-run setup" → wizard reappears with current state
- [ ] **[P0]** `setupComplete` flag persists across app kills (expo-secure-store)

### 1.1 Groups

- [ ] **[P0]** Create group: name → type → icon (camera/library) → save → appears in Shared list
- [ ] **[P1]** Rename group: settings gear → rename → save → name updates in list, detail, and activity
- [ ] **[P1]** Archive group: gear → archive → disappears from active list → appears in archived list
- [ ] **[P1]** Unarchive: archived list → unarchive → returns to active list
- [ ] **[P1]** Delete group: attempt from UI → **document actual behavior** (frontend calls `DELETE /api/groups/:id` but backend may not have a DELETE handler — is it a 404/405? Document.)
- [ ] **[P0]** Add members: from friends list, manual name, device contacts — each method works
- [ ] **[P1]** Remove member: disappears from member list
- [ ] **[P1]** Remove member with outstanding balance: remove Bob who owes $20 → document: is it blocked? balance preserved? zeroed out?
- [ ] **[P1]** Re-add removed member: remove → add back → does Bob see old expenses? Is balance correct including historical transactions?
- [ ] **[P2]** Upload/change group icon: camera + photo library both work; icon renders in list and detail
- [ ] **[P0]** View group balances: per-member breakdown (who owes whom, net amounts)
- [ ] **[P0]** View group activity: chronological expenses + settlements with correct dates and amounts
- [ ] **[P1]** Generate invite link: tap invite → copied to clipboard → URL is valid
- [ ] **[P1]** Join via invite link (signed in): User B opens link → preview screen → Join → lands in group with correct balance including pre-existing expenses
- [ ] **[P1]** Join via invite link (NOT signed in): open link → app stores pending token in AsyncStorage → sign in → auto-join group
- [ ] **[P2]** Join invite link for archived group: generate invite → archive → User B opens link → clear error (not crash)

### 1.2 Friends (Two-Person Groups)

Note: "Friends" are two-person groups with `groupType === "friend"`. Adding a friend likely goes through the group creation or contact-adding flow — verify the actual UI mechanism.

- [ ] **[P0]** Add a friend: from contacts or manual entry → friend appears in Shared list under "Friends" section
- [ ] **[P0]** View combined balance: cross-group net balance is correct (verify with known amounts)
- [ ] **[P1]** View activity: shows expenses and settlements with this friend across all shared groups
- [ ] **[P0]** Settle up (full): settle exact balance → balance goes to $0.00
- [ ] **[P1]** Settle up (partial): settle less than owed → balance decreases by exact partial amount

### 1.3 Expenses

- [ ] **[P0]** Add manual expense to group: POST /api/manual-expense → expense appears in group activity
- [ ] **[P0]** Add expense with friend: select friend → expense appears in friend's activity
- [ ] **[P0]** **"Paid by" selection**: change payer from "You" to another member → verify balance reflects the correct payer. Concrete test: Bob paid $30, split equally among A, B, C → Bob is owed $20, A and C each owe $10.
- [ ] **[P0]** Split equally: $30 among 3 = $10 each
- [ ] **[P0]** Split by exact amounts: assign specific amounts that sum to the total
- [ ] **[P1]** Split by percentages: assign percentages totaling 100%
- [ ] **[P1]** Split by shares: e.g., 2:1:1
- [ ] **[P0]** **3-way split rounding**: split $10.00 among 3 → verify shares are $3.34 + $3.33 + $3.33 = $10.00 exactly (no penny drift). Check each member's individual share.
- [ ] **[P1]** Add note/description: save → note visible in transaction detail
- [ ] **[P1]** Assign category: pick category → visible in detail and in Insights
- [ ] **[P1]** Edit existing expense: PATCH /api/split-transactions/:id → changed amount/description/split persists
- [ ] **[P1]** Edit expense date: backdate to yesterday → activity sort order updates accordingly
- [ ] **[P0]** Delete expense: swipe-to-delete → confirmation → removed → balance recalculates by correct amount
- [ ] **[P1]** Recurring expense: create with repeat frequency → POST /api/recurring-expenses. **Verify recurrence is actually stored** (not silently swallowed — the code has `.catch(() => {})`). Check via API or wait for next occurrence.
- [ ] **[P1]** View transaction detail: tap expense row → `shared/transaction.tsx` → correct payer, split, amount, notes, date
- [ ] **[P2]** Expense in solo group (only you): create expense in group with 1 member → document behavior (blocked? self-expense?)
- [ ] **[P1]** Rapid double-tap "Save": only ONE expense created
- [ ] **[P2]** Negative amount: enter -$50 → verify: rejected with validation error
- [ ] **[P2]** Zero amount: enter $0.00 → verify: rejected or accepted (document)
- [ ] **[P2]** 7-way split of $100.00: verify shares sum to exactly $100.00
- [ ] **[P2]** Large amount: $99,999.99 split 2 ways — no overflow, correct formatting

### 1.4 Settlements

Run these AFTER 1.3 so test data exists. The "Paid by" tests in 1.3 must pass first for settlement suggestions to be meaningful.

- [ ] **[P0]** Full settlement: record for exact balance owed → POST /api/settlements → balance = $0.00
- [ ] **[P0]** Partial settlement: PartialSettleModal → settle $10 of $25 → balance = $15
- [ ] **[P1]** Settlement exceeding balance: try to settle $100 when $50 owed → verify: capped at max (backend `getMaxSettlementAllowed`) or rejected with error
- [ ] **[P0]** **Settlement suggestions — concrete test**:
  > Group with A, B, C. A pays $30 split equally ($10 each). B pays $60 split equally ($20 each).
  > Expected net: A is owed $10, B is owed $20, C owes $30.
  > Simplified: C→A $10, C→B $20. Verify app shows exactly these (or equivalent minimal set).
- [ ] **[P1]** Delete a settlement: if UI supports it (backend has `DELETE /api/groups/[id]/settlements`), verify deletion → balance reverts
- [ ] **[P1]** **P2P deep links — specific tests**:
  - Venmo: handle stored → tap "Venmo" → opens `venmo://paycharge?txn=pay&recipients=...&amount=...&note=...` (or web fallback on simulator)
  - Cash App: handle stored → opens `https://cash.app/$cashtag/amount`
  - PayPal: handle stored → opens `https://paypal.me/username/amount`
  - No handle stored → verify: button disabled or prompts to add handle
  - Handles are configured via P2P annotation — verify the settings path to add Venmo/CashApp/PayPal usernames per member
- [ ] **[P0]** After settling, balances update immediately (no pull-to-refresh needed)
- [ ] **[P0]** After settling, activity feed shows the settlement entry
- [ ] **[P2]** Settle when balance is already $0 → button disabled or clear "nothing to settle" message

### 1.5 Multi-Currency

- [ ] **[P1]** Create expense in non-default currency: change currency → save → shows correct symbol
- [ ] **[P1]** Per-currency balance breakdown: group with USD and EUR expenses → separate lines per currency
- [ ] **[P1]** Settlement suggestions per currency: USD debts suggest USD settlements (not mixed with EUR)
- [ ] **[P2]** Change currency preference (Clerk unsafeMetadata) → new expenses default to new currency → old expenses retain original

### 1.6 Activity Feed

- [ ] **[P0]** Shows all recent activity across all groups (GET /api/groups/recent-activity)
- [ ] **[P1]** Filter — All: shows everything
- [ ] **[P1]** Filter — You're owed: only items where others owe you (`direction` check)
- [ ] **[P1]** Filter — You owe: only items where you owe others
- [ ] **[P1]** Filter — Settled: only settlement records
- [ ] **[P1]** Unseen badge: User B adds expense in shared group → realtime sync delivers it → badge appears on User A's Activity tab → User A taps Activity → badge clears. Note: badge is client-side (`_lastSeenActivityId` in AsyncStorage), only appears after data refresh.
- [ ] **[P0]** Tap activity item → navigates to correct group/transaction detail (not dead link)

### 1.7 Balances — The Golden Chain [P0]

Run this as ONE continuous sequence. Do not reset between steps.

1. [ ] Create expense: User A pays $30 in group, split equally with User B → A is owed $15, B owes $15
2. [ ] BalanceHero on Home updates to reflect +$15 owed to A
3. [ ] User B records $15 settlement → both balances = exactly $0.00
4. [ ] BalanceHero on Home reflects $0.00
5. [ ] Activity feed shows BOTH the expense AND the settlement
6. [ ] Kill app → relaunch → balances still $0.00, activity still shows both items
7. [ ] Delete the original expense → balance now shows A owes B $15 (the "orphaned settlement"). **Document how the app communicates this state** — is the orphaned settlement clearly visible? Is the balance labeled correctly?
8. [ ] Group detail balances match Person detail balances for the same pair

---

## PHASE 2: COCONUT-SPECIFIC FEATURES (~2h)

### 2.1 Bank Integration (Plaid)

- [ ] **[P0]** Link bank account: Plaid Link → create-link-token → select bank → exchange-token → account in Settings
- [ ] **[P0]** View transactions on Home tab: horizontal charge strip
- [ ] **[P0]** View transactions on Bank tab: full list with search and date filters
- [ ] **[P1]** Bank tab keyword search: type merchant name → results filter correctly
- [ ] **[P1]** Bank tab date range filter: CalendarPicker → select range → only matching transactions
- [ ] **[P0]** "Split this charge": tap transaction → modal → "Split this charge" → add-expense with prefilled **amount AND merchant/description AND target group** (verify all three carry over)
- [ ] **[P1]** "See all bank" from Home → opens Bank tab or bank sheet
- [ ] **[P1]** Disconnect bank: Settings → disconnect → transactions cleared, Plaid status updated
- [ ] **[P2]** Multiple accounts: link 2nd account → both in Settings → transactions from both appear
- [ ] **[P1]** Pull-to-refresh: pull on Home/Bank → POST /api/plaid/transactions → new transactions appear
- [ ] **[P1]** Transaction detail modal: tap → merchant, amount, date, category, receipt preview if available
- [ ] **[P1]** **OAuth callback screen**: after Plaid web flow, `coconut://connected` deep link → `connected.tsx` routes back to app correctly (not stuck on blank screen)

### 2.2 Receipt Scanning

- [ ] **[P0]** Upload receipt: FAB → Scan → camera/library → POST /api/receipt/parse → OCR results appear
- [ ] **[P1]** Edit OCR line items: change names and prices → changes persist (PUT /api/receipt/:id/items)
- [ ] **[P1]** Assign items to people: assign items → assignments show correctly
- [ ] **[P0]** Finish receipt split: POST /api/receipt/:id/finish → split transactions created in group
- [ ] **[P0]** **Receipt → balance chain**: finish → navigate to group → balance reflects receipt amounts
- [ ] **[P2]** Navigate to Tap to Pay from receipt summary (if Stripe Connect active)
- [ ] **[P2]** Export receipt as PDF: if UI exists (backend has POST /api/receipt/export-pdf), verify it works. If no UI, mark 🔍.

### 2.3 Tap to Pay (Physical iPhone only)

- [ ] **[P1]** Stripe Connect gate: not onboarded → onboarding flow → create account → complete link
- [ ] **[P1]** Create payment intent: reader starts → shows amount
- [ ] **[P1]** Collect payment via NFC: tap card → payment processes
- [ ] **[P1]** Settlement recorded after payment
- [ ] **[P2]** Education screen: accessible → completion persists across restarts
- [ ] **[P2]** TapToPayHeroModal: appears at right time → dismisses → doesn't re-appear after dismissal

### 2.4 Search

- [ ] **[P1]** Keyword search from Home: type query → GET /api/search/v2 → results render
- [ ] **[P1]** Date range search: add date filter → results narrow
- [ ] **[P1]** Tap search result → navigates to correct transaction/group

### 2.5 Insights

- [ ] **[P1]** ⚠️ **KNOWN SUSPECTED ORPHAN**: search entire UI for ANY button/link navigating to `/(tabs)/insights`. If none found, mark 🔍 Unreachable.
- [ ] **[P1]** If reachable: monthly spend breakdown renders (requires bank linked)
- [ ] **[P1]** Category breakdown with amounts
- [ ] **[P1]** Subscription detection: GET /api/subscriptions → listed. Also test editing/excluding a subscription (PATCH /api/subscriptions/:id) if UI exists.
- [ ] **[P2]** Empty state if bank not linked → CTA links to Settings

### 2.6 Email Receipts

- [ ] **[P1]** Gmail connect: Settings → Gmail card → OAuth → connected
- [ ] **[P1]** Email receipts list: email-receipts screen → GET /api/email-receipts → renders
- [ ] **[P1]** Email receipt detail: tap → GET /api/email-receipts/:id → renders
- [ ] **[P2]** Merchant enrichment: describe what the enrichment UI does and whether it works
- [ ] **[P1]** Gmail disconnect: status updates → receipts screen shows empty/CTA

### 2.7 Splitwise Import

- [ ] **[P1]** Connect Splitwise: Settings → Splitwise card → OAuth → /api/splitwise/auth-url
- [ ] **[P1]** Import: trigger → groups/expenses appear in Coconut
- [ ] **[P1]** Clear imported data: clear → Splitwise data removed
- [ ] **[P1]** InviteModal: for uninvited Splitwise members (fetched via GET /api/groups/uninvited) → modal shows → can send invites
- [ ] **[P1]** **OAuth callback**: `splitwise-callback.tsx` routes back correctly after OAuth (not stuck)

### 2.8 Push Notifications

- [ ] **[P1]** Token registration: on sign-in → POST /api/push-token → registered
- [ ] **[P1]** Expense notification: User B adds expense → User A receives push
- [ ] **[P1]** Settlement notification: User B settles → User A receives push
- [ ] **[P1]** Tap notification → opens correct group/transaction in app
- [ ] **[P2]** Push when app is killed: notification still delivered

### 2.9 Pro Tier / Monetization

- [ ] **[P1]** Tier detection: GET /api/user/tier → returns correct tier (free/pro)
- [ ] **[P1]** ProBanner in Settings: renders pricing info and CTA (currently "Coming soon" alert — verify it doesn't crash)
- [ ] **[P1]** ProGate: if any features are gated behind `ProGate` component, verify free users see the gate and pro users bypass it. If ProGate is unused, document that.
- [ ] **[P2]** What happens when /api/user/tier fails or is slow? Does the app degrade gracefully?

### 2.10 Additional Backend Features — Reachability Check

For each, verify if there's a UI path. If not, mark 🔍:

- [ ] **[P2]** Manual (non-Plaid) accounts: GET/POST/DELETE /api/manual-accounts — any UI?
- [ ] **[P2]** CSV import: POST /api/csv-import — any UI?
- [ ] **[P2]** CSV export: GET /api/groups/[id]/export — any UI?
- [ ] **[P2]** AI categorization: POST /api/categorize — any UI?
- [ ] **[P2]** P2P annotations: GET/POST /api/p2p-annotation — is this how Venmo/CashApp handles are stored? Verify the settings path.
- [ ] **[P2]** PayPal full OAuth flow: /api/paypal/auth → callback → sync → status — verify from Settings PaymentsCard
- [ ] **[P2]** Bug report / shake-to-report: shake device → BugReportSheet opens → can submit (POST /api/bug-report). If shake detection doesn't work, try dev tools.

---

## PHASE 3: STATE PERSISTENCE & DATA INTEGRITY (~1h)

### 3.1 After App Kill + Relaunch [P0]

- [ ] Groups list populated immediately from cache, then refreshes from API
- [ ] Group detail shows correct members and balances
- [ ] Activity feed retains items
- [ ] Bank transactions visible from AsyncStorage cache
- [ ] Demo mode preference persists (expo-secure-store)
- [ ] Theme preference persists (light/dark)
- [ ] Biometric lock preference persists
- [ ] Setup completion flag persists (no re-onboarding)
- [ ] Currency preference persists

### 3.2 After Background → Foreground [P1]

- [ ] Bank transactions refresh automatically (useTransactions foreground listener)
- [ ] Realtime sync reconnects: Supabase `postgres_changes` channels re-subscribe (NOT SSE — SSE is web only). Updates should arrive within ~1-2s of foreground.
- [ ] Auth token still valid (no surprise sign-out)
- [ ] If biometric lock enabled: lock screen appears → authenticate → unlocks to last screen
- [ ] Failed/cancelled biometric → stays locked (verify fallback: retry prompt? sign out?)
- [ ] BiometricEnablePrompt (first-time): appears once on first eligible foreground, dismissal persists (`coconut.biometric_prompt_shown_v2` in SecureStore)

### 3.3 Realtime Sync — Two-User Test [P0]

Setup: User A and User B both have the app open to the same group.

- [ ] User B adds expense → User A's group updates WITHOUT manual refresh (balance + activity)
- [ ] User B settles → User A's balance updates
- [ ] User B joins group (via invite) → User A's member list updates
- [ ] Rapid-fire: User B adds 3 expenses quickly → all 3 appear on User A (debounced ~500ms)
- [ ] Background sync: User A backgrounds → User B adds expense → User A foregrounds → expense appears (subscription reconnects)

### 3.4 Offline / Error Handling [P1]

Setup: enable airplane mode.

- [ ] Add expense while offline: tap save → **clear network error message** shown (app does NOT queue — expected: "Network request failed. Check your connection and retry." with offline icon). **Verify form retains user's input** after the error — they should NOT have to re-enter everything.
- [ ] Navigate while offline: cached screens show last-known data from AsyncStorage (not blank/spinner forever)
- [ ] Come back online: disable airplane mode → pull-to-refresh → fresh data loads
- [ ] Session expiry: to simulate, open DevToolsCard (dev build) and clear Clerk session, OR use Charles Proxy to return 401 on token refresh → app fires `session-expired` → redirects to sign-in (not stuck on broken screen)

---

## PHASE 4: NAVIGATION & BUTTON AUDIT (~1h)

### 4.1 Home Tab [P0]

- [ ] BalanceHero tap → navigates somewhere useful (Shared tab or relevant group)
- [ ] Bank charge strip: horizontal scroll → tap item → charge detail modal
- [ ] "Split this charge" in modal → add-expense with correct prefills
- [ ] "See all bank" → Bank tab or bank sheet
- [ ] Tap to Pay entry (if visible) → pay screen
- [ ] Search bar → query → results → tap result → correct destination

### 4.2 Bank Tab [P1]

- [ ] Full transaction list renders (distinct from Home strip)
- [ ] Search filters by keyword
- [ ] Calendar/date filter works
- [ ] Tap transaction → detail modal
- [ ] Pull-to-refresh syncs new transactions

### 4.3 Shared Tab [P0]

- [ ] Group row → group detail
- [ ] Friend row → person detail
- [ ] "Create group" → creation flow → save → appears in list
- [ ] Archived section → shows only archived groups
- [ ] Pull-to-refresh updates list

### 4.4 Group Detail [P0]

- [ ] "Add expense" → add-expense with group pre-selected
- [ ] "Settle up" → settlement flow with correct balance pre-filled
- [ ] Member tap → person detail
- [ ] Settings gear → rename/archive/invite/icon options
- [ ] Expense row tap → transaction detail
- [ ] Swipe-to-delete → confirmation → delete → balance recalculates
- [ ] Back button → Shared list (not stuck)
- [ ] Invite link → share sheet with valid URL

### 4.5 Person Detail [P1]

- [ ] Cross-group balance shown
- [ ] "Settle up" → settlement flow
- [ ] Activity list with this person
- [ ] "Pay" (Tap to Pay) if available

### 4.6 FAB [P0]

- [ ] "Add expense" → add-expense screen
- [ ] "Scan receipt" → receipt screen
- [ ] FAB hidden on: add-expense, receipt, pay, tap-to-pay-education
- [ ] Tab bar hidden on those same screens
- [ ] **Check**: should FAB/tab bar also hide on email-receipts and insights? Document current behavior.

### 4.7 Settings [P1]

- [ ] **ProfileHeader**: name, email, avatar render
- [ ] **PreferencesCard**: currency picker, theme toggle, biometric toggle — each works
- [ ] **BankAccountsCard**: lists accounts, "link new" opens Plaid, disconnect works
- [ ] **SplitwiseCard**: connect/disconnect/import/clear all functional
- [ ] **GmailCard**: connect/disconnect/toggle scan
- [ ] **ContactsCard**: shows synced contacts or sync CTA
- [ ] **TapToPayCard**: status display, links to education/onboarding
- [ ] **PaymentsCard**: Stripe Connect status, PayPal connect/disconnect (full OAuth)
- [ ] **DevToolsCard** (dev build only): tools work without crash
- [ ] "Re-run setup" → setup wizard
- [ ] "Sign out" → clears session → auth screen → sign back in → data restored

---

## PHASE 5: EDGE CASES & REGRESSION TRAPS (~1h)

### Input Validation [P2]
- [ ] 200+ char group name — truncated gracefully, no overflow
- [ ] 200+ char expense description — same
- [ ] Unicode/emoji: "🍕 Pizza Night" renders in list, detail, activity
- [ ] Special chars in notes: quotes `"`, ampersands `&`, angle brackets `<>` — no XSS or rendering bugs

### Arithmetic Integrity [P0]
- [ ] 3-way $10.00 split: $3.34 + $3.33 + $3.33 = $10.00 (cross-ref with 1.3)
- [ ] 7-way $100.00 split: sum = exactly $100.00
- [ ] $99,999.99 split 2 ways: correct formatting, no overflow
- [ ] Multiple expenses + settlements: final group balances are mathematically consistent (sum of all member balances = $0.00)

### Concurrency [P1]
- [ ] Two users add expenses to same group simultaneously → both appear, balances correct
- [ ] User A editing expense while User B deletes it → no crash, graceful error

### Group Edge Cases [P2]
- [ ] Group with 10+ members: balances render, scroll works, all visible
- [ ] Group with 1 member: document what's possible

### Demo Mode [P1]
- [ ] Toggle ON → all tabs show mock data
- [ ] No real API calls (verify via network monitor — no requests to EXPO_PUBLIC_API_URL)
- [ ] Toggle OFF → real data returns, no stale mock data
- [ ] Kill + relaunch in demo mode → still in demo mode

### Deep Links [P1]
- [ ] `coconut://join/[token]` cold start → app launches → auth if needed → joins group
- [ ] `coconut://auth-handoff?__clerk_ticket=...` → exchanges ticket → signs in
- [ ] `coconut://connected` → Plaid callback routes correctly
- [ ] Invalid/expired invite token → clear error, not crash

### Biometric Lock (Full Flow) [P1]
- [ ] Enable → background → foreground → lock screen appears
- [ ] Authenticate → unlocks to last screen
- [ ] Cancel/fail → stays locked
- [ ] Disable → no lock screen on next foreground

### Dark Mode [P2]
- [ ] Switch to dark mode in Preferences → all screens render with correct themed colors
- [ ] No white-on-white or black-on-black text anywhere
- [ ] Modals, sheets, and alerts also respect dark theme

### Sound & Haptics [P2]
- [ ] Haptic feedback fires on key actions (add expense, settle, tab switch)
- [ ] No crashes related to sound/haptic on simulator (where hardware is absent)

### Error Boundary [P2]
- [ ] If a screen crashes (simulate via DevTools if possible) → ErrorBoundary shows friendly error with retry
- [ ] Retry recovers the screen

---

## PHASE 6: SUMMARY REPORT

After completing all phases, provide:

1. **[P0] Critical Blockers** — Crashes, data loss, wrong balances, broken auth — things that make users abandon the app
2. **[P0] Splitwise Parity Gaps** — Core Splitwise features missing entirely from Coconut
3. **[P0] Arithmetic Bugs** — Any case where balances, splits, or settlements produce wrong numbers
4. **[P1] State Persistence Failures** — Data that doesn't survive restart, navigation, or backgrounding
5. **[P1] Dead Buttons / Unreachable Features** — UI elements that go nowhere, or features with no entry point (especially: Insights, CSV export, manual accounts)
6. **[P1] Broken Flows** — Chains where step A works and step B works individually but A→B is broken
7. **[P2] Polish Issues** — Dark mode glitches, missing haptics, truncation bugs, etc.
8. **Top 10 Priority Fixes** — Ranked by user impact with severity (P0/P1/P2) and estimated effort (S/M/L)
