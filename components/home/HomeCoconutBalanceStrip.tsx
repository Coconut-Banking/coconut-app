import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";
import { font, radii } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { useCoconutWallet } from "../../hooks/useCoconutWallet";
import { useDemoMode } from "../../lib/demo-mode-context";
import { sfx } from "../../lib/sounds";

/**
 * Secondary home row: real money collected (Tap to Pay / wallet), separate from split net above.
 */
export const HomeCoconutBalanceStrip = React.memo(function HomeCoconutBalanceStrip() {
  const { theme } = useTheme();
  const home = useHomePalette();
  const { isDemoOn } = useDemoMode();
  const { wallet, loading } = useCoconutWallet(!isDemoOn);

  if (isDemoOn) return null;

  const currency = wallet?.currency ?? "USD";
  const available = wallet?.available ?? 0;
  const pending = wallet?.pending ?? 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.wrap,
        {
          backgroundColor: home.heroSurface,
          borderColor: home.heroBorder,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      onPress={() => {
        void sfx.pop();
        router.push("/(tabs)/settings");
      }}
      accessibilityRole="button"
      accessibilityLabel={`Coconut balance ${formatSplitCurrencyAmount(available, currency)}. Opens account payments.`}
    >
      <View style={styles.left}>
        <View style={[styles.iconWrap, { backgroundColor: home.waveBottom }]}>
          <Ionicons name="wallet-outline" size={18} color={home.balanceLabel} />
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.label, { color: home.balanceLabel }]}>COCONUT BALANCE</Text>
          <Text style={[styles.hint, { color: theme.textTertiary }]} numberOfLines={1}>
            Cash collected · tap to manage
          </Text>
        </View>
      </View>
      <View style={styles.right}>
        {loading && !wallet ? (
          <ActivityIndicator size="small" color={home.balanceLabel} />
        ) : (
          <>
            <Text style={[styles.amount, { color: home.ink }]}>
              {formatSplitCurrencyAmount(available, currency)}
            </Text>
            {pending > 0.005 ? (
              <Text style={[styles.pending, { color: theme.textTertiary }]}>
                +{formatSplitCurrencyAmount(pending, currency)} processing
              </Text>
            ) : null}
          </>
        )}
        <Ionicons name="chevron-forward" size={18} color={theme.textQuaternary} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 18,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 322,
    alignSelf: "center",
    width: "100%",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontFamily: font.bold,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  hint: {
    fontSize: 12,
    fontFamily: font.regular,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  amount: {
    fontSize: 17,
    fontFamily: font.bold,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  pending: {
    fontSize: 10,
    fontFamily: font.medium,
    marginRight: 2,
  },
});
