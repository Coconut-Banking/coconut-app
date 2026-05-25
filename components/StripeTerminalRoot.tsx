import { useCallback, useRef, type ReactElement } from "react";
import { View } from "react-native";
import { useAuth } from "@clerk/expo";
import { StripeTerminalProvider } from "@stripe/stripe-terminal-react-native";
import {
  fetchClerkBearerTokenForTerminal,
  getCachedSessionBearer,
  SKIP_AUTH,
} from "../lib/api";
import { StripeTerminalBridgePriming } from "./StripeTerminalBridgePriming";
import { StripeTerminalEagerConnect } from "./StripeTerminalEagerConnect";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Keep Stripe Terminal mounted for the whole main-app session so navigating to Pay
 * does not create/destroy the native SDK (avoids crashes and "no listeners" races).
 */
export function StripeTerminalRoot({ children }: { children: ReactElement | ReactElement[] }) {
  const { getToken, isLoaded, isSignedIn, sessionId } = useAuth();
  const authRef = useRef({ getToken, isLoaded, isSignedIn, sessionId });
  authRef.current = { getToken, isLoaded, isSignedIn, sessionId };

  const fetchConnectionToken = useCallback(async () => {
    if (!API_URL) {
      throw new Error("EXPO_PUBLIC_API_URL is not set");
    }

    const deadline = Date.now() + 25_000;

    while (Date.now() < deadline) {
      const { getToken: gt, isLoaded: loaded, isSignedIn: signedIn, sessionId: sid } =
        authRef.current;

      if (!SKIP_AUTH) {
        if (!loaded) {
          await sleep(300);
          continue;
        }
        if (!signedIn || !sid) {
          throw new Error("Sign in to use Tap to Pay");
        }
      }

      let bearer = getCachedSessionBearer();
      if (!bearer && typeof gt === "function") {
        bearer = await fetchClerkBearerTokenForTerminal(gt);
      }
      if (!bearer) {
        await sleep(400);
        continue;
      }

      const url = API_URL.replace(/\/$/, "");
      const res = await fetch(`${url}/api/stripe/terminal/connection-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `Connection token failed (${res.status})`);
      }
      const data = (await res.json()) as { secret?: string };
      if (!data.secret) throw new Error("No connection token");
      if (__DEV__) console.log("[Terminal] connection token ok");
      return data.secret;
    }

    throw new Error("Could not get session token for Tap to Pay. Pull to refresh Home, then try again.");
  }, []);

  return (
    <StripeTerminalProvider logLevel="error" tokenProvider={fetchConnectionToken}>
      <View style={{ flex: 1, backgroundColor: "#F6F0E2" }}>
        <StripeTerminalBridgePriming />
        <StripeTerminalEagerConnect />
        {children}
      </View>
    </StripeTerminalProvider>
  );
}
