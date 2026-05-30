import { SUBSCRIPTIONS_ENABLED } from "../../lib/subscriptions-enabled";

/** Coconut Pro upsell — hidden until subscriptions ship. */
export function ProBanner() {
  if (!SUBSCRIPTIONS_ENABLED) return null;
  return null;
}
