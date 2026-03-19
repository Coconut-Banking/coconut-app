# Dual Build: Coconut (TestFlight) + Coconut Dev (Local)

Run **Coconut** (production, from TestFlight) and **Coconut Dev** (development, from Expo) side by side on the same device.

---

## Step 1: Create Apple App ID for Coconut Dev

1. Go to [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles** → **Identifiers**
2. Click **+** → **App IDs**
3. **Description:** `Coconut Dev`
4. **Bundle ID:** `com.coconut.app.dev` (Explicit)
5. Click **Register**

---

## Step 2: Production Build (TestFlight) — Coconut

### Build and submit

```bash
cd coconut-app
eas build --profile production --platform ios
```

When the build finishes, EAS gives you a link. Then submit to TestFlight:

```bash
eas submit --platform ios --latest
```

Or in [expo.dev](https://expo.dev) → your project → Builds → select the build → **Submit to App Store Connect**.

### Install from TestFlight

1. Open **TestFlight** on your iPhone
2. Install **Coconut** (production)
3. This app only updates when you submit a new build

---

## Step 3: Dev Build — Coconut Dev

### Option A: EAS development build (recommended)

```bash
eas build --profile development --platform ios
```

When done, install the IPA on your device (EAS provides a link or QR code). This installs **Coconut Dev** (`com.coconut.app.dev`).

### Option B: Local build (Xcode)

1. Prebuild for dev:
   ```bash
   APP_VARIANT=dev npx expo prebuild
   ```

2. Open Xcode and configure signing for the **Coconut** target:
   - Select the project → **Signing & Capabilities**
   - Enable **Automatically manage signing**
   - Choose your **Team**
   - Bundle ID will be `com.coconut.app.dev`

3. Build and run:
   ```bash
   npm run ios:dev:device
   ```

---

## Step 4: Daily Workflow

| App | How it updates |
|-----|----------------|
| **Coconut** (TestFlight) | Only when you run `eas build --profile production` and submit |
| **Coconut Dev** | When you run `npm run start:device` and open the app — it loads JS from Metro |

### To test local changes

1. Start Metro:
   ```bash
   npm run start:device
   ```

2. Open **Coconut Dev** on your device

3. It connects to Metro and loads your latest code

4. Save files → app updates (fast refresh)

### To rebuild Dev (after native changes)

```bash
eas build --profile development --platform ios
```

Or locally:

```bash
APP_VARIANT=dev npx expo prebuild
npm run ios:dev:device
```

---

## Summary

| Build | Name | Bundle ID | How to install |
|-------|------|-----------|----------------|
| Production | Coconut | com.coconut.app | TestFlight |
| Development | Coconut Dev | com.coconut.app.dev | EAS build link or `npm run ios:dev:device` |

---

## Troubleshooting

**"No code signing certificates"** when running `npm run ios:device` or `npm run ios:dev:device`:
- Open `ios/Coconut.xcworkspace` in Xcode
- Select the **Coconut** target → **Signing & Capabilities**
- Enable **Automatically manage signing** and select your **Team**

**Switching between prod and dev prebuild:**
- Prod: `npx expo prebuild` (no env)
- Dev: `APP_VARIANT=dev npx expo prebuild`
- Each prebuild overwrites `ios/` — run the one that matches what you want to build
