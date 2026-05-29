import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font, radii } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import { useCoconutWallet } from "../../hooks/useCoconutWallet";
import { AutoPayoutSettings } from "./AutoPayoutSettings";
import { settingsStyles as s } from "./styles";

type ConnectStatus = {
  hasAccount?: boolean;
  onboardingComplete?: boolean;
  payoutsEnabled?: boolean;
  transferEligibility?: "none" | "setup_required" | "action_required" | "pending_review" | "active";
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
  const { wallet, loading, openCashOut, cashOutLoading } = useCoconutWallet();

  const currency = wallet?.currency ?? "USD";
  const available = wallet?.available ?? 0;
  const pending = wallet?.pending ?? 0;
  const coconutHeld = wallet?.coconutHeld ?? 0;
  const showHeldLine =
    (wallet?.chargesEnabled ?? false) && coconutHeld > 0.005;

  const payoutsReady =
    connectStatus?.transferEligibility === "active" ||
    Boolean(connectStatus?.onboardingComplete && wallet?.payoutsEnabled);
  const pendingReview = connectStatus?.transferEligibility === "pending_review";
  const needsSetup =
    connectStatus?.transferEligibility === "setup_required" ||
    connectStatus?.transferEligibility === "none" ||
    !connectStatus?.onboardingComplete;

  const blurb = payoutsReady
    ? "Ready to cash out · Tap to Pay deposits land here"
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
            {formatSplitCurrencyAmount(available, currency)}
          </Text>
          <Text style={[s.sectionBlurb, { color: theme.textTertiary, marginTop: 4 }]}>
            {blurb}
          </Text>

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
            ) : needsSetup || wallet?.canSetupPayouts ? (
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
