import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
  AppState,
  Share,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStripeTerminal } from "@stripe/stripe-terminal-react-native";
import type { Reader, StripeError } from "@stripe/stripe-terminal-react-native";
import { ErrorCode } from "@stripe/stripe-terminal-react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApiFetch, invalidateApiCache } from "../../lib/api";
import { useTheme } from "../../lib/theme-context";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { TapToPayButtonIcon } from "../../components/TapToPayButtonIcon";
import { colors, font, fontSize, shadow, radii, space } from "../../lib/theme";
import { waitForConnectLock } from "../../lib/terminal-connect-lock";

/**
 * iOS often returns UNSUPPORTED_OPERATION / native 2900 when the app binary was signed without
 * `com.apple.developer.proximity-reader.payment.acceptance` (see ENABLE_TAP_TO_PAY_IOS in app.config.js).
 */
function isLikelyTapToPayEntitlementOrSigningError(err: StripeError | undefined): boolean {
  if (!err) return false;
  if (err.code === ErrorCode.UNSUPPORTED_OPERATION) return true;
  if (err.nativeErrorCode === "2900") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("entitlement") || msg.includes("application bundle");
}

/** Error codes that indicate unsupported device/OS — show "Please update iOS" per checklist 1.4 */
const UNSUPPORTED_DEVICE_CODES = [
  ErrorCode.TAP_TO_PAY_UNSUPPORTED_DEVICE,
  ErrorCode.TAP_TO_PAY_UNSUPPORTED_ANDROID_VERSION,
  ErrorCode.TAP_TO_PAY_UNSUPPORTED_PROCESSOR,
  ErrorCode.TAP_TO_PAY_DEVICE_TAMPERED,
  ErrorCode.TAP_TO_PAY_INSECURE_ENVIRONMENT,
  ErrorCode.TAP_TO_PAY_DEBUG_NOT_SUPPORTED,
  ErrorCode.TAP_TO_PAY_LIBRARY_NOT_INCLUDED,
] as const;

type PaymentOutcome = "approved" | "declined" | "timeout" | "canceled" | null;

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

/**
 * Dev-only: Terminal “internet” simulated reader — same Stripe payment steps (PI → collect → process) but not Tap to Pay / NFC / Apple.
 * Set EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED=1 and restart Metro. https://docs.stripe.com/terminal/references/testing
 */
const USE_SIMULATED_TERMINAL_READER =
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  (process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === "1" ||
    process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === "true");

/** Visa test PAN for Terminal simulator (card_present). */
const SIMULATED_TERMINAL_CARD_PAN = "4242424242424242";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Dev-only: Stripe decline reasons live under apiError / lastPaymentError — surface them in Metro. */
function logTerminalError(label: string, err: StripeError | undefined) {
  if (!__DEV__ || !err) return;
  console.log(`[Pay] ${label}`, {
    code: err.code,
    message: err.message,
    nativeErrorCode: err.nativeErrorCode,
    apiError: err.apiError,
    underlyingError: err.underlyingError,
  });
}

function logPaymentIntentStep(label: string, pi: { id?: string; status?: string } | undefined) {
  if (!__DEV__ || !pi) return;
  console.log(`[Pay] ${label}`, { id: pi.id, status: pi.status });
}

/** Shown on the result card when Stripe gives a known decline code. */
function userFacingDeclineDetail(err: StripeError | undefined): string | null {
  const dc = err?.apiError?.declineCode;
  if (dc === "test_mode_live_card") {
    return "Test mode can’t charge a real card. Use a Stripe physical test card on this phone, or switch to live mode for real cards.";
  }
  return null;
}

/** User-facing copy for Stripe Terminal reader display messages during collect. */
function readerDisplayMessageLabel(message: Reader.DisplayMessage): string {
  const labels: Record<Reader.DisplayMessage, string> = {
    insertCard: "Insert card",
    insertOrSwipeCard: "Insert or swipe card",
    multipleContactlessCardsDetected: "Multiple cards detected — use one card",
    removeCard: "Remove card",
    retryCard: "Try the card again",
    swipeCard: "Swipe card",
    tryAnotherCard: "Try another card",
    tryAnotherReadMethod: "Try another way to pay",
    checkMobileDevice: "Check this device",
    cardRemovedTooEarly: "Card removed too soon",
  };
  return labels[message] ?? "Processing…";
}

