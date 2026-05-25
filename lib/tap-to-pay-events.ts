/** Emitted after Tap to Pay records a settlement (receipt split can mark person paid). */
export const TAP_TO_PAY_SETTLED_EVENT = "tap-to-pay-settled";

export type TapToPaySettledPayload = {
  groupId: string;
  payerMemberId: string;
  receiverMemberId: string;
  amount: number;
  payerName?: string;
};
