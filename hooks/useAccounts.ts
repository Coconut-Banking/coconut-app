import { useState, useEffect, useCallback } from "react";
import { useApiFetch } from "../lib/api";

export interface Account {
  id: string;
  name: string;
  type: string;
  subtype: string;
  mask: string;
  balance_current: number;
  balance_available: number;
  iso_currency_code: string;
  institution_name: string;
  plaid_item_id: string;
}

export function useAccounts() {
  const apiFetch = useApiFetch();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(() => {
    setLoading(true);
    apiFetch("/api/plaid/accounts")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((data) => {
        const list = (data.accounts || []).map((a: any) => ({
          id: a.id || a.account_id || "",
          name: a.name || "",
          type: a.type || "",
          subtype: a.subtype || "",
          mask: a.mask || "",
          balance_current: a.balance_current ?? 0,
          balance_available: a.balance_available ?? 0,
          iso_currency_code: a.iso_currency_code || "USD",
          institution_name: a.institution_name || "Unknown",
          plaid_item_id: a.plaid_item_id || "",
        }));
        setAccounts(list);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const byInstitution: Record<string, Account[]> = {};
  for (const a of accounts) {
    (byInstitution[a.institution_name] ??= []).push(a);
  }

  return { accounts, byInstitution, loading, refetch: fetchAccounts };
}
