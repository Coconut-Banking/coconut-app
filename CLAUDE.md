# Coconut App — Project Guide

## Architecture
- **Frontend**: React Native + Expo (expo-router, file-based routing) at `/coconut-app/`
- **Backend**: Next.js API routes (Vercel serverless) at `/coconut-backend/`
- **Database**: Supabase (PostgreSQL) with `getSupabase()` client
- **Auth**: Clerk (Google OAuth, `@clerk/expo` on mobile, `@clerk/nextjs` on backend)
- **Banking**: Plaid Link for bank account syncing
- **Storage**: Supabase Storage for file uploads (group icons, receipts)
- **Payments**: Stripe Terminal (Tap to Pay on iPhone)

## Key Conventions
- Theming via `useTheme()` hook — never hardcode colors, use `theme.*` tokens
- Fonts via `font.*` constants (Inter family: `font.regular`, `font.medium`, `font.semibold`, `font.bold`)
- API calls via `useApiFetch()` hook — handles auth tokens, caching, retry, queuing
- Demo mode: `useDemoMode()` for toggle state, `useDemoData()` for mock data
- Group access: always check `canAccessGroup()` or `getAccessibleGroupIds()` on backend
- Feature toggles: `useFeatureToggle("flag_name")` — flags stored in DB

## File Layout
- `app/(tabs)/` — main tab screens (index, activity, settings, add-expense, shared/*)
- `app/(auth)/` — sign-in, sign-up, forgot-password
- `app/setup.tsx` — onboarding wizard (bank, splitwise, tap-to-pay, email)
- `hooks/` — data fetching hooks (useGroups, useTransactions, useSearch)
- `lib/` — utilities, contexts, API client
- `components/` — shared UI components

## Backend Patterns
- Auth: `getEffectiveUserId()` for all endpoints (supports demo mode)
- DB queries: use Supabase client, always select explicit columns (not `*`)
- Cache-Control: set `private, max-age=N` on responses where appropriate
- Clerk API: batch with `getUserList()`, cache results, avoid per-request calls

## What NOT to Do
- Don't add TypeScript `any` casts — use proper types
- Don't add `console.log` to production code (use `if (__DEV__)` guard)
- Don't import demo data eagerly — lazy-load behind `isDemoOn` check
- Don't wrap ALL tabs in heavy providers — scope to the tab that needs it
- Don't use `<Modal visible={condition}>` — use `{condition ? <Modal visible={true}> : null}` for conditional mounting
- Don't use sequential `await` for independent DB queries — use `Promise.all()`
