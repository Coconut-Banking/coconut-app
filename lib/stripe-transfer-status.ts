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
