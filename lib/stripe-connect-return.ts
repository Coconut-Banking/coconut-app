/** Parsed action from `scheme://stripe-connect-return?...` after Stripe hosted onboarding. */
export type StripeConnectReturnAction = "complete" | "refresh";

/**
 * Stripe redirect uses `status=`; older app code expected `stripe_connect=`.
 * Accept either query param.
 */
export function parseStripeConnectReturnUrl(url: string): StripeConnectReturnAction | null {
  const query = url.includes("?") ? url.split("?").slice(1).join("?") : "";
  if (!query) return null;

  const params = new URLSearchParams(query);
  const value = params.get("stripe_connect") ?? params.get("status");
  if (value === "complete") return "complete";
  if (value === "refresh") return "refresh";
  return null;
}

export function stripeConnectReturnFromParams(params: {
  stripe_connect?: string | string[];
  status?: string | string[];
}): StripeConnectReturnAction | null {
  const pick = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const value = pick(params.stripe_connect) ?? pick(params.status);
  if (value === "complete") return "complete";
  if (value === "refresh") return "refresh";
  return null;
}
