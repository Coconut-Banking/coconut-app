import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

type UserTier = "free" | "pro";

type ProTierContextType = {
  tier: UserTier;
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ProTierContext = createContext<ProTierContextType>({
  tier: "free",
  isPro: false,
  loading: true,
  refresh: async () => {},
});

export function ProTierProvider({
  children,
  apiFetch,
}: {
  children: React.ReactNode;
  apiFetch: (path: string) => Promise<Response>;
}) {
  const [tier, setTier] = useState<UserTier>("free");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
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

  return (
    <ProTierContext.Provider value={{ tier, isPro: tier === "pro", loading, refresh }}>
      {children}
    </ProTierContext.Provider>
  );
}

export function useProTier() {
  return useContext(ProTierContext);
}
