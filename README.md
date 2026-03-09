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

## Stripe Terminal (Tap to Pay) setup

1. Ensure your coconut web app has `STRIPE_SECRET_KEY` in `.env.local`
2. In the app, set `EXPO_PUBLIC_API_URL` to your deployed web URL (e.g. `https://coconut-lemon.vercel.app`)
3. Run `npx expo run:ios` on a physical iPhone (XS or later) or `run:android` on an NFC-enabled device

## Lock-in twin

- **coconut-web** (Next.js): deploys to Vercel
- **coconut-app** (Expo): same features, mobile-native. Shares API with web.
