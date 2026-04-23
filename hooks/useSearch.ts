import { useState, useCallback, useRef } from "react";
import { useApiFetch } from "../lib/api";

export interface SearchTransaction {
  id: string;
  plaid_transaction_id: string;
  account_id: string | null;
  merchant_name: string | null;
  raw_name: string | null;
  normalized_merchant: string | null;
  amount: number;
  date: string;
  primary_category: string | null;
  detailed_category: string | null;
  iso_currency_code: string | null;
  is_pending: boolean;
  embed_text: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

export interface SearchResult {
  intent: "search" | "aggregate" | "count";
  transactions: SearchTransaction[];
  total: number | null;
  count: number;
  answer: string;
  date_range: { earliest: string; latest: string } | null;
  applied_filters: {
    date_start: string | null;
    date_end: string | null;
    account_id: string | null;
    location: string | null;
  };
}

export interface SearchOptions {
  dateStart?: string;
  dateEnd?: string;
}

export function useSearch() {
  const apiFetch = useApiFetch();
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (query: string, opts?: SearchOptions) => {
      const q = query.trim();
      if (!q) {
        setResults(null);
        setError(null);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ q });
        if (opts?.dateStart && opts?.dateEnd) {
          params.set("date_start", opts.dateStart);
          params.set("date_end", opts.dateEnd);
        }
        const res = await apiFetch(
          `/api/search/v2?${params.toString()}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError((body as { error?: string }).error || "Search failed");
          setResults(null);
          return;
        }
        const data = (await res.json()) as SearchResult;
        if (!controller.signal.aborted) {
          setResults(data);
        }
      } catch (e: unknown) {
        if ((e as { name?: string }).name === "AbortError") return;
        setError("Search failed — check your connection");
        setResults(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [apiFetch],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setResults(null);
    setError(null);
    setLoading(false);
  }, []);

  return { results, loading, error, search, clear };
}
