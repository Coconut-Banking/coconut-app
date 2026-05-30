import React, { createContext, useContext } from "react";
import { SUBSCRIPTIONS_ENABLED } from "./subscriptions-enabled";

type UserTier = "free" | "pro";

type ProTierContextType = {
  tier: UserTier;
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  purchase: (plan: "monthly" | "annual") => Promise<boolean>;
  restore: () => Promise<boolean>;
  offerings: { monthly: null; annual: null };
  purchasing: boolean;
};

const FREE_TIER_VALUE: ProTierContextType = {
  tier: "free",
  isPro: false,
  loading: false,
  refresh: async () => {},
  purchase: async () => false,
  restore: async () => false,
  offerings: { monthly: null, annual: null },
  purchasing: false,
};

const ProTierContext = createContext<ProTierContextType>(FREE_TIER_VALUE);

/** Pro / RevenueCat disabled until EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED=true. */
export function ProTierProvider({ children }: { children: React.ReactNode }) {
  if (SUBSCRIPTIONS_ENABLED) {
    if (__DEV__) {
      console.warn(
        "[pro-tier] EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED is true but the RevenueCat provider is not wired yet."
      );
    }
  }
  return (
    <ProTierContext.Provider value={FREE_TIER_VALUE}>
      {children}
    </ProTierContext.Provider>
  );
}

export function useProTier() {
  return useContext(ProTierContext);
}
