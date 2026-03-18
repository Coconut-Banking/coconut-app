import { useState, useEffect, useCallback } from "react";
import { useApiFetch } from "../lib/api";

export interface Insight {
  type: "anomaly" | "trend_up" | "trend_down" | "duplicate" | "price_change" | "new_subscription" | "refund";
  severity: "info" | "warning" | "alert";
  title: string;
  description: string;
  transactions?: Array<{ id: string; merchant: string; amount: number; date: string }>;
  metadata?: Record<string, unknown>;
}

export function useInsights() {
  const apiFetch = useApiFetch();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await apiFetch("/api/insights");
      if (res.ok) {
        const data = await res.json();
        setInsights(Array.isArray(data?.insights) ? data.insights : []);
      } else {
        setInsights([]);
      }
    } catch {
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return { insights, loading, refetch: fetchInsights };
}
