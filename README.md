# Coconut App

Mobile app for Coconut — personal finance & shared expenses. iOS + Android in one codebase.

## Stack

- **Expo** (React Native) — `npx expo start`
- **Expo Router** — file-based routing (tabs: Home, Shared, Pay)
- **Square In-App Payments SDK** — card entry, Apple Pay, Google Pay

## Quick start

```bash
npm install
npx expo start
```

- **Expo Go** (scan QR): Home & Shared work. **Square Pay requires a development build.**
- **Development build** (Square enabled):

  ```bash
  npx expo prebuild
  npx expo run:ios    # or run:android
  ```

## Square setup

1. Create a Square application: [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Copy **Application ID** (sandbox for testing)
3. Add to `.env`:

   ```
   EXPO_PUBLIC_SQUARE_APPLICATION_ID=sandbox-sq0idb-xxxxx
   ```

4. Run `npx expo prebuild` and `npx expo run:ios` (or `run:android`)

## Lock-in twin

- **coconut-web** (Next.js): deploys to Vercel
- **coconut-app** (Expo): same features, mobile-native. Shares API with web.
