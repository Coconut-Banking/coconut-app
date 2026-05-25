import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

export const BankTransactionsSyncChip = React.memo(function BankTransactionsSyncChip({
  visible,
}: {
  visible: boolean;
}) {
  const { theme } = useTheme();
  if (!visible) return null;

  return (
    <View
      style={[styles.chip, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
      accessibilityRole="text"
      accessibilityLabel="Updating bank transactions"
    >
      <ActivityIndicator size="small" color={theme.textTertiary} />
      <Text style={[styles.label, { color: theme.textSecondary }]}>Updating transactions…</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontFamily: font.medium,
  },
});
