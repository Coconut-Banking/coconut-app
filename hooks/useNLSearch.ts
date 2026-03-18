import { useState, useEffect, useRef, useCallback } from "react";

type ApiFetch = (path: string, opts?: { method?: string; body?: object }) => Promise<Response>;

export interface NLTransaction {
  id: string;
  plaid_transaction_id: string;
  merchant_name: string | null;
  raw_name: string | null;
  amount: number;
  date: string;
  primary_category: string | null;
  detailed_category: string | null;
  iso_currency_code: string | null;
  is_pending: boolean;
}

export interface NLSearchResult {
  transactions: NLTransaction[];
  answer: string;
  metric: string;
  total: number | null;
  count: number | null;
  breakdown: Array<{ category: string; total: number; count: number }> | null;
  topMerchants: Array<{ merchant: string; count: number }> | null;
  usedVectorFallback: boolean;
}

export function useNLSearch(query: string, apiFetch: ApiFetch) {
  const [result, setResult] = useState<NLSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResult(null); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/nl-search", {
        method: "POST",
        body: { q: q.trim() },
      });
      const data = await res.json();
      setResult(data as NLSearchResult);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResult(null); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => search(query), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const clear = useCallback(() => { setResult(null); setLoading(false); }, []);

  return { result, loading, clear };
}
