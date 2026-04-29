import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { type PurchasesPackage } from "react-native-purchases";
import {
  configurePurchases,
  isConfigured,
  getOfferings,
  purchasePackage,
  restorePurchases,
  checkProStatus,
  loginUser,
} from "./purchases";

type UserTier = "free" | "pro";

type ProTierContextType = {
  tier: UserTier;
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  purchase: (plan: "monthly" | "annual") => Promise<boolean>;
  restore: () => Promise<boolean>;
  offerings: { monthly: PurchasesPackage | null; annual: PurchasesPackage | null };
  purchasing: boolean;
};

const ProTierContext = createContext<ProTierContextType>({
  tier: "free",
  isPro: false,
  loading: true,
  refresh: async () => {},
  purchase: async () => false,
  restore: async () => false,
  offerings: { monthly: null, annual: null },
  purchasing: false,
});

export function ProTierProvider({
  children,
  apiFetch,
  clerkUserId,
}: {
  children: React.ReactNode;
  apiFetch: (path: string, opts?: Omit<RequestInit, "body"> & { body?: object | FormData }) => Promise<Response>;
  clerkUserId?: string | null;
}) {
  const [tier, setTier] = useState<UserTier>("free");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [offerings, setOfferings] = useState<{
    monthly: PurchasesPackage | null;
    annual: PurchasesPackage | null;
  }>({ monthly: null, annual: null });

  useEffect(() => {
    if (!clerkUserId) return;
    configurePurchases(clerkUserId);
    loginUser(clerkUserId);
  }, [clerkUserId]);

  useEffect(() => {
    if (!isConfigured()) return;
    getOfferings().then(setOfferings).catch(() => {});
  }, [clerkUserId]);

  const refresh = useCallback(async () => {
    try {
      // Check RevenueCat first (source of truth for subscription state)
      if (isConfigured()) {
        const rcPro = await checkProStatus();
        if (rcPro) {
          setTier("pro");
          setLoading(false);
          return;
        }
      }
      // Fallback to backend (handles webhook-driven tier changes, admin overrides)
      const res = await apiFetch("/api/user/tier");
      if (res.ok) {
        const data = await res.json();
        setTier(data.tier === "pro" ? "pro" : "free");
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const purchase = useCallback(async (plan: "monthly" | "annual"): Promise<boolean> => {
    const pkg = plan === "annual" ? offerings.annual : offerings.monthly;
    if (!pkg) {
      // No RevenueCat offerings available — show fallback
      const { Alert } = await import("react-native");
      Alert.alert("Not available", "Subscriptions are being set up. Please try again later.");
      return false;
    }
    setPurchasing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result.success) {
        setTier("pro");
        // Sync to backend
        apiFetch("/api/user/tier", {
          method: "POST",
          body: { tier: "pro" },
        }).catch(() => {});
        return true;
      }
      return false;
    } finally {
      setPurchasing(false);
    }
  }, [offerings, apiFetch]);

  const restore = useCallback(async (): Promise<boolean> => {
    setPurchasing(true);
    try {
      const result = await restorePurchases();
      if (result.isPro) {
        setTier("pro");
        apiFetch("/api/user/tier", {
          method: "POST",
          body: { tier: "pro" },
        }).catch(() => {});
        return true;
      }
      const { Alert } = await import("react-native");
      Alert.alert("No active subscription", "We couldn't find an active Coconut Pro subscription for this account.");
      return false;
    } finally {
      setPurchasing(false);
    }
  }, [apiFetch]);

  return (
    <ProTierContext.Provider value={{
      tier,
      isPro: tier === "pro",
      loading,
      refresh,
      purchase,
      restore,
      offerings,
      purchasing,
    }}>
      {children}
    </ProTierContext.Provider>
  );
}

export function useProTier() {
  return useContext(ProTierContext);
}
