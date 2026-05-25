import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font, radii } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { useCoconutWallet } from "../../hooks/useCoconutWallet";
import { settingsStyles as s } from "./styles";

type Props = {
  onSetupPayouts: () => void;
  setupLoading?: boolean;
};

export function CoconutWalletCard({ onSetupPayouts, setupLoading }: Props) {
  const { theme } = useTheme();
  const { wallet, loading, openCashOut, cashOutLoading } = useCoconutWallet();

  const currency = wallet?.currency ?? "USD";
  const available = wallet?.available ?? 0;
  const pending = wallet?.pending ?? 0;
  const heldOnCoconut = !wallet?.chargesEnabled && (wallet?.coconutHeld ?? 0) > 0;

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.cardBorder,
          marginBottom: 12,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Ionicons name="wallet-outline" size={20} color={theme.primary} />
        <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
          Coconut balance
        </Text>
      </View>

      {loading && !wallet ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={theme.text} />
      ) : (
        <>
          <Text
            style={{
              fontSize: 36,
              fontFamily: font.black,
              fontWeight: "900",
              color: theme.text,
              letterSpacing: -1.2,
              marginTop: 8,
            }}
          >
            {formatSplitCurrencyAmount(available, currency)}
          </Text>
          <Text style={[s.sectionBlurb, { color: theme.textTertiary, marginTop: 4 }]}>
            {wallet?.chargesEnabled
              ? "Available in your payment account"
              : heldOnCoconut
                ? "Held in Coconut until you set up payouts"
                : "Tap to Pay and payment links add to this balance"}
          </Text>

          {pending > 0.005 ? (
            <Text
              style={{
                fontSize: 13,
                fontFamily: font.medium,
                color: theme.textSecondary,
                marginTop: 8,
              }}
            >
              {formatSplitCurrencyAmount(pending, currency)} processing
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {wallet?.canCashOut ? (
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  { backgroundColor: theme.primary, flex: 1, minWidth: 140 },
                  cashOutLoading && s.disabled,
                ]}
                onPress={() => void openCashOut()}
                disabled={cashOutLoading}
                activeOpacity={0.85}
              >
                {cashOutLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.primaryBtnText}>Cash out</Text>
                )}
              </TouchableOpacity>
            ) : wallet?.canSetupPayouts ? (
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  { backgroundColor: theme.primary, flex: 1, minWidth: 140 },
                  setupLoading && s.disabled,
                ]}
                onPress={onSetupPayouts}
                disabled={setupLoading}
                activeOpacity={0.85}
              >
                {setupLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.primaryBtnText}>Set up payouts</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          <View
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: radii.md,
              backgroundColor: theme.surfaceTertiary,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: font.semibold, color: theme.textSecondary, lineHeight: 18 }}>
              Different from Home split balance
            </Text>
            <Text style={{ fontSize: 12, fontFamily: font.regular, color: theme.textTertiary, lineHeight: 18 }}>
              Home shows who owes whom from expenses and splits. This balance is real money you collected (Tap to Pay and
              payment links). Settling up on a split reduces what friends owe you; collecting payment adds here.
            </Text>
            <Text style={{ fontSize: 12, fontFamily: font.regular, color: theme.textTertiary, lineHeight: 18 }}>
              {wallet?.chargesEnabled
                ? "Cash out opens Stripe to send money to your bank. Standard transfer is usually 2–4 business days; instant payout may be available with a fee."
                : "After payout setup, new Tap to Pay deposits here automatically. You can cash out to your bank from Stripe."}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
