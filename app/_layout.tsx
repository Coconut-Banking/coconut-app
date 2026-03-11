import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, useAuth } from "@clerk/expo";
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

const SKIP_AUTH = process.env.EXPO_PUBLIC_SKIP_AUTH === "true";

function AuthSwitch() {
  const { isSignedIn, isLoaded } = useAuth();
  if (SKIP_AUTH) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="connected" options={{ headerShown: false }} />
      </Stack>
    );
  }
  if (!isLoaded) return <View style={{ flex: 1, backgroundColor: "#fff" }} />;
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
