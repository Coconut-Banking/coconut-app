/** Mirrors GET /api/stripe/connect/status → transferEligibility (from webhook + Stripe sync). */
export type TransferEligibility =
  | "none"
  | "setup_required"
  | "action_required"
  | "pending_review"
  | "active";

/** Settings copy — three main states users care about. */
export const TRANSFER_STATUS_COPY: Record<
  TransferEligibility,
  { title: string; detail: string; icon: "time-outline" | "warning-outline" | "checkmark-circle" | "wallet-outline" }
> = {
  none: {
    title: "Not connected",
    detail: "Set up payouts to receive Tap to Pay and transfer to your bank.",
    icon: "wallet-outline",
  },
  setup_required: {
    title: "Not connected",
    detail: "Finish bank and identity setup to enable transfers.",
    icon: "wallet-outline",
  },
  action_required: {
    title: "Action needed",
    detail: "Stripe needs more information before transfers can be enabled.",
    icon: "warning-outline",
  },
  pending_review: {
    title: "In review",
    detail: "Stripe is reviewing your info. Transfers usually unlock in 1–2 business days.",
    icon: "time-outline",
  },
  active: {
    title: "Connected",
    detail: "Your bank is linked. Tap to Pay and balance can transfer out.",
    icon: "checkmark-circle",
  },
};

/** Connect status payload from GET /api/stripe/connect/status (new + legacy fields). */
export type ConnectPayoutBankInfo = {
  bankName?: string | null;
  last4?: string | null;
};

export type ConnectStatusPayload = {
  hasAccount?: boolean;
  onboardingComplete?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requiresVerification?: boolean;
  transferEligibility?: TransferEligibility;
  payoutBank?: ConnectPayoutBankInfo | null;
} | null;

/** e.g. "Chase ••••2632" for payout destination (Stripe Connect bank). */
export function formatPayoutBankLabel(bank: ConnectPayoutBankInfo | null | undefined): string | null {
  if (!bank?.last4) return null;
  const name = bank.bankName?.trim();
  return name ? `${name} ••••${bank.last4}` : `Bank ••••${bank.last4}`;
}

/**
 * Derive eligibility when API omits transferEligibility (older deploy) or Stripe sync lags.
 * Never map hasAccount → "none" (that showed "Not connected" after onboarding).
 */
export function deriveTransferEligibility(status: ConnectStatusPayload): TransferEligibility {
  if (status?.transferEligibility) return status.transferEligibility;
  if (!status?.hasAccount) return "none";
  if (status.payoutsEnabled) return "active";
  if (status.requiresVerification) return "action_required";
  if (
    status.detailsSubmitted ||
    status.onboardingComplete ||
    status.chargesEnabled
  ) {
    return "pending_review";
  }
  return "setup_required";
}

/** Badge label for compact display. */
export function transferStatusBadge(eligibility: TransferEligibility): string {
  switch (eligibility) {
    case "active":
      return "Connected";
    case "pending_review":
      return "In review";
    case "action_required":
      return "Action needed";
    default:
      return "Not connected";
  }
}
