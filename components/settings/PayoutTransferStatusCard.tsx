import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font } from "../../lib/theme";
import {
  TRANSFER_STATUS_COPY,
  deriveTransferEligibility,
  transferStatusBadge,
  type ConnectStatusPayload,
  type TransferEligibility,
} from "../../lib/stripe-transfer-status";
import { settingsStyles as s } from "./styles";

export type ConnectStatusForTransfer = ConnectStatusPayload;

type Props = {
  connectStatus: ConnectStatusForTransfer;
  loading?: boolean;
  /** Right after hosted onboarding — API/DB may lag before Stripe sync. */
  optimisticPendingReview?: boolean;
  onPressSetup?: () => void;
  setupLoading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function PayoutTransferStatusCard({
  connectStatus,
  loading,
  optimisticPendingReview,
  onPressSetup,
  setupLoading,
  onRefresh,
  refreshing,
}: Props) {
  const { theme } = useTheme();
  let eligibility = deriveTransferEligibility(connectStatus);
  if (
    optimisticPendingReview &&
    connectStatus?.hasAccount &&
    (eligibility === "setup_required" || eligibility === "none")
  ) {
    eligibility = "pending_review";
  }

  if (loading && !connectStatus) {
    return (
      <View
        style={[
          s.card,
          { backgroundColor: theme.surface, borderColor: theme.cardBorder, marginBottom: 12 },
        ]}
      >
        <ActivityIndicator color={theme.primary} style={{ paddingVertical: 12 }} />
      </View>
    );
  }

  const copy = TRANSFER_STATUS_COPY[eligibility];
  const badge = transferStatusBadge(eligibility);
  const isActive = eligibility === "active";
  const isPending = eligibility === "pending_review";
  const needsButton =
    eligibility === "none" ||
    eligibility === "setup_required" ||
    eligibility === "action_required";

  const borderColor = isActive ? theme.positive : isPending ? theme.warning : theme.border;
  const bg = isActive ? theme.primaryLight : theme.surfaceTertiary;
  const iconColor = isActive ? theme.positive : isPending ? theme.warning : theme.textSecondary;
  const badgeBg = isActive ? theme.positive : isPending ? theme.warning : theme.textTertiary;

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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Payout status</Text>
        {onRefresh ? (
          <TouchableOpacity onPress={onRefresh} hitSlop={10} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={theme.textSecondary} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      <View
        style={[
          s.resultBox,
          { backgroundColor: bg, borderColor, marginTop: 10 },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Ionicons name={copy.icon} size={20} color={iconColor} />
            <Text style={[s.resultTitle, { color: theme.text }]}>{copy.title}</Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 20,
              backgroundColor: badgeBg,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontFamily: font.bold,
                color: "#fff",
                letterSpacing: 0.3,
              }}
            >
              {badge.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={[s.resultDetail, { color: theme.textQuaternary, marginTop: 6 }]}>
          {copy.detail}
        </Text>
        {isPending ? (
          <Text style={[s.resultDetail, { color: theme.textTertiary, marginTop: 8 }]}>
            Updates when Stripe approves you — tap refresh or reopen Account.
          </Text>
        ) : null}
      </View>

      {needsButton && onPressSetup ? (
        <TouchableOpacity
          style={[
            s.primaryBtn,
            { backgroundColor: theme.primary, marginTop: 12 },
            setupLoading && s.disabled,
          ]}
          onPress={onPressSetup}
          disabled={setupLoading}
        >
          {setupLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.primaryBtnText}>
              {eligibility === "action_required" ? "Complete verification" : "Set up payouts"}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
