import { useState, useEffect, useCallback } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StripeTerminalProvider, useStripeTerminal } from "@stripe/stripe-terminal-react-native";
import type { Reader } from "@stripe/stripe-terminal-react-native";
import { ErrorCode } from "@stripe/stripe-terminal-react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { useApiFetch } from "../../lib/api";
import { colors, font, fontSize, shadow, radii, space } from "../../lib/theme";

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

type PaymentOutcome = "approved" | "declined" | "timeout" | null;

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

function PayScreenInner() {
  const params = useLocalSearchParams<{
    amount?: string;
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

  const {
    initialize,
    discoverReaders,
    connectReader,
    disconnectReader,
    isInitialized,
    connectedReader,
    collectPaymentMethod,
    processPaymentIntent,
    retrievePaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => setDiscoveredReaders(readers),
    onDidDisconnect: () => {
      setConnecting(false);
      Alert.alert("Disconnected", "Tap to Pay reader disconnected.");
    },
  });

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (params.amount) setAmount(params.amount);
  }, [params.amount]);

  // Reader warm-up: discover at launch and when app returns to foreground (checklist 1.5)
  useEffect(() => {
    if (!isInitialized) return;
    discoverReaders({ discoveryMethod: "tapToPay" });
  }, [isInitialized, discoverReaders]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isInitialized) {
        discoverReaders({ discoveryMethod: "tapToPay" });
      }
    });
    return () => sub.remove();
  }, [isInitialized, discoverReaders]);

  const connectTapToPay = useCallback(async () => {
    if (!isInitialized) return;

    const reader = discoveredReaders[0];
    if (!reader) {
      Alert.alert(
        "No reader",
        "Tap to Pay not available. Requires compatible iPhone (XS+) or Android with NFC."
      );
      return;
    }

    setConnecting(true);
    try {
      const locRes = await apiFetch("/api/stripe/terminal/location");
      if (!locRes.ok) {
        const errData = await locRes.json().catch(() => ({}));
        Alert.alert("Error", errData.error ?? "Could not get Terminal location");
        setConnecting(false);
        return;
      }
      const locData = await locRes.json();
      const locationId = locData.locationId;

      if (!locationId) {
        Alert.alert("Error", "Could not get Terminal location. Ensure Stripe is configured.");
        setConnecting(false);
        return;
      }

      const connectResult = await connectReader({
        discoveryMethod: "tapToPay",
        reader,
        locationId,
        autoReconnectOnUnexpectedDisconnect: true,
      });

      if (connectResult.error) {
        const code = connectResult.error.code;
        if (UNSUPPORTED_DEVICE_CODES.includes(code as (typeof UNSUPPORTED_DEVICE_CODES)[number])) {
          Alert.alert(
            "Update required",
            "Tap to Pay requires a compatible device and the latest iOS. Please update your iPhone to the latest version."
          );
        } else {
          Alert.alert("Connection failed", connectResult.error.message ?? "Could not connect");
        }
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, [isInitialized, discoveredReaders, connectReader, apiFetch]);

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
    const amt = parseFloat(amount);
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
      // 5.7 Initializing
      const body: Record<string, unknown> = { amount: amt };
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
      const clientSecret = piData.clientSecret;

      if (!clientSecret) {
        Alert.alert("Error", piData.error ?? "Failed to create payment intent");
        setCollecting(false);
        return;
      }

      const retrieveResult = await retrievePaymentIntent(clientSecret);
      if (retrieveResult.error || !retrieveResult.paymentIntent) {
        Alert.alert("Error", retrieveResult.error?.message ?? "Could not load payment");
        setCollecting(false);
        return;
      }

      setPaymentPhase("collecting");
      const collectResult = await collectPaymentMethod({
        paymentIntent: retrieveResult.paymentIntent,
      });
      if (collectResult.error) {
        if (collectResult.error.code === ErrorCode.CANCELED) {
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
          setPaymentOutcome("declined");
          setLastOutcomeAmount(amt);
          setLastPayment(`Declined — $${amt.toFixed(2)}`);
          setCollecting(false);
          return;
        }
        if (UNSUPPORTED_DEVICE_CODES.includes(collectResult.error.code as (typeof UNSUPPORTED_DEVICE_CODES)[number])) {
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

      setPaymentPhase("processing");
      const processResult = await processPaymentIntent({
        paymentIntent: collectResult.paymentIntent,
      });
      if (processResult.error) {
        const code = processResult.error.code;
        if (code === ErrorCode.DECLINED_BY_STRIPE_API || code === ErrorCode.DECLINED_BY_READER) {
          setPaymentOutcome("declined");
          setLastOutcomeAmount(amt);
          setLastPayment(`Declined — $${amt.toFixed(2)}`);
        } else {
          Alert.alert("Payment failed", processResult.error.message ?? "Could not process payment");
        }
      } else {
        setPaymentOutcome("approved");
        setLastOutcomeAmount(amt);
        setLastPayment(`Paid $${amt.toFixed(2)} successfully`);
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
  ]);

  const isConnected = !!connectedReader;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <View style={styles.container}>
      <Text style={styles.title}>Tap to Pay</Text>
      <Text style={styles.subtitle}>
        Accept contactless payments with your phone. No reader required.
      </Text>

      {!API_URL && (
        <Text style={styles.warning}>
          Set EXPO_PUBLIC_API_URL to your deployed web app URL.
        </Text>
      )}

      {/* Connect / Disconnect */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Reader: {isConnected ? "Connected" : "Not connected"}
        </Text>
        {isConnected ? (
          <TouchableOpacity
            style={[styles.button, styles.disconnectButton]}
            onPress={disconnect}
            disabled={connecting}
          >
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, connecting && styles.buttonDisabled]}
            onPress={connectTapToPay}
            disabled={connecting || !isInitialized || discoveredReaders.length === 0}
          >
            {connecting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {!isInitialized
                  ? "Initializing…"
                  : discoveredReaders.length === 0
                  ? "Tap to Pay not available"
                  : "Connect Tap to Pay"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Amount & Collect */}
      {isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amount ($)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            editable={!collecting}
          />
          <TouchableOpacity
            style={[
              styles.button,
              (!amount || parseFloat(amount) <= 0 || collecting) && styles.buttonDisabled,
            ]}
            onPress={collectPayment}
            disabled={!amount || parseFloat(amount) <= 0 || collecting}
          >
            {collecting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={styles.buttonContent}>
                <Ionicons name="hardware-chip-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Collect payment</Text>
              </View>
            )}
          </TouchableOpacity>
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

      {/* 5.9 Outcome + 5.10 Share receipt */}
      {lastPayment && (
        <View style={styles.result}>
          <View style={styles.resultRow}>
            <Ionicons
              name={
                paymentOutcome === "approved"
                  ? "checkmark-circle"
                  : paymentOutcome === "declined"
                  ? "close-circle"
                  : "time-outline"
              }
              size={24}
              color={
                paymentOutcome === "approved"
                  ? colors.green
                  : paymentOutcome === "declined"
                  ? colors.red
                  : colors.amber
              }
            />
            <Text style={styles.resultLabel}>Last result</Text>
          </View>
          <Text style={styles.resultText}>{lastPayment}</Text>
          {lastOutcomeAmount != null && (
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() =>
                paymentOutcome && shareReceipt(paymentOutcome, lastOutcomeAmount)
              }
            >
              <Ionicons name="share-outline" size={18} color={colors.primary} />
              <Text style={styles.shareButtonText}>Share receipt</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.hint}>
        Tap to Pay does not work in Expo Go. Run{" "}
        <Text style={styles.hintCode}>expo run:ios</Text> or{" "}
        <Text style={styles.hintCode}>expo run:android</Text> to build with native Stripe support.
        {"\n"}iOS: iPhone XS or later. Android: NFC device, API 26+.
      </Text>
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
    marginTop: 24,
    fontSize: 12,
    fontFamily: font.regular,
    color: colors.textMuted,
    lineHeight: 18,
  },
  hintCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    backgroundColor: colors.borderLight,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
});

export default function PayScreen() {
  const { getToken } = useAuth();

  const fetchConnectionToken = useCallback(async () => {
    let token: string | null = null;
    for (let i = 0; i < 4; i++) {
      token = await getToken({ skipCache: i > 0 });
      if (token) break;
      if (i < 3) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/api/stripe/terminal/connection-token`, {
      method: "POST",
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to get connection token");
    return data.secret;
  }, [getToken]);

  return (
    <StripeTerminalProvider logLevel="error" tokenProvider={fetchConnectionToken}>
      <PayScreenInner />
    </StripeTerminalProvider>
  );
}
