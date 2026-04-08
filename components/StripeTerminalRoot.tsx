import { useCallback, type ReactElement } from "react";
import { View } from "react-native";
import { useAuth } from "@clerk/expo";
import { StripeTerminalProvider } from "@stripe/stripe-terminal-react-native";
import { StripeTerminalBridgePriming } from "./StripeTerminalBridgePriming";
import { StripeTerminalEagerConnect } from "./StripeTerminalEagerConnect";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

/**
 * Keep Stripe Terminal mounted for the whole main-app session so navigating to Pay
 * does not create/destroy the native SDK (avoids crashes and "no listeners" races).
 */
export function StripeTerminalRoot({ children }: { children: ReactElement | ReactElement[] }) {
  const { getToken } = useAuth();

  const fetchConnectionToken = useCallback(async () => {
    try {
      const gt = getToken;
      if (!gt || typeof gt !== "function") {
        throw new Error("Auth not ready");
      }
      let token: string | null = null;
      for (let i = 0; i < 5; i++) {
        try {
          token = await gt({ skipCache: i > 0 });
          if (token) break;
        } catch {
          // Retry
        }
        if (i < 4) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
      if (!token) throw new Error("No auth token — cannot fetch Stripe Terminal connection token");
      const url = API_URL.replace(/\/$/, "");
      const res = await fetch(`${url}/api/stripe/terminal/connection-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error ?? "Failed to get connection token");
      }
      const data = await res.json();
      if (!data.secret) throw new Error("No connection token");
      return data.secret;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : "Connection token failed");
    }
  }, [getToken]);

  return (
    <StripeTerminalProvider logLevel="error" tokenProvider={fetchConnectionToken}>
      <View style={{ flex: 1 }}>
        <StripeTerminalBridgePriming />
        <StripeTerminalEagerConnect />
        {children}
      </View>
    </StripeTerminalProvider>
  );
}
