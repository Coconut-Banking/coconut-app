# Demo mode (mobile)

Demo mode uses **hardcoded sample data** in `lib/demo-data.ts` and **in-memory updates** via `lib/demo-context.tsx`. Flows match the real app: Shared, person/group detail, add expense (through Tap to Pay / Venmo / Shared), and settlements — without calling your API for those screens.

## How to turn it on

1. **Sign-in screen:** tap **Try demo — no sign-in** (no Clerk session required).
2. **After you’re signed in:** open **Shared** and turn the **Demo** switch on.

The choice is stored in SecureStore (`coconut.demo_mode`) so it survives restarts.

## Simulator without logging in

- Use **Try demo — no sign-in** on the first screen.
- Optional: set `EXPO_PUBLIC_START_IN_DEMO=true` in `.env` so the **first** launch (before any stored preference) opens in demo mode automatically.

## What still needs a real account

- **Bank / Plaid:** transactions, connect flow, NL search over your data.
- **Receipt scan / server-backed flows** that POST to the API.
- **Tap to Pay:** real Stripe Terminal still needs proper device/build setup; from demo, Pay opens with the same UI but collection is production/test Stripe.

## Turning demo off

- **Shared → Demo** switch off.  
- If you used guest demo (no sign-in), turning **Demo** off returns you to the sign-in screen.

## `AsyncStorage` / “NativeModule: AsyncStorage is null”

That means the **JavaScript bundle** is running in a host that **doesn’t include** the native AsyncStorage module (common if you open the project in **Expo Go** while the project expects a **custom dev client**, or your **iOS build is stale**).

1. **Use your dev build, not Expo Go** — In the Metro terminal it should say *development build*. Install/run the **Coconut** app from Xcode / `npx expo run:ios`, not the Expo Go app.
2. **Rebuild native** — From the repo root:
   ```bash
   cd ios && pod install && cd ..
   npx expo run:ios
   ```
3. Theme prefs now **fall back to in-memory** if native AsyncStorage is missing so the app can still load; other features may still need a proper rebuild.

## “Route is missing the required default export”

Usually a **cascade** from an earlier red screen (e.g. AsyncStorage). After the fix above, reload; if it persists, clear Metro: `npx expo start --clear`.
