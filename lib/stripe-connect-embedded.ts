export type ConnectEmbeddedMode = "onboarding" | "payouts" | "payments" | "all";

/** When true + publishable key set, use in-app Connect embedded components instead of Safari. */
export function isStripeConnectEmbeddedEnabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_STRIPE_CONNECT_EMBEDDED === "1" ||
    process.env.EXPO_PUBLIC_STRIPE_CONNECT_EMBEDDED === "true"
  );
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
