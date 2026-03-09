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

function TerminalTokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  const fetchConnectionToken = async () => {
    const token = await getToken();
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/stripe/terminal/connection-token`, {
      method: "POST",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
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

function AuthSwitch() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) {
    return (
      <TerminalTokenProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
