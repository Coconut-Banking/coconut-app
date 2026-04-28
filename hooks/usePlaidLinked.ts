import { useState, useEffect, useCallback, useRef } from "react";
import { useApiFetch } from "../lib/api";

/**
 * Lightweight hook that only checks Plaid link status.
 * Use instead of useTransactions() when you only need the `linked` boolean
 * (avoids fetching all 500+ transactions).
 */
export function usePlaidLinked() {
  const apiFetch = useApiFetch();
  const [linked, setLinked] = useState(false);
  const cancelledRef = useRef(false);

  const check = useCallback(async () => {
    try {
      const res = await apiFetch("/api/plaid/status");
      if (cancelledRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setLinked(Boolean(data.linked));
      }
    } catch {
      // non-fatal
    }
  }, [apiFetch]);

  useEffect(() => {
    cancelledRef.current = false;
    void check();
    return () => { cancelledRef.current = true; };
  }, [check]);

  return { linked, refetch: check };
}
