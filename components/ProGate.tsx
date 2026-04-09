import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProTier } from "../lib/pro-tier-context";
import { useTheme } from "../lib/theme-context";

type Props = {
  children: React.ReactNode;
  featureName?: string;
  fallback?: React.ReactNode;
};

export function ProGate({ children, featureName, fallback }: Props) {
  const { isPro } = useProTier();
  const { theme } = useTheme();

  if (isPro) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
      <Ionicons name="lock-closed" size={24} color={theme.textSecondary} />
      <Text style={[styles.title, { color: theme.text }]}>Pro Feature</Text>
      <Text style={[styles.desc, { color: theme.textSecondary }]}>
        {featureName ? `${featureName} is` : "This feature is"} available with Coconut Pro
      </Text>
      <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]}>
        <Text style={styles.buttonText}>Upgrade to Pro</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, borderRadius: 12, borderWidth: 1, alignItems: "center", gap: 8, margin: 16 },
  title: { fontSize: 16, fontWeight: "700" },
  desc: { fontSize: 13, textAlign: "center" },
  button: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
