import { useEffect, useRef, useState } from "react";
import { AppState, DeviceEventEmitter, Platform } from "react-native";
import { useAuth } from "@clerk/expo";
import { useStripeTerminal } from "@stripe/stripe-terminal-react-native";
import type { Reader } from "@stripe/stripe-terminal-react-native";
import { useRouter } from "expo-router";
import { useApiFetch, SKIP_AUTH } from "../lib/api";
import { acquireConnectLock, releaseConnectLock } from "../lib/terminal-connect-lock";
import {
  hasAcceptedTapToPayTerms,
  hasSeenTapToPayHeroModal,
  markTapToPayTermsAccepted,
} from "../lib/tap-to-pay-onboarding";

const USE_SIMULATED =
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  (process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === "1" ||
    process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === "true");

const INIT_RETRY_COOLDOWN_MS = 45_000;

export const TTP_ENABLE_REQUESTED_EVENT = "ttp:enable_requested";
export const TTP_CLEAR_CREDENTIALS_EVENT = "ttp:clear_credentials";
export const TTP_EDUCATION_READY_EVENT = "ttp:education_ready";

export function StripeTerminalEagerConnect() {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const apiFetch = useApiFetch();
  const router = useRouter();
  const authReady = SKIP_AUTH || (isLoaded && isSignedIn && !!sessionId);
  const authReadyRef = useRef(authReady);
  authReadyRef.current = authReady;

  const initAttempted = useRef(false);
  const initInFlight = useRef(false);
  const initFailUntil = useRef(0);
  const eagerStartupDone = useRef(false);
  const connectAttempted = useRef(false);
  const readersRef = useRef<Reader.Type[]>([]);
  const [, setDiscoveredReaders] = useState<Reader.Type[]>([]);
  const isInitializedRef = useRef(false);
  const userRequestedEnableRef = useRef(false);

  const {
    initialize,
    isInitialized,
    discoverReaders,
    cancelDiscovering,
    connectReader,
    connectedReader,
    clearCachedCredentials,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      readersRef.current = readers;
      setDiscoveredReaders(readers);
    },
    onDidAcceptTermsOfService: () => {
      markTapToPayTermsAccepted().catch(() => {});
      DeviceEventEmitter.emit(TTP_EDUCATION_READY_EVENT);
      setTimeout(() => router.push("/(tabs)/tap-to-pay-education?fromTerms=1"), 80);
    },
  });

  useEffect(() => {
    isInitializedRef.current = isInitialized;
  }, [isInitialized]);

  function triggerInit(source: string) {
    if (!authReadyRef.current) {
      if (__DEV__) console.log("[TerminalEager] skip init — auth not ready", source);
      return;
    }
    if (Date.now() < initFailUntil.current) {
      if (__DEV__) console.log("[TerminalEager] skip init — cooldown", source);
      return;
    }
    if (isInitializedRef.current || initAttempted.current || initInFlight.current) {
      return;
    }
    initAttempted.current = true;
    initInFlight.current = true;
    if (__DEV__) console.log("[TerminalEager] initialize() start", source);

    initialize()
      .then(() => {
        if (__DEV__) {
          console.log(
            "[TerminalEager] initialize() done, isInitialized=",
            isInitializedRef.current,
          );
        }
        if (!isInitializedRef.current) {
          initFailUntil.current = Date.now() + INIT_RETRY_COOLDOWN_MS;
        }
      })
      .catch((e) => {
        if (__DEV__) console.warn("[TerminalEager] init failed", e);
        initFailUntil.current = Date.now() + INIT_RETRY_COOLDOWN_MS;
      })
      .finally(() => {
        initInFlight.current = false;
      });
  }

  // One startup path: returning users with TTP onboarding complete.
  useEffect(() => {
    if (Platform.OS !== "ios" || eagerStartupDone.current) return;

    let cancelled = false;

    (async () => {
      const [accepted, heroSeen] = await Promise.all([
        hasAcceptedTapToPayTerms(),
        hasSeenTapToPayHeroModal(),
      ]);
      if (cancelled) return;

      if (!accepted || !heroSeen) {
        if (__DEV__) console.log("[TerminalEager] waiting for user to enable TTP");
        return;
      }

      eagerStartupDone.current = true;

      const authDeadline = Date.now() + 20_000;
      while (Date.now() < authDeadline && !authReadyRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (cancelled || !authReadyRef.current) return;

      triggerInit("startup");
    })();

    const resetSub = DeviceEventEmitter.addListener(TTP_CLEAR_CREDENTIALS_EVENT, () => {
      initAttempted.current = false;
      initFailUntil.current = 0;
      initInFlight.current = false;
      userRequestedEnableRef.current = false;
      clearCachedCredentials().catch(() => {});
    });

    const enableSub = DeviceEventEmitter.addListener(TTP_ENABLE_REQUESTED_EVENT, () => {
      if (!authReadyRef.current) {
        if (__DEV__) console.warn("[TerminalEager] enable ignored — sign in first");
        return;
      }
      if (isInitializedRef.current) {
        markTapToPayTermsAccepted().catch(() => {});
        DeviceEventEmitter.emit(TTP_EDUCATION_READY_EVENT);
        setTimeout(() => router.push("/(tabs)/tap-to-pay-education"), 80);
        return;
      }
      userRequestedEnableRef.current = true;
      initFailUntil.current = 0;
      triggerInit("enable-event");
    });

    return () => {
      cancelled = true;
      resetSub.remove();
      enableSub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authReady || eagerStartupDone.current || Platform.OS !== "ios") return;
    (async () => {
      const [accepted, heroSeen] = await Promise.all([
        hasAcceptedTapToPayTerms(),
        hasSeenTapToPayHeroModal(),
      ]);
      if (!accepted || !heroSeen) return;
      eagerStartupDone.current = true;
      triggerInit("auth-ready");
    })();
  }, [authReady]);

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
            : { discoveryMethod: "tapToPay" },
        );
        if (result.error) {
          connectAttempted.current = false;
          return;
        }

        const deadline = Date.now() + 8000;
        while (Date.now() < deadline && !readersRef.current.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
        const reader = readersRef.current[0];
        if (!reader) {
          connectAttempted.current = false;
          return;
        }

        if (USE_SIMULATED) {
          await connectReader({ discoveryMethod: "internet", reader });
          return;
        }

        const locRes = await locationPromise!;
        if (!locRes.ok) {
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
          connectAttempted.current = false;
        } else if (userRequestedEnableRef.current) {
          userRequestedEnableRef.current = false;
          markTapToPayTermsAccepted().catch(() => {});
          DeviceEventEmitter.emit(TTP_EDUCATION_READY_EVENT);
          setTimeout(() => router.push("/(tabs)/tap-to-pay-education"), 80);
        }
      } catch {
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
