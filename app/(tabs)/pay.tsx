import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import {
  SQIPCore,
  SQIPCardEntry,
  type CardDetails,
} from "react-native-square-in-app-payments";

// Sandbox App ID — replace with your Square Application ID from https://developer.squareup.com/apps
const SQUARE_APP_ID = process.env.EXPO_PUBLIC_SQUARE_APPLICATION_ID || "sandbox-sq0idb-REPLACE_ME";

export default function PayScreen() {
  const [initialized, setInitialized] = useState(false);
  const [lastPayment, setLastPayment] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        SQIPCore.setSquareApplicationId(SQUARE_APP_ID);
        if (Platform.OS === "ios") {
          await SQIPCardEntry.setIOSCardEntryTheme({
            saveButtonFont: { size: 16 },
            saveButtonTitle: "Pay",
            keyboardAppearance: "Light",
          });
        }
        setInitialized(true);
      } catch (e) {
        console.error("Square init error:", e);
        setInitialized(false);
      }
    })();
  }, []);

  const onCardNonceSuccess = useCallback(async (cardDetails: CardDetails) => {
    try {
      // In production: POST nonce to your backend → Payments API
      const nonce = cardDetails.nonce ?? "";
      setLastPayment(`Card nonce received (${nonce.slice(0, 12)}...)`);
      await SQIPCardEntry.completeCardEntry(() => {});
    } catch (e) {
      await SQIPCardEntry.showCardNonceProcessingError(
        e instanceof Error ? e.message : "Payment failed"
      );
    }
  }, []);

  const onCardEntryCancel = useCallback(() => {
    console.log("Card entry cancelled");
  }, []);

  const startCardEntry = useCallback(async () => {
    if (!initialized || SQUARE_APP_ID.includes("REPLACE_ME")) {
      Alert.alert(
        "Setup required",
        "Add EXPO_PUBLIC_SQUARE_APPLICATION_ID to .env and run: npx expo prebuild && npx expo run:ios (or run:android)"
      );
      return;
    }
    try {
      await SQIPCardEntry.startCardEntryFlow(
        { collectPostalCode: false },
        onCardNonceSuccess,
        onCardEntryCancel
      );
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to start card entry");
    }
  }, [initialized, onCardNonceSuccess, onCardEntryCancel]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Square In-App Payments</Text>
      <Text style={styles.subtitle}>Test card entry on device</Text>

      <TouchableOpacity
        style={[styles.button, !initialized && styles.buttonDisabled]}
        onPress={startCardEntry}
        disabled={!initialized}
      >
        <Text style={styles.buttonText}>
          {initialized ? "Enter card" : "Initializing…"}
        </Text>
      </TouchableOpacity>

      {lastPayment && (
        <View style={styles.result}>
          <Text style={styles.resultLabel}>Last result</Text>
          <Text style={styles.resultText}>{lastPayment}</Text>
        </View>
      )}

      <Text style={styles.hint}>
        Use a development build (expo run:ios / expo run:android). Expo Go does
        not include native Square SDK.
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
  button: {
    backgroundColor: "#3D8E62",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
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
