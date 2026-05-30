import { Stack } from "expo-router";
import Constants from "expo-constants";
import { StripeProvider } from "@stripe/stripe-react-native";
import { getStripePublishableKey } from "../../lib/stripe-connect-embedded";

export default function PayLayout() {
  const publishableKey = getStripePublishableKey();
  const urlScheme =
    typeof Constants.expoConfig?.scheme === "string"
      ? Constants.expoConfig.scheme
      : "coconut";

  if (!publishableKey) {
    return <Stack screenOptions={{ headerShown: false }} />;
  }

  return (
    <StripeProvider publishableKey={publishableKey} urlScheme={urlScheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </StripeProvider>
  );
}