function PayScreenInner() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    amount?: string;
    currency?: string;
    groupId?: string;
    payerMemberId?: string;
    receiverMemberId?: string;
  }>();
  const apiFetch = useApiFetch();
  const [amount, setAmount] = useState(params.amount ?? "");
  const [connecting, setConnecting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [lastPayment, setLastPayment] = useState<string | null>(null);
  const [discoveredReaders, setDiscoveredReaders] = useState<Reader.Type[]>([]);
  const [paymentOutcome, setPaymentOutcome] = useState<PaymentOutcome>(null);
  const [lastOutcomeAmount, setLastOutcomeAmount] = useState<number | null>(null);
  type Phase = "idle" | "initializing" | "collecting" | "processing";
  const [paymentPhase, setPaymentPhase] = useState<Phase>("idle");
  const autoConnectAttempted = useRef(false);
  const readersRef = useRef<Reader.Type[]>([]);
  const connectedReaderRef = useRef<Reader.Type | null>(null);
  const collectingRef = useRef(false);
  const connectingRef = useRef(false);
  const [readerPrepVisible, setReaderPrepVisible] = useState(false);
  const [readerPrepMessage, setReaderPrepMessage] = useState("Preparing Tap to Pay…");
  const [ttpSoftwareUpdate, setTtpSoftwareUpdate] = useState(false);
  const [lastDirectPayout, setLastDirectPayout] = useState<boolean | null>(null);
  const [receiverPayoutsEnabled, setReceiverPayoutsEnabled] = useState<boolean | null>(null);
  /** True after discoverReaders returns iOS entitlement / signing errors (2900, UNSUPPORTED_OPERATION). */
  const [tapToPayEntitlementHint, setTapToPayEntitlementHint] = useState(false);
  const lastTapToPayDiscoverErrorRef = useRef<StripeError | undefined>(undefined);

  useEffect(() => {
    readersRef.current = discoveredReaders;
  }, [discoveredReaders]);

  const {
    initialize,
    discoverReaders,
    cancelDiscovering,
    connectReader,
    disconnectReader,
    isInitialized,
    connectedReader,
    collectPaymentMethod,
    processPaymentIntent,
    retrievePaymentIntent,
    setSimulatedCard,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => setDiscoveredReaders(readers),
    onDidDisconnect: () => {
      setConnecting(false);
      setTtpSoftwareUpdate(false);
      setReaderPrepVisible(false);
      Alert.alert(
        "Disconnected",
        USE_SIMULATED_TERMINAL_READER ? "Simulated reader disconnected." : "Tap to Pay reader disconnected."
      );
    },
    onDidReportReaderSoftwareUpdateProgress: (progress) => {
      setReaderPrepVisible(true);
      setReaderPrepMessage(progress);
    },
    onDidStartInstallingUpdate: () => {
      setTtpSoftwareUpdate(true);
      setReaderPrepVisible(true);
      setReaderPrepMessage("Updating Tap to Pay on iPhone…");
    },
    onDidFinishInstallingUpdate: () => {
      setTtpSoftwareUpdate(false);
      setReaderPrepVisible(false);
      setReaderPrepMessage("Preparing Tap to Pay…");
    },
    onDidAcceptTermsOfService: () => {
      router.push("/(tabs)/tap-to-pay-education?fromTerms=1");
    },
    onDidRequestReaderDisplayMessage: (message) => {
      if (collectingRef.current) {
        setReaderPrepVisible(true);
        setReaderPrepMessage(readerDisplayMessageLabel(message));
      }
      if (__DEV__) console.log("[Pay] reader display message:", message);
    },
    onDidRequestReaderInput: (options) => {
      if (__DEV__) console.log("[Pay] reader input options:", options);
    },
  });

  useEffect(() => {
    connectedReaderRef.current = connectedReader ?? null;
  }, [connectedReader]);

  useEffect(() => {
    if (connectedReader) {
      setTapToPayEntitlementHint(false);
      lastTapToPayDiscoverErrorRef.current = undefined;
    }
  }, [connectedReader]);

  useEffect(() => {
    collectingRef.current = collecting;
  }, [collecting]);

  useEffect(() => {
    connectingRef.current = connecting;
  }, [connecting]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(initialize()).catch((e) => {
      if (!cancelled && __DEV__) console.warn("[Pay] Stripe init failed", e);
    });
    return () => { cancelled = true; };
  }, [initialize]);

  useEffect(() => {
    if (params.amount) setAmount(params.amount);
  }, [params.amount]);

  // Check if the receiver has Stripe Connect set up (for the payout note)
  useEffect(() => {
    if (!params.receiverMemberId) { setReceiverPayoutsEnabled(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `/api/stripe/connect/receiver-status?receiverMemberId=${params.receiverMemberId}`
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setReceiverPayoutsEnabled((data as { payoutsEnabled?: boolean }).payoutsEnabled ?? false);
        }
      } catch {
        // Non-critical — don't block the payment
      }
    })();
    return () => { cancelled = true; };
  }, [params.receiverMemberId, apiFetch]);

  const lockedAmount = Math.round((parseFloat(amount) || 0) * 100) / 100;
  const hasPrefilledCheckout = Boolean(params.amount) && lockedAmount > 0;

  const prefetchedPi = useRef<{ clientSecret: string; directPayout: boolean; paymentIntentId: string } | null>(null);
  const prefetchingPi = useRef(false);

  useEffect(() => {
    if (!hasPrefilledCheckout || prefetchingPi.current || lockedAmount <= 0) return;
    prefetchingPi.current = true;
    (async () => {
      try {
        const body: Record<string, unknown> = { amount: lockedAmount };
        if (params.currency) body.currency = params.currency;
        if (params.groupId && params.payerMemberId && params.receiverMemberId) {
          body.groupId = params.groupId;
          body.payerMemberId = params.payerMemberId;
          body.receiverMemberId = params.receiverMemberId;
        }
        const res = await apiFetch("/api/stripe/terminal/create-payment-intent", {
          method: "POST",
          body,
        });
        if (res.ok) {
          const data = await res.json();
          prefetchedPi.current = {
            clientSecret: data.clientSecret,
            directPayout: data.directPayout === true,
            paymentIntentId: data.paymentIntentId,
          };
          if (__DEV__) console.log("[Pay] PaymentIntent pre-created:", data.paymentIntentId);
        }
      } catch {
        // Will be created on-demand when user taps Charge
      }
    })();
  }, [hasPrefilledCheckout, lockedAmount, params.groupId, params.payerMemberId, params.receiverMemberId, apiFetch]);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, []);

  /** One discovery at a time; skip when reader connected or payment in progress (avoids READER_BUSY). */
  const warmDiscoverReaders = useCallback(async () => {
    if (!isInitialized) return;
    if (connectedReaderRef.current) return;
    if (collectingRef.current || connectingRef.current) return;
    await cancelDiscovering().catch(() => {});
    const out = await discoverReaders(
      USE_SIMULATED_TERMINAL_READER
        ? { discoveryMethod: "internet", simulated: true }
        : { discoveryMethod: "tapToPay" }
    );
    if (out?.error) {
      lastTapToPayDiscoverErrorRef.current = out.error;
      if (isLikelyTapToPayEntitlementOrSigningError(out.error)) {
        setTapToPayEntitlementHint(true);
      }
      if (__DEV__) {
        console.warn("[Pay] discoverReaders", out.error);
      }
    }
  }, [isInitialized, discoverReaders, cancelDiscovering]);

  // Reader warm-up: discover at launch (checklist 1.5). Re-run if user disconnects.
  useEffect(() => {
    if (!hasPrefilledCheckout) return;
    if (!isInitialized) return;
    void warmDiscoverReaders();
  }, [hasPrefilledCheckout, isInitialized, connectedReader, warmDiscoverReaders]);

  // Foreground: debounce so we don't overlap mount discovery (common READER_BUSY cause).
  useEffect(() => {
    if (!hasPrefilledCheckout) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !isInitialized) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        void warmDiscoverReaders();
      }, 500);
    });
    return () => {
      sub.remove();
      clearTimeout(debounce);
    };
  }, [hasPrefilledCheckout, isInitialized, warmDiscoverReaders]);

  useEffect(() => {
    autoConnectAttempted.current = false;
  }, [params.amount, params.groupId, params.payerMemberId, params.receiverMemberId]);

  useEffect(() => {
    if (connectedReader && !ttpSoftwareUpdate) {
      setReaderPrepVisible(false);
    }
  }, [connectedReader, ttpSoftwareUpdate]);

  const ensureTerminalReader = useCallback(async (): Promise<Reader.Type | null> => {
    if (!isInitialized) return null;
    if (readersRef.current[0]) return readersRef.current[0];
    await cancelDiscovering().catch(() => {});
    const discovered = await discoverReaders(
      USE_SIMULATED_TERMINAL_READER
        ? { discoveryMethod: "internet", simulated: true }
        : { discoveryMethod: "tapToPay" }
    );
    if (discovered.error) {
      lastTapToPayDiscoverErrorRef.current = discovered.error;
      if (isLikelyTapToPayEntitlementOrSigningError(discovered.error)) {
        setTapToPayEntitlementHint(true);
      }
      if (__DEV__) {
        console.warn("[Pay] discoverReaders", discovered.error);
      }
    }
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const r = readersRef.current[0];
      if (r) return r;
      await new Promise((res) => setTimeout(res, 200));
    }
    return readersRef.current[0] ?? null;
  }, [isInitialized, discoverReaders, cancelDiscovering]);

  const connectTapToPay = useCallback(async () => {
    if (!isInitialized) {
      Alert.alert(
        "One moment",
        USE_SIMULATED_TERMINAL_READER
          ? "Terminal is still starting up. Try again in a second."
          : "Tap to Pay is still starting up. Try again in a second."
      );
      return;
    }

    setConnecting(true);
    setReaderPrepVisible(true);
    setReaderPrepMessage(
      USE_SIMULATED_TERMINAL_READER ? "Preparing simulated reader…" : "Preparing Tap to Pay…"
    );

    try {
      const reader = await ensureTerminalReader();
      if (!reader) {
        setReaderPrepVisible(false);
        const discErr = lastTapToPayDiscoverErrorRef.current;
        const entitlement = !USE_SIMULATED_TERMINAL_READER && isLikelyTapToPayEntitlementOrSigningError(discErr);
        Alert.alert(
          entitlement ? "Tap to Pay not in this build" : "No reader",
          entitlement
            ? "This install was likely built without the iOS Tap to Pay entitlement. Set ENABLE_TAP_TO_PAY_IOS=true when you run prebuild/build, do a clean native rebuild, and sign with a profile that includes Tap to Pay for this bundle ID. See docs/TAP_TO_PAY_BUILD.md."
            : USE_SIMULATED_TERMINAL_READER
              ? "Could not start the simulated Terminal reader. Use test mode keys, check Metro logs, and restart the app after enabling EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED."
              : "Tap to Pay isn’t available on this device yet. Use an iPhone XS or newer with a current iOS version, or try again in a moment."
        );
        return;
      }

      if (USE_SIMULATED_TERMINAL_READER) {
        const connectResult = await connectReader({
          discoveryMethod: "internet",
          reader,
        });
        if (connectResult.error) {
          setReaderPrepVisible(false);
          Alert.alert(
            "Connection failed",
            connectResult.error.message ?? "Could not connect simulated reader"
          );
        }
        return;
      }

      const locRes = await apiFetch("/api/stripe/terminal/location");
      if (!locRes.ok) {
        const errData = await locRes.json().catch(() => ({}));
        setReaderPrepVisible(false);
        Alert.alert("Error", errData.error ?? "Could not get Terminal location");
        return;
      }
      const locData = await locRes.json();
      const locationId = locData.locationId;

      if (!locationId) {
        setReaderPrepVisible(false);
        Alert.alert("Error", "Could not get Terminal location. Ensure Stripe is configured.");
        return;
      }

      const connectResult = await connectReader({
        discoveryMethod: "tapToPay",
        reader,
        locationId,
        autoReconnectOnUnexpectedDisconnect: true,
      });

      if (connectResult.error) {
        setReaderPrepVisible(false);
        const code = connectResult.error.code;
        if (isLikelyTapToPayEntitlementOrSigningError(connectResult.error)) {
          setTapToPayEntitlementHint(true);
          Alert.alert(
            "Tap to Pay not in this build",
            "This install was likely built without the iOS Tap to Pay entitlement. Set ENABLE_TAP_TO_PAY_IOS=true when you prebuild/build, clean rebuild, and use a provisioning profile that includes Tap to Pay. See docs/TAP_TO_PAY_BUILD.md."
          );
        } else if (UNSUPPORTED_DEVICE_CODES.includes(code as (typeof UNSUPPORTED_DEVICE_CODES)[number])) {
          Alert.alert(
            "Update required",
            "Tap to Pay requires a compatible device and the latest iOS. Please update your iPhone to the latest version."
          );
        } else {
          Alert.alert("Connection failed", connectResult.error.message ?? "Could not connect");
        }
      }
    } catch (e) {
      setReaderPrepVisible(false);
      Alert.alert("Error", e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, [isInitialized, ensureTerminalReader, connectReader, apiFetch]);

  const disconnect = useCallback(async () => {
    await disconnectReader();
  }, [disconnectReader]);

  const shareReceipt = useCallback(
    async (outcome: "approved" | "declined" | "timeout", amt: number) => {
      const status =
        outcome === "approved" ? "Approved" : outcome === "declined" ? "Declined" : "Timed out";
      const message = `Tap to Pay receipt: $${amt.toFixed(2)} — ${status}`;
      try {
        await Share.share({ message, title: "Payment receipt" });
      } catch {
        // User cancelled share
      }
    },
    []
  );

  const collectPayment = useCallback(async () => {
    const amt = Math.round(parseFloat(amount) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert("Invalid amount", "Enter a valid amount to collect");
      return;
    }

    if (!connectedReader) {
      Alert.alert("Not connected", "Connect to Tap to Pay first");
      return;
    }

    setCollecting(true);
    setPaymentOutcome(null);
    setPaymentPhase("initializing");
    try {
      let clientSecret: string | undefined;
      let directPayout = false;

      const cached = prefetchedPi.current;
      prefetchedPi.current = null;

      if (cached) {
        clientSecret = cached.clientSecret;
        directPayout = cached.directPayout;
        if (__DEV__) console.log("[Pay] Using pre-fetched PaymentIntent:", cached.paymentIntentId);
      } else {
        const body: Record<string, unknown> = { amount: amt };
        if (params.currency) body.currency = params.currency;
        if (params.groupId && params.payerMemberId && params.receiverMemberId) {
          body.groupId = params.groupId;
          body.payerMemberId = params.payerMemberId;
          body.receiverMemberId = params.receiverMemberId;
        }
        const piRes = await apiFetch("/api/stripe/terminal/create-payment-intent", {
          method: "POST",
          body,
        });
        if (!piRes.ok) {
          const errData = await piRes.json().catch(() => ({}));
          Alert.alert("Error", errData.error ?? "Failed to create payment intent");
          setCollecting(false);
          return;
        }
        const piData = await piRes.json();
        clientSecret = piData.clientSecret;
        directPayout = piData.directPayout === true;
        if (__DEV__ && piData.paymentIntentId) {
          console.log("[Pay] PaymentIntent created on-demand:", piData.paymentIntentId);
        }
      }

      setLastDirectPayout(directPayout);
      if (__DEV__) console.log("[Pay] directPayout:", directPayout);

      if (!clientSecret) {
        Alert.alert("Error", "Failed to create payment intent");
        setCollecting(false);
        return;
      }

      const retrieveResult = await retrievePaymentIntent(clientSecret);
      if (retrieveResult.error || !retrieveResult.paymentIntent) {
        logTerminalError("retrievePaymentIntent failed", retrieveResult.error);
        Alert.alert("Error", retrieveResult.error?.message ?? "Could not load payment");
        setCollecting(false);
        return;
      }
      logPaymentIntentStep("after retrieve", retrieveResult.paymentIntent);

      setPaymentPhase("collecting");
      const clientSecretForCollect = clientSecret;

      const pi = retrieveResult.paymentIntent;

      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (USE_SIMULATED_TERMINAL_READER) {
        const sim = await setSimulatedCard(SIMULATED_TERMINAL_CARD_PAN);
        if (sim.error) {
          logTerminalError("setSimulatedCard failed", sim.error);
          Alert.alert(
            "Simulated card",
            sim.error.message ?? "Could not configure test card for simulated reader."
          );
          setCollecting(false);
          return;
        }
      }
      const collectResult = await collectPaymentMethod({ paymentIntent: pi });

      if (!collectResult) {
        setCollecting(false);
        setPaymentPhase("idle");
        return;
      }

      if (collectResult.error) {
        logTerminalError("collectPaymentMethod failed", collectResult.error);
        if (collectResult.error.code === ErrorCode.CANCELED) {
          setPaymentOutcome("canceled");
          setLastOutcomeAmount(amt);
          setLastPayment("Canceled — hold the card steady until the phone vibrates, then tap Charge again.");
          setReaderPrepVisible(false);
          setCollecting(false);
          return;
        }
        if (collectResult.error.code === ErrorCode.CARD_READ_TIMED_OUT) {
          setPaymentOutcome("timeout");
          setLastOutcomeAmount(amt);
          setLastPayment(`Timed out — $${amt.toFixed(2)}`);
          setCollecting(false);
          return;
        }
        if (
          collectResult.error.code === ErrorCode.DECLINED_BY_STRIPE_API ||
          collectResult.error.code === ErrorCode.DECLINED_BY_READER
        ) {
          const extra = userFacingDeclineDetail(collectResult.error);
          setPaymentOutcome("declined");
          setLastOutcomeAmount(amt);
          setLastPayment(
            extra ? `Declined — $${amt.toFixed(2)}. ${extra}` : `Declined — $${amt.toFixed(2)}`
          );
          setCollecting(false);
          return;
        }
        if (collectResult.error.code === ErrorCode.READER_BUSY) {
          Alert.alert(
            "Reader busy",
            "Tap to Pay is finishing another step. Wait a few seconds, then tap Charge again."
          );
        } else if (UNSUPPORTED_DEVICE_CODES.includes(collectResult.error.code as (typeof UNSUPPORTED_DEVICE_CODES)[number])) {
          Alert.alert(
            "Update required",
            "Please update your iPhone to the latest iOS version to use Tap to Pay."
          );
        } else {
          Alert.alert("Collection failed", collectResult.error.message ?? "Could not collect payment");
        }
        setCollecting(false);
        return;
      }

      if (!collectResult.paymentIntent) {
        setCollecting(false);
        setPaymentPhase("idle");
        return;
      }
      logPaymentIntentStep("after collect", collectResult.paymentIntent);

      setPaymentPhase("processing");
      setReaderPrepVisible(false);
      // Tap to Pay / Stripe often need a beat after collect before process; READER_BUSY is common if we call immediately.
      await sleep(400);

      let processResult = await processPaymentIntent({
        paymentIntent: collectResult.paymentIntent,
      });
      let busyRetries = 0;
      while (processResult.error?.code === ErrorCode.READER_BUSY && busyRetries < 8) {
        busyRetries++;
        await sleep(650);
        processResult = await processPaymentIntent({
          paymentIntent: collectResult.paymentIntent,
        });
      }

      if (processResult.error) {
        logTerminalError("processPaymentIntent failed", processResult.error);
        const code = processResult.error.code;
        if (code === ErrorCode.DECLINED_BY_STRIPE_API || code === ErrorCode.DECLINED_BY_READER) {
          const extra = userFacingDeclineDetail(processResult.error);
          setPaymentOutcome("declined");
          setLastOutcomeAmount(amt);
          setLastPayment(
            extra ? `Declined — $${amt.toFixed(2)}. ${extra}` : `Declined — $${amt.toFixed(2)}`
          );
        } else if (code === ErrorCode.READER_BUSY) {
          Alert.alert(
            "Reader busy",
            "Tap to Pay is still finishing the last step. Wait a few seconds, tap Charge once, or disconnect and reconnect the reader."
          );
        } else {
          Alert.alert("Payment failed", processResult.error.message ?? "Could not process payment");
        }
      } else {
        logPaymentIntentStep("after process (success)", processResult.paymentIntent);

        if (params.groupId && params.payerMemberId && params.receiverMemberId) {
          try {
            const settleRes = await apiFetch("/api/settlements", {
              method: "POST",
              body: {
                groupId: params.groupId,
                payerMemberId: params.payerMemberId,
                receiverMemberId: params.receiverMemberId,
                amount: amt,
                method: "in_person",
                currency: params.currency ?? "USD",
              },
            });
            if (settleRes.ok) {
              if (__DEV__) console.log("[Pay] settlement recorded directly");
            } else {
              const errData = await settleRes.json().catch(() => ({}));
              if (__DEV__) console.warn("[Pay] settlement recording failed:", errData);
            }
          } catch (e) {
            if (__DEV__) console.warn("[Pay] settlement recording error:", e);
          }
        }

        setPaymentOutcome("approved");
        invalidateApiCache("/api/groups/summary");
        invalidateApiCache("/api/groups/person");
        invalidateApiCache("/api/groups/recent-activity");
        DeviceEventEmitter.emit("groups-updated");
        setLastOutcomeAmount(amt);
        setLastPayment(
          directPayout
            ? `Paid $${amt.toFixed(2)} — depositing to recipient's bank`
            : `Paid $${amt.toFixed(2)} successfully`
        );
        setAmount("");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Payment failed");
    } finally {
      setCollecting(false);
      setPaymentPhase("idle");
    }
  }, [
    amount,
    params.groupId,
    params.payerMemberId,
    params.receiverMemberId,
    connectedReader,
    apiFetch,
    retrievePaymentIntent,
    collectPaymentMethod,
    processPaymentIntent,
    setSimulatedCard,
  ]);

  const isConnected = !!connectedReader;

  useEffect(() => {
    if (!hasPrefilledCheckout) return;
    if (!isInitialized || isConnected || connecting || collecting) return;
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    waitForConnectLock().then(() => {
      if (connectedReaderRef.current) return;
      void connectTapToPay();
    });
  }, [hasPrefilledCheckout, isInitialized, isConnected, connecting, collecting, connectTapToPay]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={["top"]}>
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        {!hasPrefilledCheckout ? (
          <>
            <View style={styles.checkoutHeader}>
              <TouchableOpacity onPress={handleClose} style={styles.checkoutHeaderBtn} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.checkoutHeaderTitle, { color: theme.text }]}>Tap to Pay</Text>
              <TouchableOpacity onPress={handleClose} style={styles.checkoutHeaderBtn} hitSlop={10}>
                <Ionicons name="close" size={20} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.gateLead, { color: theme.textSecondary }]}>
              Tap to Pay opens when you collect from an expense, a receipt split, or a friend balance. Add an expense or settle up to charge with your phone.
            </Text>
            {!API_URL && (
              <Text style={[styles.warning, { color: theme.error }]}>
                Set EXPO_PUBLIC_API_URL to your deployed web app URL.
              </Text>
            )}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary, marginTop: 20 }]}
              onPress={() => router.push("/(tabs)/add-expense")}
              activeOpacity={0.9}
            >
              <Text style={styles.buttonText}>Add an expense</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.gateSecondary} onPress={handleClose} hitSlop={12}>
              <Text style={[styles.gateSecondaryText, { color: theme.primary }]}>Go back</Text>
            </TouchableOpacity>
            <Text style={[styles.hint, { color: theme.textQuaternary, marginTop: 24 }]}>
              Tap to Pay does not work in Expo Go. Run{" "}
              <Text style={[styles.hintCode, { backgroundColor: theme.surfaceTertiary }]}>expo run:ios</Text> or{" "}
              <Text style={[styles.hintCode, { backgroundColor: theme.surfaceTertiary }]}>expo run:android</Text> to
              build with native Stripe support.{"\n"}iOS: iPhone XS or later. Android: NFC device, API 26+.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.checkoutHeader}>
              <TouchableOpacity onPress={handleClose} style={styles.checkoutHeaderBtn} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.checkoutHeaderTitle, { color: theme.text }]}>Tap to Pay</Text>
              <TouchableOpacity onPress={handleClose} style={styles.checkoutHeaderBtn} hitSlop={10}>
                <Ionicons name="close" size={20} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            {!API_URL && (
              <Text style={[styles.warning, { color: theme.error }]}>
                Set EXPO_PUBLIC_API_URL to your deployed web app URL.
              </Text>
            )}

            {USE_SIMULATED_TERMINAL_READER ? (
              <Text
                style={[
                  styles.warning,
                  { color: theme.textSecondary, backgroundColor: theme.primaryLight, padding: 12, borderRadius: 12 },
                ]}
              >
                Dev: Stripe internet simulator only — tests your API + PaymentIntent + collect/process. It does not
                exercise Tap to Pay on iPhone (Apple/NFC). For real TTP, use sk_test + a Stripe physical test card.
              </Text>
            ) : null}

            <View style={[styles.checkoutCard, { backgroundColor: theme.primaryLight, borderColor: theme.border }]}>
          <Text style={[styles.checkoutAmount, { color: theme.text }]}>${lockedAmount.toFixed(2)}</Text>
          <Text style={[styles.checkoutSub, { color: theme.textTertiary }]}>
            {USE_SIMULATED_TERMINAL_READER
              ? isConnected
                ? "Simulated reader ready — tap Charge (no physical card)."
                : "Preparing simulated reader…"
              : isConnected
                ? "Reader connected. Hold phone near card."
                : "Preparing Tap to Pay reader..."}
          </Text>
          {tapToPayEntitlementHint && !USE_SIMULATED_TERMINAL_READER && Platform.OS === "ios" ? (
            <Text style={[styles.entitlementHint, { color: theme.textSecondary }]}>
              This build may be missing the Tap to Pay entitlement (Apple error 2900). Set{" "}
              <Text style={[styles.hintCode, { backgroundColor: theme.surfaceTertiary }]}>ENABLE_TAP_TO_PAY_IOS=true</Text>{" "}
              when you prebuild, run a clean native rebuild, and sign with a profile that includes Tap to Pay for your
              bundle ID.
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={() => {
              if (collecting || connecting) return;
              if (!isInitialized) {
                Alert.alert(
                  "One moment",
                  USE_SIMULATED_TERMINAL_READER
                    ? "Terminal is still starting up. Try again in a second."
                    : "Tap to Pay is still starting up. Try again in a second."
                );
                return;
              }
              if (isConnected) void collectPayment();
              else void connectTapToPay();
            }}
            disabled={collecting || connecting}
          >
            {collecting || connecting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={styles.buttonContent}>
                <TapToPayButtonIcon color="#fff" size={22} />
                <Text style={styles.buttonText}>
                  {isConnected
                    ? `Charge $${lockedAmount.toFixed(2)}`
                    : USE_SIMULATED_TERMINAL_READER
                      ? "Connect simulated reader"
                      : "Pay with Tap to Pay on iPhone"}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {isConnected && receiverPayoutsEnabled === false && hasPrefilledCheckout ? (
            <Text style={[styles.payoutNote, { color: theme.textQuaternary }]}>
              Recipient hasn't set up payments yet — balance will be recorded but funds won't transfer to their bank.
            </Text>
          ) : null}
          {isConnected ? (
            <TouchableOpacity style={styles.checkoutLink} onPress={disconnect}>
              <Text style={[styles.checkoutLinkText, { color: theme.textTertiary }]}>Disconnect reader</Text>
            </TouchableOpacity>
          ) : null}
        </View>

            {/* Reader prep / software update progress (Apple checklist 3.9.1 — PSP equivalent) */}
      {readerPrepVisible && (
        <View style={[styles.overlay, { zIndex: 150 }]}>
          <View style={[styles.overlayCard, { maxWidth: 320 }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.overlayTitle, { textAlign: "center" }]}>
              {ttpSoftwareUpdate ? "Configuring Tap to Pay" : "Preparing Tap to Pay"}
            </Text>
            <Text style={[styles.overlaySubtitle, { color: theme.textSecondary }]}>
              {readerPrepMessage}
            </Text>
            <Text style={[styles.overlayHint, { color: theme.textQuaternary }]}>
              Tap to Pay may be unavailable until setup finishes.
            </Text>
          </View>
        </View>
      )}

      {/* 5.7 Initializing / 5.8 Processing overlay */}
      {collecting && paymentPhase !== "idle" && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.overlayTitle}>
              {paymentPhase === "initializing"
                ? "Initializing…"
                : paymentPhase === "collecting"
                ? "Hold phone near card"
                : "Processing…"}
            </Text>
          </View>
        </View>
      )}

      {/* Full-screen success overlay */}
      {paymentOutcome === "approved" && lastOutcomeAmount != null && (
        <View style={[styles.overlay, { backgroundColor: theme.surface, zIndex: 200 }]}>
          <View style={{ alignItems: "center", gap: 16, paddingHorizontal: 32 }}>
            <Ionicons name="checkmark-circle" size={64} color={theme.positive} />
            <Text style={[styles.overlayTitle, { fontSize: 22 }]}>Payment successful</Text>
            <Text style={[styles.overlaySubtitle, { fontSize: 18, color: theme.text }]}>
              ${lastOutcomeAmount.toFixed(2)}
            </Text>
            {lastPayment ? (
              <Text style={[styles.overlaySubtitle, { color: theme.textSecondary }]}>
                {lastPayment}
              </Text>
            ) : null}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary, marginTop: 20, minWidth: 200 }]}
              onPress={() => {
                setPaymentOutcome(null);
                handleClose();
              }}
            >
              <Text style={styles.buttonText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareReceipt("approved", lastOutcomeAmount)}
            >
              <Ionicons name="share-outline" size={18} color={theme.primary} />
              <Text style={[styles.shareButtonText, { color: theme.primary }]}>Share receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Non-approved outcomes (declined, timeout, canceled) */}
      {lastPayment && paymentOutcome !== "approved" && (
        <View style={[styles.result, { backgroundColor: theme.primaryLight }]}>
          <View style={styles.resultRow}>
            <Ionicons
              name={
                paymentOutcome === "declined"
                  ? "close-circle"
                  : paymentOutcome === "canceled"
                  ? "alert-circle-outline"
                  : "time-outline"
              }
              size={24}
              color={
                paymentOutcome === "declined"
                  ? theme.negative
                  : paymentOutcome === "canceled"
                  ? theme.textTertiary
                  : theme.textQuaternary
              }
            />
            <Text style={[styles.resultLabel, { color: theme.textTertiary }]}>Last result</Text>
          </View>
          <Text style={[styles.resultText, { color: theme.text }]}>{lastPayment}</Text>
          {lastOutcomeAmount != null &&
            (paymentOutcome === "declined" || paymentOutcome === "timeout") && (
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => shareReceipt(paymentOutcome!, lastOutcomeAmount)}
            >
              <Ionicons name="share-outline" size={18} color={theme.primary} />
              <Text style={[styles.shareButtonText, { color: theme.primary }]}>Share receipt</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    fontFamily: font.semibold,
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.textTertiary,
    marginBottom: 24,
  },
  gateLead: {
    fontSize: 16,
    fontFamily: font.regular,
    lineHeight: 24,
    marginTop: 8,
  },
  gateSecondary: {
    alignItems: "center",
    paddingVertical: 12,
  },
  gateSecondaryText: {
    fontSize: 16,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  warning: {
    fontSize: 13,
    fontFamily: font.regular,
    color: colors.red,
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: font.semibold,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    fontSize: 18,
    fontFamily: font.regular,
    color: colors.text,
    marginBottom: 12,
  },
  checkoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  checkoutHeaderBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutHeaderTitle: {
    fontSize: 20,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  checkoutCard: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 24,
  },
  checkoutAmount: {
    fontSize: 42,
    lineHeight: 46,
    fontFamily: font.black,
    letterSpacing: -1.4,
    textAlign: "center",
    marginBottom: 8,
  },
  checkoutSub: {
    fontSize: 14,
    fontFamily: font.medium,
    textAlign: "center",
    marginBottom: 16,
  },
  entitlementHint: {
    fontSize: 12,
    fontFamily: font.regular,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  payoutNote: {
    fontSize: 12,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 8,
    paddingHorizontal: 8,
  },
  checkoutLink: {
    alignItems: "center",
    marginTop: 10,
  },
  checkoutLinkText: {
    fontSize: 13,
    fontFamily: font.medium,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radii.md,
    alignItems: "center",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  disconnectButton: {
    backgroundColor: colors.textTertiary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: font.semibold,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  overlayCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 32,
    alignItems: "center",
    gap: 16,
    minWidth: 200,
  },
  overlayTitle: {
    fontSize: 16,
    fontFamily: font.semibold,
    color: colors.text,
  },
  overlaySubtitle: {
    fontSize: 14,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },
  overlayHint: {
    fontSize: 12,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 17,
    marginTop: 12,
  },
  result: {
    marginTop: 24,
    padding: 16,
    backgroundColor: colors.primaryLight,
    borderRadius: radii.md,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
  },
  shareButtonText: {
    fontSize: 14,
    fontFamily: font.medium,
    color: colors.primary,
  },
  resultLabel: {
    fontSize: 12,
    fontFamily: font.regular,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  resultText: {
    fontSize: 14,
    color: colors.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  hint: {
    fontSize: 12,
    fontFamily: font.regular,
    lineHeight: 18,
    marginTop: 16,
  },
  hintCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
});

export default function PayScreen() {
  const [deferReady, setDeferReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDeferReady(true), 150);
    return () => clearTimeout(t);
  }, []);

  if (!deferReady) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.subtitle, { marginTop: 16 }]}>Loading Tap to Pay…</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <PayScreenInner />
    </ErrorBoundary>
  );
}
