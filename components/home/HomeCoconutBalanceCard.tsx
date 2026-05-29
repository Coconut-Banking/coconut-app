import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { useCoconutWallet } from "../../hooks/useCoconutWallet";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useApiFetch } from "../../lib/api";
import {
  openConnectCashOut,
  startConnectOnboarding,
} from "../../lib/stripe-connect-actions";
import { sfx } from "../../lib/sounds";
import { homeMoneyType } from "../../lib/home-money-type";

/**
 * Coconut wallet card on home — real money (Tap to Pay / payouts).
 * Matches home light palette (same family as BalanceOverviewCard + strip).
 */
export const HomeCoconutBalanceCard = React.memo(function HomeCoconutBalanceCard() {
  const { theme } = useTheme();
  const home = useHomePalette();
  const { isDemoOn } = useDemoMode();
  const apiFetch = useApiFetch();
  const { wallet, loading } = useCoconutWallet(!isDemoOn);

  if (isDemoOn) return null;

  const currency = wallet?.currency ?? "USD";
  const available = wallet?.available ?? 0;
  const pending = wallet?.pending ?? 0;
  const displayBalance = Math.round((available + pending) * 100) / 100;
  const canSetup = wallet?.canSetupPayouts ?? true;
  const ready = wallet?.chargesEnabled && wallet?.payoutsEnabled;

  const subtitle = ready
    ? pending > 0.005
      ? `${formatSplitCurrencyAmount(available, currency)} available now · ${formatSplitCurrencyAmount(pending, currency)} processing`
      : "Available to cash out"
    : canSetup
      ? "Finish setup to move money to your bank"
      : "Collect with Tap to Pay & payment links";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: home.heroSurface,
          borderColor: home.heroBorder,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      onPress={() => {
        void sfx.pop();
        if (ready) {
          void openConnectCashOut(apiFetch);
        } else {
          void startConnectOnboarding(apiFetch, wallet?.hasAccount ?? false);
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={`Coconut balance ${formatSplitCurrencyAmount(displayBalance, currency)}`}
    >
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <View style={[styles.mark, { backgroundColor: home.waveBottom }]}>
            <Ionicons name="leaf" size={16} color={home.balanceLabel} />
          </View>
          <Text style={[styles.brand, { color: home.balanceLabel }]}>COCONUT BALANCE</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textQuaternary} />
      </View>

      {loading && !wallet ? (
        <ActivityIndicator color={home.balanceLabel} style={styles.loader} />
      ) : (
        <Text
          style={[styles.amount, homeMoneyType, { color: home.ink }]}
          adjustsFontSizeToFit
          numberOfLines={1}
          minimumFontScale={0.65}
        >
          {formatSplitCurrencyAmount(displayBalance, currency)}
        </Text>
      )}

      <Text style={[styles.subtitle, { color: theme.textTertiary }]} numberOfLines={2}>
        {subtitle}
      </Text>

      {ready ? (
        <View style={[styles.footerRow, { borderTopColor: theme.borderLight }]}>
          <View style={[styles.pill, { backgroundColor: home.waveTop }]}>
            <View style={[styles.pillDot, { backgroundColor: home.balanceLabel }]} />
            <Text style={[styles.pillText, { color: home.balanceLabel }]}>Payouts on</Text>
          </View>
          <Text style={[styles.footerAction, { color: home.inkMuted }]}>Account</Text>
        </View>
      ) : (
        <View style={[styles.footerRow, { borderTopColor: theme.borderLight }]}>
          <Text style={[styles.footerAction, { color: home.balanceLabel }]}>Set up payouts →</Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 322,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderRadius: radii["2xl"] ?? 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 11,
    fontFamily: font.bold,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  amount: {
    fontSize: 36,
    letterSpacing: -1.2,
    marginBottom: 4,
  },
  loader: { alignSelf: "flex-start", marginVertical: 12 },
  subtitle: {
    fontSize: 13,
    fontFamily: font.regular,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 11,
    fontFamily: font.semibold,
  },
  footerAction: {
    fontSize: 13,
    fontFamily: font.semibold,
  },
});
