import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ConnectOnboardingEmbedded from "../components/stripe/ConnectOnboardingEmbedded";
import { canUseStripeConnectEmbedded } from "../lib/stripe-connect-embedded";
import {
  dismissConnectFlow,
  openHostedConnectOnboarding,
} from "../lib/stripe-connect-actions";
import { useApiFetch } from "../lib/api";
import { useTheme } from "../lib/theme-context";
import { font } from "../lib/theme";

/**
 * Payout setup: in-app Stripe Connect when embedded is enabled, else Safari Account Link.
 */
export default function ConnectOnboardingScreen() {
  const handleClose = useCallback(() => {
    dismissConnectFlow();
  }, []);

  if (canUseStripeConnectEmbedded()) {
    return <ConnectOnboardingEmbedded onExit={handleClose} />;
  }

  return <ConnectOnboardingSafariBridge onClose={handleClose} />;
}

/** Hosted Account Link fallback when embedded Connect is off or unavailable. */
function ConnectOnboardingSafariBridge({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const apiFetch = useApiFetch();
  const launched = useRef(false);
  const [opening, setOpening] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const openSafari = useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      let hasAccount = true;
      try {
        const statusRes = await apiFetch("/api/stripe/connect/status");
        if (statusRes.ok) {
          const data = (await statusRes.json()) as { hasAccount?: boolean };
          hasAccount = data.hasAccount ?? true;
        }
      } catch {
        /* default hasAccount=true */
      }

      const ok = await openHostedConnectOnboarding(apiFetch, hasAccount);
      if (!ok) {
        setError("Could not open Stripe. Try again or close this screen.");
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setOpening(false);
    }
  }, [apiFetch, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    void openSafari();
  }, [openSafari]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top > 0 ? 0 : 8 }]}>
        <Pressable
          onPress={onClose}
          hitSlop={16}
          style={[styles.closeBtn, { backgroundColor: theme.surface }]}
          accessibilityRole="button"
          accessibilityLabel="Close payout setup"
        >
          <Ionicons name="close" size={24} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {opening ? (
          <>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>Opening Stripe…</Text>
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
              Payout setup continues in Safari. Return here when you&apos;re done.
            </Text>
          </>
        ) : error ? (
          <>
            <Ionicons name="alert-circle-outline" size={40} color={theme.textTertiary} />
            <Text style={[styles.title, { color: theme.text }]}>Could not open Stripe</Text>
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>{error}</Text>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => void openSafari()}
            >
              <Text style={styles.primaryBtnText}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={40} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>Stripe opened</Text>
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
              Finish setup in Safari, then tap Close to return to Coconut.
            </Text>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => void openSafari()}
            >
              <Text style={styles.primaryBtnText}>Open Stripe again</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: font.bold,
    textAlign: "center",
    marginTop: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 22,
  },
  primaryBtn: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: font.semibold,
  },
});
