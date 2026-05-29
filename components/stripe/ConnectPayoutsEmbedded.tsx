import { useCallback, useEffect, useRef } from "react";
import { BackHandler } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ConnectPayouts } from "@stripe/stripe-react-native";
import { ConnectEmbeddedProvider } from "./ConnectEmbeddedProvider";
import { useTheme } from "../../lib/theme-context";
import { useApiFetch } from "../../lib/api";
import { font } from "../../lib/theme";
import { openHostedConnectCashOut } from "../../lib/stripe-connect-actions";

type Props = {
  onClose: () => void;
};

export default function ConnectPayoutsEmbedded({ onClose }: Props) {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const closingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [handleClose]);

  const handleHostedFallback = useCallback(() => {
    void (async () => {
      const ok = await openHostedConnectCashOut(apiFetch);
      if (ok) handleClose();
    })();
  }, [apiFetch, handleClose]);

  const handleLoadError = useCallback(
    (event: { error?: { message?: string } }) => {
      const message = event.error?.message ?? "Could not load payouts.";
      Alert.alert("Payouts unavailable", message, [
        { text: "Try Safari", onPress: handleHostedFallback },
        { text: "Close", style: "cancel", onPress: handleClose },
      ]);
    },
    [handleClose, handleHostedFallback],
  );

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
      <ConnectEmbeddedProvider mode="payouts" onHostedFallback={handleHostedFallback}>
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
