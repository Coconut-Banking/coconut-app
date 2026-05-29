import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ConnectComponentsProvider,
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from "@stripe/stripe-react-native";
import { useApiFetch } from "../../lib/api";
import { font } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import {
  canUseStripeConnectEmbedded,
  getStripePublishableKey,
  STRIPE_CONNECT_APPEARANCE,
  type ConnectEmbeddedMode,
} from "../../lib/stripe-connect-embedded";

type BootState = "loading" | "ready" | "error";

type Props = {
  mode: ConnectEmbeddedMode;
  children: ReactNode;
  /** Real Stripe hosted onboarding when embedded webview fails to load. */
  onHostedFallback?: () => void;
};

async function fetchConnectClientSecret(
  apiFetch: ReturnType<typeof useApiFetch>,
  mode: ConnectEmbeddedMode,
): Promise<string> {
  const res = await apiFetch("/api/stripe/connect/account-session", {
    method: "POST",
    body: { mode },
  });
  const data = (await res.json().catch(() => ({}))) as {
    clientSecret?: string;
    error?: string;
  };
  if (!res.ok || !data.clientSecret) {
    throw new Error(data.error ?? "Could not start Stripe Connect session");
  }
  return data.clientSecret;
}

export function ConnectEmbeddedProvider({ mode, children, onHostedFallback }: Props) {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;

  const [bootState, setBootState] = useState<BootState>("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const publishableKey = getStripePublishableKey();
    if (!publishableKey || !canUseStripeConnectEmbedded()) {
      setBootError("Stripe embedded payouts are not configured in this build.");
      setBootState("error");
      setConnectInstance(null);
      return;
    }

    let cancelled = false;
    setBootState("loading");
    setBootError(null);
    setConnectInstance(null);

    const instance = loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: () => fetchConnectClientSecret(apiFetchRef.current, mode),
      appearance: STRIPE_CONNECT_APPEARANCE,
    });

    void (async () => {
      try {
        await fetchConnectClientSecret(apiFetchRef.current, mode);
        if (cancelled) return;
        if (__DEV__) console.log("[ConnectEmbedded] session ok, mode=", mode);
        setConnectInstance(instance);
        setBootState("ready");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Could not connect to Stripe";
        if (__DEV__) console.warn("[ConnectEmbedded] session failed:", msg);
        setBootError(msg);
        setBootState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, attempt]);

  if (bootState === "loading") {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Connecting to Stripe…
        </Text>
      </View>
    );
  }

  if (bootState === "error" || !connectInstance) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorTitle, { color: theme.text }]}>Could not load payout setup</Text>
        <Text style={[styles.errorMessage, { color: theme.textTertiary }]}>
          {bootError ?? "Something went wrong. Try again or continue in Safari."}
        </Text>
        <Pressable
          style={[styles.btn, { backgroundColor: theme.primary }]}
          onPress={() => setAttempt((n) => n + 1)}
        >
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
        {onHostedFallback ? (
          <Pressable style={styles.linkBtn} onPress={onHostedFallback}>
            <Text style={[styles.linkText, { color: theme.text }]}>Continue in Safari</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      {children}
    </ConnectComponentsProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 15,
    fontFamily: font.medium,
    textAlign: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: font.bold,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 14,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: font.semibold,
  },
  linkBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  linkText: {
    fontSize: 15,
    fontFamily: font.semibold,
    textDecorationLine: "underline",
  },
});
