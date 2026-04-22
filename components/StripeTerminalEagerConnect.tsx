import { useEffect, useRef, useState } from "react";
import { AppState, DeviceEventEmitter, Platform } from "react-native";
import { useStripeTerminal } from "@stripe/stripe-terminal-react-native";
import type { Reader } from "@stripe/stripe-terminal-react-native";
import { useRouter } from "expo-router";
import { useApiFetch } from "../lib/api";
import { acquireConnectLock, releaseConnectLock } from "../lib/terminal-connect-lock";
import {
  hasAcceptedTapToPayTerms,
  markTapToPayTermsAccepted,
} from "../lib/tap-to-pay-onboarding";

const USE_SIMULATED =
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  (process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === "1" ||
    process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === "true");

/**
 * Event name fired when the user explicitly taps "Enable Tap to Pay on iPhone".
 * StripeTerminalEagerConnect listens for this to trigger initialization for first-time users.
 */
export const TTP_ENABLE_REQUESTED_EVENT = "ttp:enable_requested";

/**
 * Mounts for the whole main-app session inside StripeTerminalRoot.
 *
 * First-time users: initialization is GATED on the user tapping "Enable Tap to Pay on iPhone"
 * (fires TTP_ENABLE_REQUESTED_EVENT). This ensures Apple's T&C screen only appears in
 * response to a deliberate user action, as required by the TTP entitlement checklist §3.5.
 *
 * Returning users (T&C already accepted): eager connect proceeds automatically.
 *
 * Also owns the onDidAcceptTermsOfService callback so it's globally active regardless of
 * which screen is currently mounted.
 */
export function StripeTerminalEagerConnect() {
  const apiFetch = useApiFetch();
  const router = useRouter();
  const initAttempted = useRef(false);
  const connectAttempted = useRef(false);
  const readersRef = useRef<Reader.Type[]>([]);
  const [, setDiscoveredReaders] = useState<Reader.Type[]>([]);
  const termsCheckDoneRef = useRef(false);

  const {
    initialize,
    isInitialized,
    discoverReaders,
    cancelDiscovering,
    connectReader,
    connectedReader,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      readersRef.current = readers;
      setDiscoveredReaders(readers);
    },
    onDidAcceptTermsOfService: () => {
      // Apple checklist §4.1: show education immediately after T&C acceptance
      markTapToPayTermsAccepted().catch(() => {});
      router.push("/(tabs)/tap-to-pay-education?fromTerms=1");
    },
  });

  // Gate initialization: for first-time users wait for explicit "Enable" action
  useEffect(() => {
    if (Platform.OS !== "ios") return;

    let cancelled = false;

    (async () => {
      const accepted = await hasAcceptedTapToPayTerms();
      if (cancelled) return;
      termsCheckDoneRef.current = true;

      if (accepted) {
        // Returning user — proceed with eager init immediately
        triggerInit();
      } else {
        // New user — wait for explicit enable tap
        if (__DEV__) console.log("[TerminalEager] waiting for user to enable TTP");
      }
    })();

    // Listen for the explicit "Enable Tap to Pay on iPhone" user action
    const sub = DeviceEventEmitter.addListener(TTP_ENABLE_REQUESTED_EVENT, () => {
      if (__DEV__) console.log("[TerminalEager] enable requested by user");
      initAttempted.current = false; // Allow init
      triggerInit();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function triggerInit() {
    if (isInitialized || initAttempted.current) return;
    initAttempted.current = true;
    initialize().catch((e) => {
      if (__DEV__) console.warn("[TerminalEager] init failed", e);
      initAttempted.current = false;
    });
  }

  // Once initialized, discover + connect the TTP reader
  useEffect(() => {
    if (!isInitialized || connectedReader || connectAttempted.current) return;
    connectAttempted.current = true;

    (async () => {
      if (!acquireConnectLock()) {
        connectAttempted.current = false;
        return;
      }
      try {
        await cancelDiscovering().catch(() => {});

        const locationPromise = USE_SIMULATED
          ? null
          : apiFetch("/api/stripe/terminal/location");

        const result = await discoverReaders(
          USE_SIMULATED
            ? { discoveryMethod: "internet", simulated: true }
            : { discoveryMethod: "tapToPay" }
        );
        if (result.error) {
          if (__DEV__) console.log("[TerminalEager] discover error", result.error.message);
          connectAttempted.current = false;
          return;
        }

        const deadline = Date.now() + 8000;
        while (Date.now() < deadline && !readersRef.current.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
        const reader = readersRef.current[0];
        if (!reader) {
          if (__DEV__) console.log("[TerminalEager] no readers discovered");
          connectAttempted.current = false;
          return;
        }

        if (USE_SIMULATED) {
          await connectReader({ discoveryMethod: "internet", reader });
          if (__DEV__) console.log("[TerminalEager] simulated reader connected");
          return;
        }

        const locRes = await locationPromise!;
        if (!locRes.ok) {
          if (__DEV__) console.warn("[TerminalEager] location fetch failed");
          connectAttempted.current = false;
          return;
        }
        const { locationId } = await locRes.json();
        if (!locationId) {
          connectAttempted.current = false;
          return;
        }

        const connectResult = await connectReader({
          discoveryMethod: "tapToPay",
          reader,
          locationId,
          autoReconnectOnUnexpectedDisconnect: true,
        });
        if (connectResult.error) {
          if (__DEV__) console.warn("[TerminalEager] connect failed", connectResult.error.message);
          connectAttempted.current = false;
        } else if (__DEV__) {
          console.log("[TerminalEager] reader connected");
        }
      } catch (e) {
        if (__DEV__) console.warn("[TerminalEager] error", e);
        connectAttempted.current = false;
      } finally {
        releaseConnectLock();
      }
    })();
  }, [isInitialized, connectedReader, discoverReaders, cancelDiscovering, connectReader, apiFetch]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isInitialized && !connectedReader) {
        connectAttempted.current = false;
      }
    });
    return () => sub.remove();
  }, [isInitialized, connectedReader]);

  return null;
}
