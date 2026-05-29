export type ConnectEmbeddedMode = "onboarding" | "payouts" | "payments" | "all";

/** Embedded Connect is opt-in — native webview often blocks close on physical iOS. */
export function isStripeConnectEmbeddedEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_STRIPE_CONNECT_EMBEDDED?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return false;
}

export function getStripePublishableKey(): string | null {
  const key = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  return key || null;
}

export function canUseStripeConnectEmbedded(): boolean {
  return isStripeConnectEmbeddedEnabled() && Boolean(getStripePublishableKey());
}

export const STRIPE_CONNECT_APPEARANCE = {
  variables: {
    colorPrimary: "#1e2021",
    colorBackground: "#F6F0E2",
    colorText: "#1e2021",
    colorSecondaryText: "#6B7280",
    borderRadius: "12",
  },
} as const;
