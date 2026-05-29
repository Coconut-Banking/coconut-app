type ApiFetch = (
  path: string,
  opts?: { method?: string; body?: object },
) => Promise<Response>;

export type CollectStatus = {
  collecting: boolean;
  receiptStatus?: string;
  merchantName?: string;
  participants: Array<{
    member_id: string;
    display_name: string;
    status: string;
    submitted_at?: string | null;
  }>;
  submittedCount: number;
  totalCount: number;
  guestsSubmitted?: number;
  guestCount?: number;
  pendingGuests?: number;
};

export async function startReceiptCollect(
  apiFetch: ApiFetch,
  receiptId: string,
  groupId: string,
): Promise<
  | { ok: true; collectUrl: string; token: string; groupId?: string }
  | { ok: false; error: string }
> {
  const res = await apiFetch(`/api/receipt/${receiptId}/start-collect`, {
    method: "POST",
    body: { groupId },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Could not start table split" };
  return { ok: true, collectUrl: data.collectUrl, token: data.token, groupId: data.groupId };
}

/** Ad-hoc table split — creates a bill group automatically; guests join by name on the link. */
export async function startReceiptCollectAuto(
  apiFetch: ApiFetch,
  receiptId: string,
  merchantName?: string,
): Promise<
  | { ok: true; collectUrl: string; token: string; groupId?: string }
  | { ok: false; error: string }
> {
  const res = await apiFetch(`/api/receipt/${receiptId}/start-collect`, {
    method: "POST",
    body: { autoGroup: true, groupName: merchantName },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Could not start share link" };
  return { ok: true, collectUrl: data.collectUrl, token: data.token, groupId: data.groupId };
}

export async function fetchCollectStatus(
  apiFetch: ApiFetch,
  receiptId: string,
): Promise<CollectStatus | null> {
  const res = await apiFetch(`/api/receipt/${receiptId}/collect-status`);
  if (!res.ok) return null;
  return res.json() as Promise<CollectStatus>;
}

export type ReceiptResumePayload = {
  id: string;
  merchantName: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  status: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
};

export async function fetchReceiptForResume(
  apiFetch: ApiFetch,
  receiptId: string,
): Promise<ReceiptResumePayload | null> {
  const res = await apiFetch(`/api/receipt/${receiptId}`);
  if (!res.ok) return null;
  return res.json() as Promise<ReceiptResumePayload>;
}

export async function closeReceiptCollect(
  apiFetch: ApiFetch,
  receiptId: string,
): Promise<{ ok: true; billsCreated: number } | { ok: false; error: string }> {
  const res = await apiFetch(`/api/receipt/${receiptId}/close-collect`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Could not close bill" };
  return { ok: true, billsCreated: data.billsCreated ?? 0 };
}

export async function startPayCollect(
  apiFetch: ApiFetch,
  groupId: string,
  amount: number,
  label?: string,
): Promise<
  | { ok: true; collectUrl: string }
  | { ok: false; error: string }
> {
  const res = await apiFetch(`/api/groups/${groupId}/collect-pay`, {
    method: "POST",
    body: { amount, label },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error ?? "Could not start collect" };
  return { ok: true, collectUrl: data.collectUrl };
}
