import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { HOME_FEED_TABS, type HomeFeedFilter } from "../../lib/home-feed-filter";
import { sfx } from "../../lib/sounds";

export const HomeFeedSourceTabs = React.memo(function HomeFeedSourceTabs({
  value,
  onChange,
}: {
  value: HomeFeedFilter;
  onChange: (tab: HomeFeedFilter) => void;
}) {
  const { theme } = useTheme();

  const onPress = useCallback(
    (id: HomeFeedFilter) => {
      if (id === value) return;
      void sfx.toggle();
      onChange(id);
    },
    [value, onChange],
  );

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
      ]}
    >
      {HOME_FEED_TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onPress(tab.id)}
            style={[styles.tab, active && { backgroundColor: theme.surface }, active && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {tab.icon ? (
              <Ionicons
                name={tab.icon}
                size={14}
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
    width: "100%",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radii.md,
  },
  tabActive: {
    shadowColor: "#493D32",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  icon: { marginRight: 4 },
  label: {
    fontSize: 12,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
});
