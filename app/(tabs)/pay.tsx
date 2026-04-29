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
} from "react-native";
import { useStripeTerminal } from "@stripe/stripe-terminal-react-native";
import type { Reader } from "@stripe/stripe-terminal-react-native";
import { ErrorCode } from "@stripe/stripe-terminal-react-native";
import { useLocalSearchParams } from "expo-router";
import { useApiFetch } from "../../lib/api";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export default function PayScreen() {
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

  useEffect(() => {
    if (!isInitialized) return;
    discoverReaders({ discoveryMethod: "tapToPay" });
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
        Alert.alert("Error", (errData as { error?: string }).error ?? "Could not get Terminal location. Ensure Stripe is configured.");
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
        Alert.alert("Connection failed", connectResult.error.message ?? "Could not connect");
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
    try {
      const body: Record<string, unknown> = { amount: Math.round(amt * 100) };
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
        Alert.alert("Error", (errData as { error?: string }).error ?? "Failed to create payment intent");
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

      const collectResult = await collectPaymentMethod({
        paymentIntent: retrieveResult.paymentIntent,
      });
      if (collectResult.error) {
        if (collectResult.error.code === ErrorCode.CANCELED) {
          setCollecting(false);
          return;
        }
        Alert.alert("Collection failed", collectResult.error.message ?? "Could not collect payment");
        setCollecting(false);
        return;
      }

      if (!collectResult.paymentIntent) {
        setCollecting(false);
        return;
      }

      const processResult = await processPaymentIntent({
        paymentIntent: collectResult.paymentIntent,
      });
      if (processResult.error) {
        Alert.alert("Payment failed", processResult.error.message ?? "Could not process payment");
      } else {
        setLastPayment(`Paid $${amt.toFixed(2)} successfully`);
        setAmount("");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Payment failed");
    } finally {
      setCollecting(false);
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
            placeholderTextColor="#9CA3AF"
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
              <Text style={styles.buttonText}>Collect payment</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {lastPayment && (
        <View style={styles.result}>
          <Text style={styles.resultLabel}>Last result</Text>
          <Text style={styles.resultText}>{lastPayment}</Text>
        </View>
      )}

      <Text style={styles.hint}>
        Requires a development build (expo run:ios / expo run:android). iOS: iPhone XS or later.
        Android: NFC device, API 26+.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    marginBottom: 24,
  },
  warning: {
    fontSize: 13,
    color: "#DC2626",
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    color: "#1F2937",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#3D8E62",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  disconnectButton: {
    backgroundColor: "#6B7280",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  result: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#EEF7F2",
    borderRadius: 12,
  },
  resultLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  resultText: {
    fontSize: 14,
    color: "#1F2937",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  hint: {
    marginTop: 24,
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 18,
  },
});
