import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Alert, View, Text, Pressable, ActivityIndicator, BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ConnectAccountOnboarding } from "@stripe/stripe-react-native";
import { ConnectEmbeddedProvider } from "./ConnectEmbeddedProvider";
import { useTheme } from "../../lib/theme-context";
import { useApiFetch } from "../../lib/api";
import { font } from "../../lib/theme";
import { openHostedConnectOnboardingFromEmbedded } from "../../lib/stripe-connect-actions";

const SLOW_LOAD_MS = 12_000;

type Props = {
  onExit: () => void;
};

export default function ConnectOnboardingEmbedded({ onExit }: Props) {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [slowLoad, setSlowLoad] = useState(false);
  const closingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onExit();
  }, [onExit]);

  useEffect(() => {
    const t = setTimeout(() => setSlowLoad(true), SLOW_LOAD_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [handleClose]);

  const handleHostedFallback = useCallback(() => {
    void openHostedConnectOnboardingFromEmbedded(apiFetch, true);
  }, [apiFetch]);

  const handleLoadError = useCallback(
    (event: { error?: { message?: string } }) => {
      const message =
        event.error?.message ?? "Could not load payout setup. Try again in a moment.";
      if (__DEV__) {
        console.warn("[ConnectOnboardingEmbedded] onLoadError:", message);
      }
      Alert.alert("Setup unavailable", message, [
        { text: "Try Safari", onPress: handleHostedFallback },
        { text: "Close", style: "cancel", onPress: handleClose },
      ]);
    },
    [handleClose, handleHostedFallback],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={["top"]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Set up payouts</Text>
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={theme.text} />
        </Pressable>
      </View>

      <ConnectEmbeddedProvider mode="onboarding" onHostedFallback={handleHostedFallback}>
        <View style={[styles.embedded, { backgroundColor: theme.background }]}>
          <ConnectAccountOnboarding
            title="Set up payouts"
            onExit={handleClose}
            onLoadError={handleLoadError}
            collectionOptions={{
              fields: "eventually_due",
              futureRequirements: "include",
            }}
          />
        </View>
      </ConnectEmbeddedProvider>

      {slowLoad ? (
        <View style={[styles.slowBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.slowText, { color: theme.textSecondary }]}>
            Still loading? Stripe can be slow on device networks.
          </Text>
          <Pressable onPress={handleHostedFallback} hitSlop={8}>
            <Text style={[styles.slowLink, { color: theme.text }]}>Continue in Safari</Text>
          </Pressable>
        </View>
      ) : null}
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
    zIndex: 2,
  },
  title: {
    fontSize: 20,
    fontFamily: font.bold,
    fontWeight: "700",
  },
  embedded: {
    flex: 1,
  },
  slowBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
    alignItems: "center",
  },
  slowText: {
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 18,
  },
  slowLink: {
    fontSize: 15,
    fontFamily: font.semibold,
    textDecorationLine: "underline",
  },
});
