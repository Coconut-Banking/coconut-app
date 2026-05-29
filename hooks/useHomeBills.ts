import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "../lib/api";
import type { BillRow } from "./useBills";

type BillsPayload = { bills?: BillRow[] };

async function fetchBillsTab(
  apiFetch: ReturnType<typeof useApiFetch>,
  tab: "to_pay" | "waiting_on" | "paid",
): Promise<BillRow[]> {
  const res = await apiFetch(`/api/bills?tab=${tab}`);
  if (!res.ok) return [];
  const data = (await res.json()) as BillsPayload;
  return data.bills ?? [];
}

/** Bills for home feed (to pay, waiting, paid) in one refresh. */
export function useHomeBills(enabled = true) {
  const apiFetch = useApiFetch();
  const [toPay, setToPay] = useState<BillRow[]>([]);
  const [waiting, setWaiting] = useState<BillRow[]>([]);
  const [paid, setPaid] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(enabled);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tp, wa, pd] = await Promise.all([
        fetchBillsTab(apiFetch, "to_pay"),
        fetchBillsTab(apiFetch, "waiting_on"),
        fetchBillsTab(apiFetch, "paid"),
      ]);
      setToPay(tp);
      setWaiting(wa);
      setPaid(pd);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { toPay, waiting, paid, loading, refetch };
}
