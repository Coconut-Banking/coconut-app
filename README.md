# Coconut App

Mobile app for Coconut — personal finance & shared expenses. iOS + Android in one codebase.

## Stack

- **Expo** (React Native) — `npx expo start`
- **Expo Router** — file-based routing (tabs: Home, Shared, Pay)
- **Stripe Terminal** — Tap to Pay for in-person payments

## Quick start

```bash
npm install
npx expo start
```

- **Expo Go** (scan QR): Home & Shared work. **Tap to Pay requires a development build.**
- **Development build** (Stripe Terminal enabled):

  ```bash
  npx expo run:ios    # or run:android
  ```

### iOS Simulator + hot reload (local)

This app uses a **development build** (`expo-dev-client`), not Expo Go. **Fast Refresh** (hot reload) runs whenever Metro is up and you save a file.

1. **Install pods / build once** (or after native dependency changes):

   ```bash
   npx expo run:ios
   ```

   With no physical device plugged in, this targets the **iOS Simulator** by default.

2. **Start Metro with the dev client** (leave this terminal open):

   ```bash
   npm run start:dev
   ```

   Or: `npx expo start --dev-client`

3. In the Expo CLI, press **`i`** to open the simulator if the app isn’t already running, or launch **Coconut** / **Coconut Dev** from the simulator home screen.

Edits to `.tsx` / `.ts` files should apply on save via Fast Refresh. If something gets stuck, press **`r`** in the Metro terminal to reload the bundle.

## Stripe Terminal (Tap to Pay) setup

1. Ensure your coconut web app has `STRIPE_SECRET_KEY` in `.env.local`
2. In the app, set `EXPO_PUBLIC_API_URL` to your deployed web URL (e.g. `https://coconut-app.dev`)
3. Run `npx expo run:ios` on a physical iPhone (XS or later) or `run:android` on an NFC-enabled device

## Lock-in twin

- **coconut-web** (Next.js): deploys to Vercel
- **coconut-app** (Expo): same features, mobile-native. Shares API with web.
