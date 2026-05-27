import { useCallback, useEffect } from "react";
import { DeviceEventEmitter, SafeAreaView, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { ConnectAccountOnboarding } from "@stripe/stripe-react-native";
import { ConnectEmbeddedProvider } from "../components/stripe/ConnectEmbeddedProvider";
import { invalidateApiCache, useApiFetch } from "../lib/api";
import { canUseStripeConnectEmbedded } from "../lib/stripe-connect-embedded";
import { openHostedConnectOnboarding } from "../lib/stripe-connect-actions";

/**
 * In-app Stripe Connect onboarding (private preview).
 * Falls back to hosted Account Link if embedded mode is off.
 */
export default function ConnectOnboardingScreen() {
  const apiFetch = useApiFetch();

  useEffect(() => {
    if (!canUseStripeConnectEmbedded()) {
      void openHostedConnectOnboarding(apiFetch, false).finally(() => {
        if (router.canGoBack()) router.back();
      });
    }
  }, [apiFetch]);

  const handleExit = useCallback(() => {
    invalidateApiCache("/api/stripe/connect/status");
    invalidateApiCache("/api/stripe/wallet");
    DeviceEventEmitter.emit("groups-updated");
    if (router.canGoBack()) router.back();
  }, []);

  const handleLoadError = useCallback(
    (event: { error?: { message?: string } }) => {
      Alert.alert(
        "Setup unavailable",
        event.error?.message ??
          "Embedded Connect is not ready yet. Try again after Stripe enables preview access.",
        [
          {
            text: "Use browser instead",
            onPress: () => {
              void openHostedConnectOnboarding(apiFetch, false).finally(handleExit);
            },
          },
          { text: "Cancel", style: "cancel", onPress: handleExit },
        ],
      );
    },
    [apiFetch, handleExit],
  );

  if (!canUseStripeConnectEmbedded()) {
    return null;
  }

  return (
    <SafeAreaView style={styles.root}>
      <ConnectEmbeddedProvider mode="onboarding">
        <ConnectAccountOnboarding
          title="Set up payouts"
          onExit={handleExit}
          onLoadError={handleLoadError}
          collectionOptions={{
            fields: "eventually_due",
            futureRequirements: "include",
          }}
        />
      </ConnectEmbeddedProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F6F0E2",
  },
});
