import { useEffect, useLayoutEffect, useMemo, useRef, useCallback, useState, type ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthHandoffHandler } from "../components/AuthHandoffHandler";
import { ThemeProvider, useTheme } from "../lib/theme-context";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastProvider } from "../components/Toast";
import { DemoModeProvider, useDemoMode } from "../lib/demo-mode-context";
import { DemoProvider } from "../lib/demo-context";
import { SetupProvider, useSetup } from "../lib/setup-context";
import { BiometricLockProvider, useBiometricLock } from "../lib/biometric-lock-context";
import { BiometricLockScreen } from "../components/BiometricLockScreen";
import { BiometricEnablePrompt } from "../components/BiometricEnablePrompt";
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
const FORCE_SIGN_OUT_KEY = "coconut.force_signout_done";

function AuthSwitch() {
  const { isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const { isDemoOn, demoModeHydrated } = useDemoMode();
  const { setupComplete, setupHydrated } = useSetup();
  const [forceSignOutDone, setForceSignOutDone] = useState(false);
  const checkedStore = useRef(false);

  useEffect(() => {
    if (!FORCE_SIGN_OUT_ON_LAUNCH || checkedStore.current) return;
    checkedStore.current = true;
    SecureStore.getItemAsync(FORCE_SIGN_OUT_KEY).then((val) => {
      if (val === "true") setForceSignOutDone(true);
    }).catch(() => {});
  }, []);
  const instance = useMemo(() => {
    if (!publishableKey) return "missing";
    const [, env, encoded = ""] = publishableKey.match(/^pk_(test|live)_(.+)$/) ?? [];
    if (!env || !encoded) return "invalid";
    return `${env}:${encoded.slice(0, 16)}...`;
  }, []);

  useEffect(() => {
    if (SKIP_AUTH) return;
    const showAuth = !isLoaded || !isSignedIn || (FORCE_SIGN_OUT_ON_LAUNCH && isSignedIn);
    console.log(`[AuthSwitch] isLoaded=${isLoaded} isSignedIn=${isSignedIn} setup=${setupComplete} FORCE_SIGN_OUT=${FORCE_SIGN_OUT_ON_LAUNCH} → ${showAuth ? "AUTH" : setupComplete || isDemoOn ? "TABS" : "SETUP"}`);
  }, [isLoaded, isSignedIn, setupComplete, isDemoOn, instance]);

  useEffect(() => {
    if (SKIP_AUTH || !FORCE_SIGN_OUT_ON_LAUNCH || !isLoaded || forceSignOutDone) return;
    setForceSignOutDone(true);
    void SecureStore.setItemAsync(FORCE_SIGN_OUT_KEY, "true");
    if (isSignedIn) {
      console.log("[AuthSwitch] FORCE_SIGN_OUT: calling signOut()...");
      signOut?.()
        .then(() => console.log("[AuthSwitch] FORCE_SIGN_OUT: signOut() done"))
        .catch((e: unknown) => console.warn("[AuthSwitch] FORCE_SIGN_OUT failed:", e));
    }
  }, [isLoaded, isSignedIn, signOut, forceSignOutDone]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !setupHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const pendingToken = await AsyncStorage.getItem("coconut.pending_invite_token");
        if (cancelled || !pendingToken) return;
        await AsyncStorage.removeItem("coconut.pending_invite_token");
        setTimeout(() => {
          router.push({ pathname: "/join/[token]", params: { token: pendingToken } } as any);
        }, 500);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, setupHydrated]);

  if (SKIP_AUTH) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="connected" options={{ headerShown: false }} />
        <Stack.Screen name="splitwise-callback" options={{ headerShown: false }} />
        <Stack.Screen name="join/[token]" options={{ headerShown: false, presentation: "modal" }} />
      </Stack>
    );
  }

  const waitingDemoHydration = !demoModeHydrated;
  const forceAuthWhileSignedIn = FORCE_SIGN_OUT_ON_LAUNCH && isSignedIn && !forceSignOutDone;
  const needRealSignIn = !isSignedIn && !isDemoOn;

  const showAuth = waitingDemoHydration || !isLoaded || needRealSignIn || forceAuthWhileSignedIn;
  const signedInAndReady = !showAuth && setupHydrated;
  const needsSetup = signedInAndReady && !isDemoOn && !setupComplete;

  const target = showAuth ? "/(auth)" : needsSetup ? "/setup" : signedInAndReady ? "/(tabs)" : null;

  return (
    <BiometricLockProvider isSignedIn={!showAuth}>
      {signedInAndReady && !needsSetup && <BiometricLockGate />}
      {signedInAndReady && !needsSetup && <BiometricFirstTimePrompt />}
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} initialRouteName="(auth)">
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="auth-handoff" options={{ headerShown: false }} />
        <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="connected" options={{ headerShown: false }} />
        <Stack.Screen name="splitwise-callback" options={{ headerShown: false }} />
        <Stack.Screen name="join/[token]" options={{ headerShown: false, presentation: "modal" }} />
      </Stack>
      <NavigateOnChange target={target} />
    </BiometricLockProvider>
  );
}

function NavigateOnChange({ target }: { target: string | null }) {
  const lastTarget = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!target || target === lastTarget.current) return;
    lastTarget.current = target;
    router.replace(target as any);
  }, [target]);
  return null;
}

function BiometricLockGate() {
  const { isLocked, enabled, hydrated } = useBiometricLock();
  if (!hydrated || !enabled || !isLocked) return null;
  return <BiometricLockScreen />;
}

const BIOMETRIC_PROMPT_SHOWN_KEY = "coconut.biometric_prompt_shown_v2";

function BiometricFirstTimePrompt() {
  const { biometricAvailable, enabled, hydrated } = useBiometricLock();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!hydrated || !biometricAvailable || enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const shown = await SecureStore.getItemAsync(BIOMETRIC_PROMPT_SHOWN_KEY);
        if (cancelled || shown === "true") return;
        setTimeout(() => {
          if (!cancelled) setShowPrompt(true);
        }, 1200);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated, biometricAvailable, enabled]);

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  const handleDecline = () => {
    setShowPrompt(false);
    void SecureStore.setItemAsync(BIOMETRIC_PROMPT_SHOWN_KEY, "true");
  };

  if (!showPrompt) return null;
  return <BiometricEnablePrompt visible onDismiss={handleDismiss} onDecline={handleDecline} />;
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
            <SetupProvider>
              <ErrorBoundary>
                <ToastProvider>
                  <StatusBarFromTheme />
                  <AuthHandoffHandler />
                  <AuthSwitch />
                </ToastProvider>
              </ErrorBoundary>
            </SetupProvider>
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
