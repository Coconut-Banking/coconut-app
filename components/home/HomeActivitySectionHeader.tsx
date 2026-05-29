import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { font } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";
import { sfx } from "../../lib/sounds";

export const HomeActivitySectionHeader = React.memo(function HomeActivitySectionHeader({
  searchActive,
  onToggleSearch,
}: {
  searchActive: boolean;
  onToggleSearch: () => void;
}) {
  const { theme } = useTheme();
  const home = useHomePalette();

  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: home.balanceLabel }]}>ACTIVITY</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            void sfx.toggle();
            onToggleSearch();
          }}
          style={[
            styles.iconBtn,
            {
              backgroundColor: searchActive ? theme.surface : "transparent",
              borderColor: theme.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={searchActive ? "Close search" : "Search activity"}
        >
          <Ionicons
            name={searchActive ? "close" : "search-outline"}
            size={20}
            color={searchActive ? theme.text : theme.textSecondary}
          />
        </Pressable>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/activity")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open full activity"
        >
          <Text style={[styles.seeAll, { color: theme.textSecondary }]}>See all</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: 0.5,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  seeAll: { fontSize: 13, fontFamily: font.semibold },
});
