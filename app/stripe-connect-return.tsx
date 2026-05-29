import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { stripeConnectReturnFromParams } from "../lib/stripe-connect-return";

/**
 * Deep link target after Stripe hosted onboarding (Safari).
 * Pops any trapped Connect modal, then routes to Account with refreshed status.
 */
export default function StripeConnectReturnScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    stripe_connect?: string;
    status?: string;
  }>();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const action = stripeConnectReturnFromParams(params) ?? "complete";
    router.replace({
      pathname: "/(tabs)/settings",
      params: { stripe_connect: action },
    });
  }, [params]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}
