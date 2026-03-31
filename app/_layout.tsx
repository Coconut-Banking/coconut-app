import { useEffect, useMemo, useRef, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { AuthHandoffHandler } from "../components/AuthHandoffHandler";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastProvider } from "../components/Toast";
import { DemoModeProvider, useDemoMode } from "../lib/demo-mode-context";
import { DemoProvider } from "../lib/demo-context";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync();

function StatusBarFromTheme() {
  const { theme } = useTheme();
  return <StatusBar style={theme.statusBarStyle === "dark" ? "dark" : "light"} />;
}

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.warn("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY not set — auth will fail");
}

const FORCE_SIGN_OUT_ON_LAUNCH = process.env.EXPO_PUBLIC_FORCE_SIGN_OUT === "true";
const SKIP_AUTH = process.env.EXPO_PUBLIC_SKIP_AUTH === "true";


function AuthSwitch() {
  const { isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const { isDemoOn, demoModeHydrated } = useDemoMode();
  const hasClearedSession = useRef(false);
  const instance = useMemo(() => {
    if (!publishableKey) return "missing";
    const [, env, encoded = ""] = publishableKey.match(/^pk_(test|live)_(.+)$/) ?? [];
    if (!env || !encoded) return "invalid";
    return `${env}:${encoded.slice(0, 16)}...`;
  }, []);

  useEffect(() => {
    if (SKIP_AUTH) return;
    const showAuth = !isLoaded || !isSignedIn || (FORCE_SIGN_OUT_ON_LAUNCH && isSignedIn);
    console.log(`[AuthSwitch] isLoaded=${isLoaded} isSignedIn=${isSignedIn} FORCE_SIGN_OUT=${FORCE_SIGN_OUT_ON_LAUNCH} → ${showAuth ? "AUTH" : "TABS"}`);
  }, [isLoaded, isSignedIn, instance]);

  useEffect(() => {
    if (SKIP_AUTH || !FORCE_SIGN_OUT_ON_LAUNCH || !isLoaded || !isSignedIn || hasClearedSession.current) return;
    console.log("[AuthSwitch] FORCE_SIGN_OUT: calling signOut()...");
    hasClearedSession.current = true;
    signOut?.()
      .then(() => console.log("[AuthSwitch] FORCE_SIGN_OUT: signOut() done"))
      .catch((e: unknown) => console.warn("[AuthSwitch] FORCE_SIGN_OUT failed:", e));
  }, [isLoaded, isSignedIn, signOut]);

  if (SKIP_AUTH) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="connected" options={{ headerShown: false }} />
        <Stack.Screen name="splitwise-callback" options={{ headerShown: false }} />
      </Stack>
    );
  }

  const waitingDemoHydration = !demoModeHydrated;
  const forceAuthWhileSignedIn = FORCE_SIGN_OUT_ON_LAUNCH && isSignedIn;
  const needRealSignIn = !isSignedIn && !isDemoOn;
  if (waitingDemoHydration || !isLoaded || needRealSignIn || forceAuthWhileSignedIn) {
    return (
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="auth-handoff" options={{ headerShown: false }} />
        <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
      </Stack>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="connected" options={{ headerShown: false }} />
      <Stack.Screen name="splitwise-callback" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  const onLayoutReady = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    onLayoutReady();
  }, [onLayoutReady]);

  if (!fontsLoaded) return null;

  if (!publishableKey) {
    return (
      <View style={styles.configErrorContainer}>
        <Text style={styles.configErrorTitle}>Configuration error</Text>
        <Text style={styles.configErrorText}>
          Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in this build.
        </Text>
      </View>
    );
  }

  return (
    <ThemeProvider>
      <ClerkProvider
        publishableKey={publishableKey ?? ""}
        tokenCache={tokenCache}
      >
        <DemoModeProvider>
          <DemoProvider>
            <ErrorBoundary>
              <ToastProvider>
                <StatusBarFromTheme />
                <AuthHandoffHandler />
                <AuthSwitch />
              </ToastProvider>
            </ErrorBoundary>
          </DemoProvider>
        </DemoModeProvider>
      </ClerkProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  configErrorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  configErrorTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111827",
  },
  configErrorText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: "#4B5563",
  },
});
