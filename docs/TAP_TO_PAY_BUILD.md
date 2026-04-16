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

## 5. “It used to work” — runtime error 2900 / `UNSUPPORTED_OPERATION`

If Metro logs show:

`discoverReaders` → `UNSUPPORTED_OPERATION` / `nativeErrorCode: "2900"` / “entitlements… application bundle”

then **the app currently on the phone was not signed with the Tap to Pay entitlement**, even if the capability is enabled in the Apple Developer portal.

**Nothing in JavaScript can fix that.** The entitlement is baked in at **native** build time from `app.config.js`, and only when:

`ENABLE_TAP_TO_PAY_IOS=true` **or** `EXPO_PUBLIC_ENABLE_TAP_TO_PAY_IOS=true`

was set **when `expo prebuild` / EAS Build ran**. If that env var was commented out in `.env`, missing in EAS env for that profile, or you installed an older `.ipa` built without it, you get 2900.

**Fix:**

1. Put `ENABLE_TAP_TO_PAY_IOS=true` back in `.env` (local) **and/or** EAS project env for the profile you use.
2. **`com.coconut.app.dev` vs `com.coconut.app`:** dev scripts use the **`.dev`** bundle ID. Tap to Pay must be enabled and provisioned for **the same bundle ID** as the binary you run.
3. Run a **clean** native rebuild so `ios/` picks up entitlements again, e.g. `npx expo prebuild --clean` then `npx expo run:ios --device`, or a fresh `eas build`.
4. Reinstall on device; don’t rely on an old install.

The Pay screen also shows a short in-app hint when it detects this class of error.

## 6. Stripe **live** mode (real money) — what you configure

**On your side (no code change required for basic live flip):**

| Item | What to do |
|------|------------|
| **Vercel / server env** | Set `STRIPE_SECRET_KEY` to **`sk_live_...`** for production. |
| **Webhooks** | In Stripe Dashboard, switch to **Live** and create a **live** webhook endpoint pointing at your production URL (same path: `/api/stripe/webhook`). Copy the **live** signing secret into `STRIPE_WEBHOOK_SECRET` in production env. Test and live secrets are different. |
| **Clerk (if going fully live)** | Use **live** Clerk keys in production web + `EXPO_PUBLIC_*` on the app build that talks to prod. |
| **Mobile** | `EXPO_PUBLIC_API_URL` must point at the **production** API that uses **live** Stripe. |
| **Connect (receiver gets paid)** | Each user who receives money must complete **Stripe Connect onboarding in live mode** (live Connect account). Test Connect accounts do not receive real payouts. |
| **Terminal** | Live mode uses your **live** Stripe account; Dashboard → Terminal stays in sync with the API key mode. Complete Stripe’s in-dashboard Terminal / deployment steps for production. |
| **Apple** | App Store / TestFlight build: App ID **`com.coconut.app`** (not `.dev`) with Tap to Pay + distribution profile that includes the entitlement; EAS `ENABLE_TAP_TO_PAY_IOS=true` for that production profile when the profile supports it. |

**Already in the Coconut codebase (coconut web app):**

- `POST /api/stripe/terminal/connection-token` — uses `STRIPE_SECRET_KEY` (test or live depending on env).
- `POST /api/stripe/terminal/create-payment-intent` — creates `card_present` PaymentIntents; if the receiver has completed Connect onboarding, `transfer_data.destination` sends funds to their connected account.
- Webhook `payment_intent.succeeded` with `metadata.source === "terminal"` records the settlement in your DB when payer/receiver/group metadata is present.

## 7. Product goal: settle expenses + money to the receiver

Flow today:

1. Payer collects via Tap to Pay from an expense / settlement entry (app passes amount + optional `groupId` / `payerMemberId` / `receiverMemberId`).
2. Backend creates a PaymentIntent; if the receiver has `stripe_connected_accounts` with `onboarding_complete`, Stripe sends the charge to the platform and **transfers** to the connected account (`transfer_data.destination`).
3. On success, the webhook inserts a **settlement** row so balances stay consistent.

**Requirements for “money actually lands with the receiver” in production:** live keys, live webhook, receiver finished **live** Connect onboarding, and charges enabled on their Connect account.
