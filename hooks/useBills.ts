import { useCallback, useEffect, useState } from "react";
import { useApiFetch } from "../lib/api";

export type BillRow = {
  id: string;
  groupId: string;
  groupName: string;
  label: string;
  amount: number;
  currency: string;
  status: string;
  payerName: string;
  receiverName: string;
  payUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  lastNudgedAt: string | null;
  isPayer: boolean;
  isReceiver: boolean;
  /** Linked receipt scan (collect flow or paid bill detail). */
  receiptId?: string | null;
  collectGuestCount?: number;
  collectGuestsSubmitted?: number;
};

type BillsResponse = {
  bills: BillRow[];
  counts: { to_pay: number; waiting_on: number };
};

export function useBills(tab: "to_pay" | "waiting_on" | "paid" = "to_pay") {
  const apiFetch = useApiFetch();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [counts, setCounts] = useState({ to_pay: 0, waiting_on: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/bills?tab=${tab}`);
      const data = (await res.json()) as BillsResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load bills");
        return;
      }
      setBills(data.bills ?? []);
      setCounts(data.counts ?? { to_pay: 0, waiting_on: 0 });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, tab]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { bills, counts, loading, error, refetch };
}
