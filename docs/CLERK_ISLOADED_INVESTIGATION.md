# Clerk isLoaded Never True — Investigation Summary

## Real root cause: FORCE_SIGN_OUT + signOut() on launch

**When `EXPO_PUBLIC_FORCE_SIGN_OUT=true`**, the app calls `signOut()` on launch whenever there's a cached session. This clears the session. Clerk has a known issue ([clerk/javascript#2930](https://github.com/clerk/javascript/issues/2930)): **during initialization without an authenticated user, `isLoaded` never changes to `true`**.

The flow:
1. App opens with a session cached in SecureStore (tokenCache)
2. AuthSwitch sees `isLoaded=true`, `isSignedIn=true`, `FORCE_SIGN_OUT=true`
3. useEffect calls `signOut()` to clear the stale session
4. signOut() clears the session; Clerk enters a "no user" state
5. This triggers an edge case where Clerk's client can get stuck with `isLoaded=false`
6. User sees "Auth is loading slowly" indefinitely

**This happens on real devices** because it's not a network or simulator bug — it's the signOut-on-launch flow interacting badly with Clerk's init logic.

## Fix: Disable FORCE_SIGN_OUT

Set `EXPO_PUBLIC_FORCE_SIGN_OUT=false` in `.env` (or remove it). FORCE_SIGN_OUT is intended only as a **temporary dev workaround** when you're stuck in the "sign-in → tabs → forever spinner" loop from a corrupt cached session. It should not be left enabled.

If you need to clear a stale session: sign out manually from within the app, or clear app data / reinstall.

## Other causes (simulator / first-launch only)

| Cause | When |
|-------|------|
| **iOS Simulator 18.x** | Network requests stay pending indefinitely. See [clerk/javascript#5891](https://github.com/clerk/javascript/issues/5891). Use physical device or downgrade to iOS 17. |
| **Slow network** | First launch with no cache — Clerk's config fetch can hang on poor connectivity. |
| **resourceCache bug** | `__experimental_resourceCache` had a crash with cached sessions ([#6010](https://github.com/clerk/javascript/issues/6010)). Fixed in later @clerk/expo. |

## App-specific: tokenCache

We always use `tokenCache` — never pass `tokenCache={undefined}`. The FORCE_SIGN_OUT logic handles stale sessions via `signOut()`, so disabling the cache was redundant and could cause other issues.

## Escapes when stuck

- **"Open login in browser"** — Always shown on sign-in screen; opens web login in Safari.
- Reload the app or reinstall if the session is corrupted and FORCE_SIGN_OUT must stay off.
