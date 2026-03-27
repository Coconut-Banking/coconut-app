# Tap to Pay Build Setup

To ensure your iOS build includes Tap to Pay when you run it:

## 1. App ID Must Have Tap to Pay (Apple Developer)

Your **App ID** (com.coconut.app) must have the capability. You already have it on an Ad hoc profile, which means the App ID likely has it—but verify:

1. [developer.apple.com/account](https://developer.apple.com/account/) → **Certificates, Identifiers & Profiles**
2. **Identifiers** → **App IDs** → find `com.coconut.app`
3. Click it → under **Capabilities**, confirm **Tap to Pay on iPhone** is enabled
4. If not: **Edit** → enable **Tap to Pay on iPhone** under Additional Capabilities → Save

## 2. Create a Development Profile (for `expo run:ios`)

Your Ad hoc profile has Tap to Pay, but `expo run:ios` typically uses a **Development** profile. Create one:

1. **Profiles** → **+** (Create)
2. Select **iOS App Development** → Continue
3. Select App ID: **com.coconut.app** → Continue
4. Select your **Development** certificate → Continue
5. Select your **device(s)** (the iPhone you test on) → Continue
6. Name: `Coconut Development` → Generate
7. **Download** the profile (optional—Xcode can fetch it)

Xcode will use this profile when you run `expo run:ios --device` with automatic signing.

## 3. Run the Build

```bash
cd /Users/harsh/coconut-app
npx expo run:ios --device
```

Make sure:
- Your iPhone is connected via USB
- Your iPhone is registered in **Devices** in the Apple Developer portal
- You're signed in with the correct Apple ID in Xcode (Xcode → Settings → Accounts)

## 4. EAS / TestFlight builds (entitlement errors)

If the build fails with:

`Entitlement com.apple.developer.proximity-reader.payment.acceptance not found and could not be included in profile`

your **provisioning profile** does not yet include Tap to Pay—even if the capability appears on the App ID. Until Apple/EAS profiles include that entitlement:

- **Do not** set `ENABLE_TAP_TO_PAY_IOS` (default: entitlement omitted → **store / TestFlight builds succeed**).
- Stripe Terminal **Bluetooth/WisePad** flows can still work; **Tap to Pay on iPhone** requires the entitlement.

When your App Store / distribution profile includes Tap to Pay:

1. In [EAS Environment variables](https://expo.dev) for the project, set **`ENABLE_TAP_TO_PAY_IOS`** = `true` (or `EXPO_PUBLIC_ENABLE_TAP_TO_PAY_IOS=true`) for the profiles that should ship Tap to Pay.
2. Re-run prebuild/build so `app.config.js` injects the entitlement again.

```bash
eas build --profile production --platform ios
```

Install the resulting build on your device.
