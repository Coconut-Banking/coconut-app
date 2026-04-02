import { useEffect, useMemo, useRef, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { StripeTerminalProvider } from "@stripe/stripe-terminal-react-native";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-lemon.vercel.app";

if (!publishableKey) {
  console.warn("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY not set — auth will fail");
}

function TerminalTokenProvider({ children }: { children: React.ReactElement | React.ReactElement[] }) {
  const { getToken } = useAuth();

  const fetchConnectionToken = async () => {
    if (SKIP_AUTH) {
      throw new Error("SKIP_AUTH mode: Stripe Terminal token fetch skipped");
    }
    let token: string | null = null;
    for (let i = 0; i < 4; i++) {
      token = await getToken({ skipCache: i > 0 });
      if (token) break;
      if (i < 3) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
    if (!token) {
      throw new Error("Auth token unavailable — Stripe Terminal connection token skipped");
    }
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/stripe/terminal/connection-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to get connection token");
    return data.secret;
  };

  return (
    <StripeTerminalProvider
      logLevel="error"
      tokenProvider={fetchConnectionToken}
    >
      {children}
    </StripeTerminalProvider>
  );
}

const FORCE_SIGN_OUT_ON_LAUNCH = process.env.EXPO_PUBLIC_FORCE_SIGN_OUT === "true";
const SKIP_AUTH = process.env.EXPO_PUBLIC_SKIP_AUTH === "true";

function AuthSwitch() {
  const { isSignedIn, isLoaded, sessionId } = useAuth();
  const { signOut } = useClerk();
  const hasClearedSession = useRef(false);
  const [forceSignOutDone, setForceSignOutDone] = useState(!FORCE_SIGN_OUT_ON_LAUNCH);
  const instance = useMemo(() => {
    if (!publishableKey) return "missing";
    const [, env, encoded = ""] = publishableKey.match(/^pk_(test|live)_(.+)$/) ?? [];
    if (!env || !encoded) return "invalid";
    return `${env}:${encoded.slice(0, 16)}...`;
  }, []);

  useEffect(() => {
    if (SKIP_AUTH) return;
    const showAuth = !isLoaded || !isSignedIn || !forceSignOutDone;
    console.log(`[AuthSwitch] isLoaded=${isLoaded} isSignedIn=${isSignedIn} FORCE_SIGN_OUT=${FORCE_SIGN_OUT_ON_LAUNCH} forceSignOutDone=${forceSignOutDone} → ${showAuth ? "AUTH" : "TABS"}`);
  }, [isLoaded, isSignedIn, forceSignOutDone, instance]);

  // Clear stale cached session that causes sign-in → tabs → forever-spinner loop
  useEffect(() => {
    if (SKIP_AUTH || !FORCE_SIGN_OUT_ON_LAUNCH || !isLoaded || !isSignedIn || hasClearedSession.current) return;
    console.log("[AuthSwitch] FORCE_SIGN_OUT: calling signOut()...");
    hasClearedSession.current = true;
    signOut?.()
      .then(() => {
        console.log("[AuthSwitch] FORCE_SIGN_OUT: signOut() done");
        setForceSignOutDone(true);
      })
      .catch((e: unknown) => console.warn("[AuthSwitch] FORCE_SIGN_OUT failed:", e));
  }, [isLoaded, isSignedIn, signOut]);

  // SKIP_AUTH: always show tabs so you can see the UI without signing in
  if (SKIP_AUTH) {
    return (
      <TerminalTokenProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="connected" options={{ headerShown: false }} />
        </Stack>
      </TerminalTokenProvider>
    );
  }

  // Block tabs when: not loaded, not signed in, OR force sign-out not yet complete
  if (!isLoaded || !isSignedIn || !forceSignOutDone) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="connected" options={{ headerShown: false }} />
      </Stack>
    );
  }
  return (
    <TerminalTokenProvider>
      <Stack key={sessionId ?? "no-session"} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="connected" options={{ headerShown: false }} />
      </Stack>
    </TerminalTokenProvider>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={publishableKey ?? ""}
      tokenCache={SKIP_AUTH ? undefined : tokenCache}
    >
      <StatusBar style="auto" />
      <AuthSwitch />
    </ClerkProvider>
  );
}
