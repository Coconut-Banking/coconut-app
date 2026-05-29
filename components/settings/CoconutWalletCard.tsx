import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font, radii } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { useIsFocused } from "@react-navigation/native";
import { useCoconutWallet } from "../../hooks/useCoconutWallet";
import { AutoPayoutSettings } from "./AutoPayoutSettings";
import { deriveTransferEligibility, formatPayoutBankLabel } from "../../lib/stripe-transfer-status";
import { settingsStyles as s } from "./styles";

type ConnectStatus = {
  hasAccount?: boolean;
  onboardingComplete?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  transferEligibility?: "none" | "setup_required" | "action_required" | "pending_review" | "active";
  payoutBank?: { bankName?: string | null; last4?: string | null } | null;
} | null;

type Props = {
  onSetupPayouts: () => void;
  setupLoading?: boolean;
  connectStatus?: ConnectStatus;
  connectLoading?: boolean;
};

export function CoconutWalletCard({
  onSetupPayouts,
  setupLoading,
  connectStatus,
  connectLoading,
}: Props) {
  const { theme } = useTheme();
  const isFocused = useIsFocused();
  const { wallet, loading, openCashOut, cashOutLoading } = useCoconutWallet(isFocused);

  const currency = wallet?.currency ?? "USD";
  const available = wallet?.available ?? 0;
  const pending = wallet?.pending ?? 0;
  const displayBalance = Math.round((available + pending) * 100) / 100;
  const coconutHeld = wallet?.coconutHeld ?? 0;
  const showHeldLine =
    (wallet?.chargesEnabled ?? false) && coconutHeld > 0.005;

  const eligibility = deriveTransferEligibility(connectStatus ?? null);
  const fullyConnected =
    eligibility === "active" ||
    Boolean(
      connectStatus?.payoutsEnabled &&
        (connectStatus.chargesEnabled || connectStatus.onboardingComplete),
    );
  const payoutsReady = fullyConnected;
  const pendingReview = eligibility === "pending_review";
  const needsSetup =
    !fullyConnected &&
    (eligibility === "setup_required" || eligibility === "none");
  const showCashOut = Boolean(wallet?.canCashOut) || fullyConnected;
  const showSetupButton =
    !showCashOut && (needsSetup || Boolean(wallet?.canSetupPayouts));

  const payoutBankLabel = formatPayoutBankLabel(connectStatus?.payoutBank);
  const blurb = payoutsReady
    ? payoutBankLabel
      ? `Ready to cash out to ${payoutBankLabel}`
      : "Ready to cash out · Tap to Pay deposits land here"
    : pendingReview
      ? "Stripe is reviewing your info — transfers unlock soon"
      : needsSetup
        ? "One-time setup (~2 min) to receive Tap to Pay & card payments"
        : wallet?.chargesEnabled
          ? "Finish payout setup to transfer to your bank"
          : "Set up once to collect with Tap to Pay";

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

      {(loading && !wallet) || connectLoading ? (
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
            {formatSplitCurrencyAmount(displayBalance, currency)}
          </Text>
          <Text style={[s.sectionBlurb, { color: theme.textTertiary, marginTop: 4 }]}>
            {blurb}
          </Text>

          {pending > 0.005 && payoutsReady ? (
            <Text
              style={{
                fontSize: 13,
                fontFamily: font.medium,
                color: theme.textSecondary,
                marginTop: 6,
              }}
            >
              {formatSplitCurrencyAmount(available, currency)} available to cash out ·{" "}
              {formatSplitCurrencyAmount(pending, currency)} processing
            </Text>
          ) : null}

          {showHeldLine ? (
            <Text
              style={{
                fontSize: 13,
                fontFamily: font.medium,
                color: theme.textSecondary,
                marginTop: 8,
              }}
            >
              {formatSplitCurrencyAmount(coconutHeld, currency)} collected before payout setup
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {showCashOut ? (
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
            ) : showSetupButton ? (
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
                  <Text style={s.primaryBtnText}>
                    {connectStatus?.hasAccount ? "Continue setup" : "Connect payouts"}
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          {payoutsReady ? (
            <AutoPayoutSettings payoutsReady />
          ) : null}
        </>
      )}
    </View>
  );
}
