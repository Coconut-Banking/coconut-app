import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { dismissConnectFlow } from "../../lib/stripe-connect-actions";

export function ConnectEmbeddedFallback({
  title,
  message,
  onRetry,
  onClose,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  const { theme } = useTheme();
  const close = onClose ?? dismissConnectFlow;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <Pressable
        onPress={close}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={24} color={theme.text} />
      </Pressable>
      <View style={styles.body}>
        <Ionicons name="wallet-outline" size={40} color={theme.textTertiary} />
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.message, { color: theme.textTertiary }]}>{message}</Text>
        {onRetry ? (
          <Pressable
            style={[styles.btn, { backgroundColor: theme.primary }]}
            onPress={onRetry}
          >
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  close: { alignSelf: "flex-end", padding: 16 },
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
  message: {
    fontSize: 15,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 22,
  },
  btn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.lg,
  },
  btnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: font.semibold,
  },
});
