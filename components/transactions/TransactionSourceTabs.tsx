import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import type { TxSourceTab } from "../../lib/transaction-filters";
import { sfx } from "../../lib/sounds";

const TABS: { id: TxSourceTab; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { id: "all", label: "All" },
  { id: "receipts", label: "Email receipts", icon: "mail-outline" },
];

export const TransactionSourceTabs = React.memo(function TransactionSourceTabs({
  value,
  onChange,
}: {
  value: TxSourceTab;
  onChange: (tab: TxSourceTab) => void;
}) {
  const { theme } = useTheme();

  const onPress = useCallback(
    (id: TxSourceTab) => {
      if (id === value) return;
      void sfx.toggle();
      onChange(id);
    },
    [value, onChange],
  );

  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
      {TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onPress(tab.id)}
            style={[
              styles.tab,
              active && { backgroundColor: theme.surface },
              active && styles.tabActive,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {tab.icon ? (
              <Ionicons
                name={tab.icon}
                size={15}
                color={active ? theme.text : theme.textTertiary}
                style={styles.icon}
              />
            ) : null}
            <Text style={[styles.label, { color: active ? theme.text : theme.textTertiary }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: radii.md,
  },
  tabActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  icon: {
    marginRight: 5,
  },
  label: {
    fontSize: 13,
    fontFamily: font.semibold,
    letterSpacing: -0.1,
  },
});
