import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";

export type PayIntentResponse = {
  clientSecret: string;
  paymentIntentId: string;
  publishableKey: string;
};

export async function fetchPayLinkIntent(
  apiUrl: string,
  token: string,
): Promise<PayIntentResponse> {
  const res = await fetch(`${apiUrl}/api/pay/${encodeURIComponent(token)}/intent`, {
    method: "POST",
  });
  const data = (await res.json()) as PayIntentResponse & { error?: string };
  if (!res.ok || !data.clientSecret) {
    throw new Error(data.error ?? "Could not start payment");
  }
  return data;
}

/** Present native Stripe Payment Sheet (Apple Pay + card) — Uber/Lyft-style in-app checkout. */
export async function presentPayLinkPaymentSheet(params: {
  clientSecret: string;
  merchantDisplayName?: string;
  payerName?: string;
  receiverName?: string;
}): Promise<{ ok: true } | { ok: false; cancelled: boolean; message: string }> {
  const { error: initError } = await initPaymentSheet({
    paymentIntentClientSecret: params.clientSecret,
    merchantDisplayName: params.merchantDisplayName ?? "Coconut",
    applePay: {
      merchantCountryCode: "US",
    },
    defaultBillingDetails: params.payerName
      ? { name: params.payerName }
      : undefined,
    returnURL: "coconut://pay-return",
  });

  if (initError) {
    return { ok: false, cancelled: false, message: initError.message };
  }

  const { error: presentError } = await presentPaymentSheet();
  if (presentError) {
    const cancelled = presentError.code === "Canceled";
    return {
      ok: false,
      cancelled,
      message: cancelled ? "Payment cancelled" : presentError.message,
    };
  }

  return { ok: true };
}
