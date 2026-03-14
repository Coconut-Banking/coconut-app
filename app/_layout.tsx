import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
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
    let token: string | null = null;
    for (let i = 0; i < 4; i++) {
      token = await getToken({ skipCache: i > 0 });
      if (token) break;
      if (i < 3) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/stripe/terminal/connection-token`, {
      method: "POST",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
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

function AuthSwitch() {
  const { isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const [timedOut, setTimedOut] = useState(false);
  const hasClearedSession = useRef(false);
  const instance = useMemo(() => {
    if (!publishableKey) return "missing";
    const [, env, encoded = ""] = publishableKey.match(/^pk_(test|live)_(.+)$/) ?? [];
    if (!env || !encoded) return "invalid";
    return `${env}:${encoded.slice(0, 16)}...`;
  }, []);

  useEffect(() => {
    if (isLoaded) {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [isLoaded]);

  useEffect(() => {
    console.log(`[auth] isLoaded=${String(isLoaded)} isSignedIn=${String(isSignedIn)} instance=${instance}`);
  }, [isLoaded, isSignedIn, instance]);

  // Clear stale cached session that causes sign-in → tabs → forever-spinner loop
  useEffect(() => {
    if (!FORCE_SIGN_OUT_ON_LAUNCH || !isLoaded || !isSignedIn || hasClearedSession.current) return;
    hasClearedSession.current = true;
    signOut?.().catch((e: unknown) => console.warn("[auth] force sign-out failed:", e));
  }, [isLoaded, isSignedIn, signOut]);

  if (!isLoaded && !timedOut) {
    const webLoginUrl = `${API_URL.replace(/\/$/, "")}/login`;
    return (
      <View style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator size="large" color="#3D8E62" />
        <Text style={{ marginTop: 12, color: "#6B7280", fontSize: 14 }}>Initializing auth...</Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(webLoginUrl)}
          style={{
            marginTop: 24,
            backgroundColor: "#3D8E62",
            paddingVertical: 14,
            paddingHorizontal: 24,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Open login in browser</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!isLoaded && timedOut) {
    const webLoginUrl = `${API_URL.replace(/\/$/, "")}/login`;
    return (
      <View style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: "#1F2937", marginBottom: 8 }}>Auth stuck loading</Text>
        <Text style={{ color: "#6B7280", textAlign: "center", lineHeight: 20 }}>
          Clerk did not finish initialization on this device.
        </Text>
        <Text style={{ color: "#9CA3AF", textAlign: "center", marginTop: 10, fontSize: 12 }}>
          instance: {instance}
        </Text>
        <Text style={{ color: "#9CA3AF", textAlign: "center", marginTop: 4, fontSize: 12 }}>
          key present: {String(Boolean(publishableKey))}
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL(webLoginUrl)}
          style={{
            marginTop: 18,
            backgroundColor: "#3D8E62",
            paddingVertical: 12,
            paddingHorizontal: 18,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Open login in browser</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTimedOut(false)}
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: "#3D8E62", fontWeight: "500" }}>Retry auth init</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (isSignedIn) {
    return (
      <TerminalTokenProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="connected" options={{ headerShown: false }} />
        </Stack>
      </TerminalTokenProvider>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={publishableKey ?? ""}
      tokenCache={tokenCache}
    >
      <StatusBar style="auto" />
      <AuthSwitch />
    </ClerkProvider>
  );
}
