import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useStripeTerminal } from "@stripe/stripe-terminal-react-native";
import type { Reader } from "@stripe/stripe-terminal-react-native";
import { useApiFetch } from "../lib/api";
import { acquireConnectLock, releaseConnectLock } from "../lib/terminal-connect-lock";

const USE_SIMULATED =
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  (process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === "1" ||
    process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === "true");

/**
 * Mounts alongside StripeTerminalBridgePriming inside StripeTerminalRoot.
 * Eagerly initializes the SDK, discovers the Tap to Pay reader, and connects
 * so the pay screen is instant when the user navigates to it.
 *
 * The connected reader and isInitialized state are shared via the
 * StripeTerminalProvider context — any component calling useStripeTerminal()
 * will see them.
 */
export function StripeTerminalEagerConnect() {
  const apiFetch = useApiFetch();
  const initAttempted = useRef(false);
  const connectAttempted = useRef(false);
  const readersRef = useRef<Reader.Type[]>([]);
  const [, setDiscoveredReaders] = useState<Reader.Type[]>([]);

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
  });

  useEffect(() => {
    if (isInitialized || initAttempted.current) return;
    initAttempted.current = true;
    initialize().catch((e) => {
      if (__DEV__) console.warn("[TerminalEager] init failed", e);
      initAttempted.current = false;
    });
  }, [initialize, isInitialized]);

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

        const locRes = await apiFetch("/api/stripe/terminal/location");
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
