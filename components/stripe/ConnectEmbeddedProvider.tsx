import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  ConnectComponentsProvider,
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from "@stripe/stripe-react-native";
import { useApiFetch } from "../../lib/api";
import {
  canUseStripeConnectEmbedded,
  getStripePublishableKey,
  STRIPE_CONNECT_APPEARANCE,
  type ConnectEmbeddedMode,
} from "../../lib/stripe-connect-embedded";

type Props = {
  mode: ConnectEmbeddedMode;
  children: ReactNode;
};

export function ConnectEmbeddedProvider({ mode, children }: Props) {
  const apiFetch = useApiFetch();
  const apiFetchRef = useRef(apiFetch);
  apiFetchRef.current = apiFetch;

  const connectInstance = useMemo((): StripeConnectInstance | null => {
    const publishableKey = getStripePublishableKey();
    if (!publishableKey || !canUseStripeConnectEmbedded()) return null;

    return loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: async () => {
        const res = await apiFetchRef.current("/api/stripe/connect/account-session", {
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
      },
      appearance: STRIPE_CONNECT_APPEARANCE,
    });
  }, [mode]);

  if (!connectInstance) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e2021" />
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
    backgroundColor: "#F6F0E2",
  },
});
