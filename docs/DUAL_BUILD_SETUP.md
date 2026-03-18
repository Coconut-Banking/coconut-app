# Two Builds on Same Device

You can run **Coconut** (TestFlight) and **Coconut Dev** (local) side by side.

## 1. Create Apple App ID for Dev

In [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles → Identifiers:

- Click **+** → App IDs
- Description: `Coconut Dev`
- Bundle ID: `com.coconut.app.dev`
- Register

## 2. Build Coconut Dev (install once)

```bash
cd coconut-app
eas build --profile development --platform ios
```

When the build finishes, install the IPA on your device (EAS provides a link, or use the QR code).

## 3. Daily workflow

| App | How it updates |
|-----|----------------|
| **Coconut** (TestFlight) | Only when you run `eas build --profile production` and `eas submit` |
| **Coconut Dev** | When you run `npm start` + open the app — it loads JS from Metro |

### To test local changes

1. Start Metro: `npm run start:device`
2. Open **Coconut Dev** on your device
3. It connects to Metro and loads your latest code
4. Save files → app updates (fast refresh)

### To build Dev from scratch (e.g. after native changes)

```bash
eas build --profile development --platform ios
```

## 4. Local native dev (optional)

To build **Coconut Dev** locally (no EAS):

```bash
npm run ios:dev        # Simulator
npm run ios:dev:device # Physical device
```

Then run `npm run start:device` so the app connects to Metro.

## Summary

| Build | Name | Bundle ID | Updates via |
|-------|------|-----------|-------------|
| Production | Coconut | com.coconut.app | TestFlight |
| Development | Coconut Dev | com.coconut.app.dev | Metro (npm start) |
