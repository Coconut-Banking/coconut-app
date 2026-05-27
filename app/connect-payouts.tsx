import { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ConnectPayouts } from "@stripe/stripe-react-native";
import { ConnectEmbeddedProvider } from "../components/stripe/ConnectEmbeddedProvider";
import { invalidateApiCache, useApiFetch } from "../lib/api";
import { canUseStripeConnectEmbedded } from "../lib/stripe-connect-embedded";
import { openHostedConnectCashOut } from "../lib/stripe-connect-actions";
import { useTheme } from "../lib/theme-context";
import { font } from "../lib/theme";
import { useEffect } from "react";

/**
 * In-app cash out / payout management via Stripe Connect embedded Payouts.
 */
export default function ConnectPayoutsScreen() {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();

  useEffect(() => {
    if (!canUseStripeConnectEmbedded()) {
      void openHostedConnectCashOut(apiFetch).finally(() => {
        if (router.canGoBack()) router.back();
      });
    }
  }, [apiFetch]);

  const handleClose = useCallback(() => {
    invalidateApiCache("/api/stripe/wallet");
    invalidateApiCache("/api/stripe/connect/status");
    DeviceEventEmitter.emit("groups-updated");
    if (router.canGoBack()) router.back();
  }, []);

  const handleLoadError = useCallback(
    (event: { error?: { message?: string } }) => {
      Alert.alert(
        "Payouts unavailable",
        event.error?.message ?? "Could not load in-app payouts.",
        [
          {
            text: "Open in browser",
            onPress: () => {
              void openHostedConnectCashOut(apiFetch).finally(handleClose);
            },
          },
          { text: "Close", style: "cancel", onPress: handleClose },
        ],
      );
    },
    [apiFetch, handleClose],
  );

  if (!canUseStripeConnectEmbedded()) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={["top"]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Cash out</Text>
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={theme.text} />
        </Pressable>
      </View>
      <ConnectEmbeddedProvider mode="payouts">
        <ConnectPayouts style={styles.payouts} onLoadError={handleLoadError} />
      </ConnectEmbeddedProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontFamily: font.bold,
    fontWeight: "700",
  },
  payouts: {
    flex: 1,
  },
});
