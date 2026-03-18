import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Insight } from "../hooks/useInsights";
import { Skeleton } from "./ui";
import { colors, font, fontSize, shadow, radii } from "../lib/theme";

function insightIcon(type: Insight["type"]) {
  switch (type) {
    case "duplicate":
      return { name: "copy-outline" as const, color: colors.amber, bg: colors.amberBg };
    case "anomaly":
      return { name: "alert-circle-outline" as const, color: colors.red, bg: colors.redBg };
    case "price_change":
      return { name: "trending-up" as const, color: colors.purple, bg: colors.purpleBg };
    case "refund":
      return { name: "arrow-down-circle" as const, color: colors.green, bg: colors.greenBg };
    case "new_subscription":
      return { name: "add-circle-outline" as const, color: colors.primary, bg: colors.primaryLight };
    case "trend_up":
      return { name: "trending-up" as const, color: colors.amber, bg: colors.amberBg };
    case "trend_down":
      return { name: "trending-down" as const, color: colors.green, bg: colors.greenBg };
    default:
      return { name: "bulb-outline" as const, color: colors.textTertiary, bg: colors.borderLight };
  }
}

function shortLabel(insight: Insight): string {
  if (insight.type === "duplicate") return "Dup charge";
  if (insight.type === "anomaly") return "Unusual";
  if (insight.type === "price_change") return "Sub ↑";
  if (insight.type === "refund") return "Refund";
  if (insight.type === "new_subscription") return "New sub";
  if (insight.type === "trend_up") return "Spend ↑";
  if (insight.type === "trend_down") return "Spend ↓";
  return "Insight";
}

interface InsightsBannerProps {
  insights: Insight[];
  loading: boolean;
  onSeeAll: () => void;
}

export function InsightsBanner({ insights, loading, onSeeAll }: InsightsBannerProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Skeleton width={100} height={36} borderRadius={18} />
          <Skeleton width={80} height={36} borderRadius={18} style={{ marginLeft: 8 }} />
          <Skeleton width={90} height={36} borderRadius={18} style={{ marginLeft: 8 }} />
        </ScrollView>
      </View>
    );
  }

  if (insights.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {insights.slice(0, 5).map((insight, i) => {
          const icon = insightIcon(insight.type);
          return (
            <View key={`${insight.title}-${i}`} style={[styles.chip, { backgroundColor: icon.bg }]}>
              <Ionicons name={icon.name} size={14} color={icon.color} />
              <Text style={[styles.chipText, { color: icon.color }]} numberOfLines={1}>
                {shortLabel(insight)}
              </Text>
            </View>
          );
        })}
        <TouchableOpacity
          style={styles.seeAllChip}
          onPress={onSeeAll}
          activeOpacity={0.7}
        >
          <Text style={styles.seeAllChipText}>Review all</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii["2xl"],
  },
  chipText: {
    fontFamily: font.semibold,
    fontSize: fontSize.base,
    maxWidth: 72,
  },
  seeAllChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii["2xl"],
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  seeAllChipText: {
    fontFamily: font.semibold,
    fontSize: fontSize.base,
    color: colors.primary,
  },
});
