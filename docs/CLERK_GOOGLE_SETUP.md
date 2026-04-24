# Clerk + Google Sign-In Setup (App & Web Same Account)

The app and web must use the **same Clerk application** so users who sign in with Google on the web see their bank/transactions in the app.

## Already matching

- Both use `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (app) / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (web) — must be identical
- Both talk to the same backend (`coconut-app.dev`), which uses `CLERK_SECRET_KEY` to validate tokens

---

## Part 1: Google Cloud Console (from scratch)

If you haven’t set up anything in Google Cloud yet, follow these steps.

### 1. Create or select a project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Use the project dropdown at the top → **New Project**
3. Name it (e.g. "Coconut") → Create
4. Select the new project

### 2. Configure the OAuth consent screen

1. Go to **APIs & Services** → **OAuth consent screen** (or [direct link](https://console.cloud.google.com/apis/credentials/consent))
2. Choose **External** (unless you have Google Workspace) → Create
3. Fill in:
   - **App name**: Coconut
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue** through the scopes and test users screens (defaults are fine for dev)

### 3. Create the iOS OAuth client

1. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
2. If asked, set **Application type** = **iOS**
3. Fill in:
   - **Name**: Coconut iOS (or any name)
   - **Bundle ID**: `com.coconut.app`
4. Click **Create**
5. In the popup, copy the **Client ID** (e.g. `123456789-abc.apps.googleusercontent.com`)
   - Save this for `EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID`
   - The **iOS URL scheme** is `com.googleusercontent.apps.` + the part before `.apps.googleusercontent.com`
   - Example: if Client ID is `123456789-abc.apps.googleusercontent.com`, the scheme is `com.googleusercontent.apps.123456789-abc`

### 4. Get the Authorized Redirect URI from Clerk

1. Open [Clerk Dashboard → SSO Connections](https://dashboard.clerk.com/~/user-authentication/sso-connections)
2. Turn on **Google** (Enable for sign-up and sign-in)
3. Turn on **Use custom credentials**
4. Copy the **Authorized redirect URI** shown there (looks like `https://xxx.clerk.accounts.dev/v1/oauth_callback`)

### 5. Create the Web OAuth client

1. In the same Google Cloud project: **Create Credentials** → **OAuth client ID**
2. **Application type**: **Web application**
3. **Name**: Coconut Web (or any name)
4. Under **Authorized redirect URIs** → **Add URI** → paste the URI from Clerk
5. Click **Create**
6. Copy the **Client ID** and **Client Secret** from the popup

### 6. Paste credentials into Clerk

1. In Clerk Dashboard → SSO Connections → Google
2. Paste the **Client ID** and **Client Secret** from the Web client
3. Save

### 7. Add iOS app to Clerk Native Applications

1. Go to [Clerk → Native Applications](https://dashboard.clerk.com/~/native-applications)
2. **Add the iOS app**:
   - **Team ID**: `942BUGUD75`
   - **Bundle ID**: `com.coconut.app`

---

## Part 2: Add to app `.env`

In `coconut-app/.env` add:

```bash
EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID=<your-ios-client-id>.apps.googleusercontent.com
EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.<your-ios-client-id>
```

- `<your-web-client-id>` = the Web client ID you created (without `.apps.googleusercontent.com`)
- `<your-ios-client-id>` = the part of your iOS Client ID before `.apps.googleusercontent.com` (e.g. `123456789-abc`)

---

## Part 3: Rebuild the app

```bash
cd coconut-app
npx expo prebuild --clean
npx expo run:ios -d <your-device-UDID>
```

---

See [Clerk: Sign in with Google (Expo)](https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google) for more detail.

## Quick check

- Web: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_test_...`
- App: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = same `pk_test_...`
- Vercel: `CLERK_SECRET_KEY` for that same Clerk app
