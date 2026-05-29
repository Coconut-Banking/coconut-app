import React, { useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { Href } from "expo-router";
import type { RecentActivityItem } from "../../hooks/useGroups";
import { font, prototype } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

function currencySymbol(code?: string): string {
  switch (code) {
    case "CAD":
      return "CA$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return "$";
  }
}

export const HomeActivityRow = React.memo(function HomeActivityRow({
  item,
  showSep,
}: {
  item: RecentActivityItem;
  showSep: boolean;
}) {
  const { theme } = useTheme();
  const sym = currencySymbol(item.currency);
  const isSettlement = item.direction === "settled";

  const handlePress = useCallback(() => {
    if (!isSettlement) {
      router.push({ pathname: "/(tabs)/shared/transaction", params: { id: item.id } } as Href);
    }
  }, [isSettlement, item.id]);

  return (
    <View>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={isSettlement ? 1 : 0.7}
        onPress={handlePress}
        disabled={isSettlement}
      >
        {item.receiptUrl ? (
          <Image source={{ uri: item.receiptUrl }} style={styles.thumb} />
        ) : (
          <View
            style={[
              styles.dot,
              {
                backgroundColor:
                  item.direction === "get_back"
                    ? prototype.greenBg
                    : item.direction === "owe"
                      ? prototype.redBg
                      : theme.surfaceSecondary,
              },
            ]}
          >
            <Ionicons
              name={
                isSettlement
                  ? "checkmark"
                  : item.direction === "get_back"
                    ? "arrow-down"
                    : "arrow-up"
              }
              size={14}
              color={
                item.direction === "get_back"
                  ? prototype.green
                  : item.direction === "owe"
                    ? prototype.red
                    : "#8A9098"
              }
            />
          </View>
        )}
        <View style={styles.body}>
          <Text style={[styles.who, { color: theme.text }]}>
            <Text style={{ fontFamily: font.bold }}>{item.who}</Text> {item.action}
            {item.what ? (isSettlement ? ` ${item.what}` : ` "${item.what}"`) : ""}
          </Text>
          {item.in ? (
            <Text style={[styles.in, { color: theme.textTertiary }]} numberOfLines={1}>
              {item.in}
            </Text>
          ) : null}
        </View>
        <View style={styles.amtCol}>
          {isSettlement ? (
            <Text style={[styles.amt, { color: theme.textTertiary }]}>
              {sym}
              {item.amount.toFixed(2)}
            </Text>
          ) : (
            <Text
              style={[
                styles.amt,
                item.direction === "get_back" ? styles.amtIn : styles.amtOut,
              ]}
            >
              {item.direction === "get_back" ? "+" : "−"}
              {sym}
              {item.amount.toFixed(2)}
            </Text>
          )}
          <Text style={[styles.time, { color: theme.textQuaternary }]}>{item.time}</Text>
        </View>
      </TouchableOpacity>
      {showSep ? (
        <View style={[styles.sep, { backgroundColor: theme.borderLight }]} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, marginLeft: 12, minWidth: 0 },
  who: { fontSize: 14, fontFamily: font.regular, lineHeight: 19 },
  in: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  amtCol: { alignItems: "flex-end", marginLeft: 8, flexShrink: 0 },
  amt: { fontSize: 15, fontFamily: font.bold },
  amtIn: { color: "#3A7D44" },
  amtOut: { color: "#C23934" },
  time: { fontSize: 11, fontFamily: font.regular, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
});
