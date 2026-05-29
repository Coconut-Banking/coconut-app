import { useState, useCallback, useEffect } from "react";
import {
  distributeExtras,
  computePersonShares,
  type ReceiptItem,
  type ReceiptItemWithExtras,
  type Assignee,
  type PersonShare,
} from "../lib/receipt-split";
import { prepareReceiptImageForUpload } from "../lib/prepare-receipt-image";
import {
  parseReceiptUploadError,
  type ReceiptUploadErrorCode,
} from "../lib/receipt-upload-errors";

export type Step = "upload" | "review" | "choose" | "assign" | "summary";

export interface Person {
  name: string;
  memberId: string | null;
  email: string | null;
  hasAccount: boolean;
  groupId: string | null;
  groupName: string | null;
}

type ApiFetch = (
  path: string,
  opts?: { method?: string; body?: object | FormData; headers?: HeadersInit }
) => Promise<Response>;

const RECEIPT_PARSE_ATTEMPTS = 6;

async function postReceiptParse(
  apiFetch: ApiFetch,
  formData: FormData,
): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < RECEIPT_PARSE_ATTEMPTS; attempt++) {
    const res = await apiFetch("/api/receipt/parse", {
      method: "POST",
      body: formData,
    });
    last = res;
    if (res.status !== 425) return res;
    if (attempt < RECEIPT_PARSE_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return last!;
}

export function useReceiptSplit(apiFetch: ApiFetch) {
  return useReceiptSplitInternal(apiFetch, { demo: false });
}

export function useReceiptSplitWithOptions(apiFetch: ApiFetch, opts?: { demo?: boolean }) {
  return useReceiptSplitInternal(apiFetch, { demo: Boolean(opts?.demo) });
}

function useReceiptSplitInternal(apiFetch: ApiFetch, opts: { demo: boolean }) {
  const demoMode = opts.demo;
  const [step, setStep] = useState<Step>("upload");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    "uploading" | "reading" | "extracting" | "cleaning"
  >("uploading");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadErrorCode, setUploadErrorCode] =
    useState<ReceiptUploadErrorCode | null>(null);

  // Progress stages while parsing (upload → OCR → clean) — same as web
  useEffect(() => {
    if (!uploading) return;
    setUploadStage("uploading");
    const stages: Array<"uploading" | "reading" | "extracting" | "cleaning"> = [
      "reading",
      "extracting",
      "cleaning",
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < stages.length) setUploadStage(stages[i++]);
    }, 2000);
    return () => clearInterval(iv);
  }, [uploading]);

  const [editItems, setEditItems] = useState<ReceiptItem[]>([]);
  const [editSubtotal, setEditSubtotal] = useState(0);
  const [editTax, setEditTax] = useState(0);
  const [editTip, setEditTip] = useState(0);
  const [editExtras, setEditExtras] = useState<Array<{ name: string; amount: number }>>([]);
  const [editTotal, setEditTotal] = useState(0);
  const [editMerchant, setEditMerchant] = useState("");

  const [people, setPeople] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Map<string, Assignee[]>>(new Map());

  const [itemsWithExtras, setItemsWithExtras] = useState<ReceiptItemWithExtras[]>([]);
  const [personShares, setPersonShares] = useState<PersonShare[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const uploadReceipt = useCallback(
    async (
      uri: string,
      opts?: { mimeType?: string; name?: string }
    ) => {
      setUploading(true);
      setUploadError(null);
      setUploadErrorCode(null);
      setImageUri(null);
      setIsPdf(opts?.mimeType === "application/pdf");

      if (demoMode) {
        // Demo-only: skip network parsing, but keep the same UI flow.
        const demoReceiptId = `demo-receipt-${Date.now()}`;
        const demoMerchant = "Blue Bottle Coffee";
        const receiptItems = [
          { id: `d-${Date.now()}-1`, name: "Iced Latte", quantity: 2, unit_price: 6.5, total_price: 13.0 },
          { id: `d-${Date.now()}-2`, name: "Banana Bread", quantity: 1, unit_price: 5.75, total_price: 5.75 },
          { id: `d-${Date.now()}-3`, name: "Tip", quantity: 1, unit_price: 3.0, total_price: 3.0 },
        ];
        const subtotal = receiptItems.reduce((s, i) => s + i.total_price, 0);
        const tax = Math.round(subtotal * 0.0825 * 100) / 100;
        const tip = 3.0;
        const total = Math.round((subtotal + tax + tip) * 100) / 100;

        // Let the UI breathe: the stage indicator is driven by `uploading`.
        setReceiptId(demoReceiptId);
        setEditItems(
          receiptItems.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unit_price),
            totalPrice: Number(i.total_price),
          }))
        );
        setEditSubtotal(subtotal);
        setEditTax(tax);
        setEditTip(tip);
        setEditExtras([]);
        setEditTotal(total);
        setEditMerchant(demoMerchant);
        setStep("review");
        setUploading(false);
        return;
      }

      try {
        const prepared = await prepareReceiptImageForUpload(uri, {
          mimeType: opts?.mimeType,
          name: opts?.name,
        });

        const formData = new FormData();
        formData.append("image", {
          uri: prepared.uri,
          type: prepared.mimeType,
          name: prepared.name,
        } as unknown as Blob);

        const res = await postReceiptParse(apiFetch, formData);

        // Parse body once; non-JSON error bodies (413/504) must not throw SyntaxError.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(`Server error (${res.status})`);
        }
        if (!res.ok) {
          const parsed = parseReceiptUploadError(data, res.status);
          setUploadErrorCode(parsed.code);
          throw new Error(parsed.message);
        }

        const items = (data.receipt_items ?? []).sort(
          (a: { sort_order: number }, b: { sort_order: number }) =>
            a.sort_order - b.sort_order
        );

        setReceiptId(data.id);
        setEditItems(
          items.map(
            (i: {
              id: string;
              name: string;
              quantity: number;
              unit_price: number;
              total_price: number;
            }) => ({
              id: i.id,
              name: i.name,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unit_price),
              totalPrice: Number(i.total_price),
            })
          )
        );
        setEditSubtotal(Number(data.subtotal));
        setEditTax(Number(data.tax));
        setEditTip(Number(data.tip));
        setEditExtras(Array.isArray(data.extras) ? data.extras : []);
        setEditTotal(Number(data.total));
        setEditMerchant(data.merchant_name ?? "");
        setStep("review");
      } catch (e) {
        setImageUri(uri);
        if (e instanceof Error) {
          setUploadError(e.message);
          setUploadErrorCode((code) => code ?? "generic");
        } else {
          setUploadError("Upload failed");
          setUploadErrorCode("generic");
        }
      } finally {
        setUploading(false);
      }
    },
    [apiFetch, demoMode]
  );

  const confirmItems = useCallback(
    async () => {
      if (!receiptId) return;
      setSaveError(null);
      if (demoMode) {
        const withExtras = distributeExtras(
          editItems,
          editSubtotal,
          editTax,
          editTip,
          editExtras
        );
        setItemsWithExtras(withExtras);
        setStep("choose");
        return;
      }
      setSaving(true);
      try {
        const res = await apiFetch(`/api/receipt/${receiptId}/items`, {
          method: "PUT",
          body: {
            items: editItems.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              unit_price: i.unitPrice,
              total_price: i.totalPrice,
            })),
            subtotal: editSubtotal,
            tax: editTax,
            tip: editTip,
            extras: editExtras,
            total: editTotal,
            merchant_name: editMerchant,
          },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any = {};
        try {
          data = await res.json();
        } catch {
          throw new Error(`Server error (${res.status})`);
        }
        if (!res.ok) throw new Error(data?.error ?? `Server error (${res.status})`);

        setSaveError(null);

        const serverItems = (data.receipt_items ?? [])
          .sort(
            (a: { sort_order: number }, b: { sort_order: number }) =>
              a.sort_order - b.sort_order
          )
          .map(
            (i: {
              id: string;
              name: string;
              quantity: number;
              unit_price: number;
              total_price: number;
            }) => ({
              id: i.id,
              name: i.name,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unit_price),
              totalPrice: Number(i.total_price),
            })
          );
        setEditItems(serverItems);

        const withExtras = distributeExtras(
          serverItems,
          editSubtotal,
          editTax,
          editTip,
          editExtras
        );
        setItemsWithExtras(withExtras);
        setStep("choose");
      } catch (e) {
        setSaveError(
          e instanceof Error ? e.message : "Failed to save changes. Please try again."
        );
      } finally {
        setSaving(false);
      }
    },
    [
      receiptId,
      apiFetch,
      editItems,
      editSubtotal,
      editTax,
      editTip,
      editExtras,
      editTotal,
      editMerchant,
      demoMode,
    ]
  );

  const addItem = useCallback(() => {
    const id = `new-${Date.now()}`;
    setEditItems((prev) => [...prev, { id, name: "New item", quantity: 1, unitPrice: 0, totalPrice: 0 }]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setEditItems((prev) => prev.filter((i) => i.id !== id));
    setAssignments((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<Omit<ReceiptItem, "id">>) => {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };
        if (updates.quantity !== undefined || updates.unitPrice !== undefined) {
          updated.totalPrice = Math.round(updated.quantity * updated.unitPrice * 100) / 100;
        }
        return updated;
      })
    );
  }, []);

  const addPerson = useCallback(
    (
      name: string,
      opts?: {
        memberId?: string | null;
        email?: string | null;
        hasAccount?: boolean;
        groupId?: string | null;
        groupName?: string | null;
      }
    ): boolean => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      if (people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase()))
        return false;
      setPeople((prev) => [
        ...prev,
        {
          name: trimmed,
          memberId: opts?.memberId ?? null,
          email: opts?.email ?? null,
          hasAccount: opts?.hasAccount ?? false,
          groupId: opts?.groupId ?? null,
          groupName: opts?.groupName ?? null,
        },
      ]);
      return true;
    },
    [people]
  );

  const removePerson = useCallback((name: string) => {
    setPeople((prev) =>
      prev.filter((p) => p.name.toLowerCase() !== name.toLowerCase())
    );
    setAssignments((prev) => {
      const next = new Map(prev);
      for (const [itemId, assignees] of next) {
        next.set(
          itemId,
          assignees.filter((a) => a.name.toLowerCase() !== name.toLowerCase())
        );
      }
      return next;
    });
  }, []);

  const toggleAssignment = useCallback((itemId: string, person: Person) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId) ?? [];
      const exists = current.some(
        (a) => a.name.toLowerCase() === person.name.toLowerCase()
      );
      if (exists) {
        next.set(
          itemId,
          current.filter(
            (a) => a.name.toLowerCase() !== person.name.toLowerCase()
          )
        );
      } else {
        next.set(itemId, [
          ...current,
          { name: person.name, memberId: person.memberId, email: person.email },
        ]);
      }
      return next;
    });
  }, []);

  const assignAllToMe = useCallback(() => {
    const me =
      people.find((p) => p.name.toLowerCase().trim() === "you") ?? people[0];
    if (!me) return;
    setAssignments((prev) => {
      const next = new Map(prev);
      for (const item of itemsWithExtras) {
        next.set(item.id, [
          { name: me.name, memberId: me.memberId, email: me.email },
        ]);
      }
      return next;
    });
  }, [people, itemsWithExtras]);

  const assignAll = useCallback(
    (itemId: string) => {
      setAssignments((prev) => {
        const next = new Map(prev);
        const current = next.get(itemId) ?? [];
        const everyoneAssigned = people.every((person) =>
          current.some(
            (a) => a.name.toLowerCase() === person.name.toLowerCase()
          )
        );
        if (everyoneAssigned) {
          next.set(itemId, []);
        } else {
          next.set(
            itemId,
            people.map((p) => ({
              name: p.name,
              memberId: p.memberId,
              email: p.email,
            }))
          );
        }
        return next;
      });
    },
    [people]
  );

  const computeSummary = useCallback(() => {
    const shares = computePersonShares(itemsWithExtras, assignments);
    setPersonShares(shares);
    setStep("summary");
  }, [itemsWithExtras, assignments]);

  const saveAssignments = useCallback(
    async () => {
      if (!receiptId) return;
      if (demoMode) {
        // Demo-only: assignments are handled locally; Summary is computed from local state.
        return;
      }
      setSaving(true);
      try {
        const payload = Array.from(assignments.entries()).map(
          ([itemId, assignees]) => ({
            itemId,
            assignees: assignees.map((a) => ({
              name: a.name,
              memberId: a.memberId,
            })),
          })
        );
        const res = await apiFetch(`/api/receipt/${receiptId}/assign`, {
          method: "POST",
          body: { assignments: payload },
        });
        if (!res.ok) {
          let errMsg = "Failed to save assignments";
          try {
            const d = await res.json();
            errMsg = (d as { error?: string }).error ?? errMsg;
          } catch {}
          throw new Error(errMsg);
        }
      } finally {
        setSaving(false);
      }
    },
    [receiptId, apiFetch, assignments, demoMode]
  );

  const clearUploadFailure = useCallback(() => {
    setUploadError(null);
    setUploadErrorCode(null);
    setImageUri(null);
    setIsPdf(false);
  }, []);

  /** Clear stale preview/errors before camera or photo library. */
  const prepareForNewScan = useCallback(() => {
    setUploadError(null);
    setUploadErrorCode(null);
    setImageUri(null);
    setIsPdf(false);
    setStep("upload");
  }, []);

  const reset = useCallback(() => {
    setStep("upload");
    setReceiptId(null);
    setImageUri(null);
    setIsPdf(false);
    setUploadError(null);
    setUploadErrorCode(null);
    setEditItems([]);
    setEditSubtotal(0);
    setEditTax(0);
    setEditTip(0);
    setEditExtras([]);
    setEditTotal(0);
    setEditMerchant("");
    setPeople([]);
    setAssignments(new Map());
    setItemsWithExtras([]);
    setPersonShares([]);
  }, []);

  return {
    step,
    setStep,
    receiptId,
    imageUri,
    isPdf,
    uploading,
    uploadStage,
    uploadError,
    uploadErrorCode,
    clearUploadFailure,
    prepareForNewScan,
    uploadReceipt,
    editItems,
    setEditItems,
    addItem,
    removeItem,
    updateItem,
    editSubtotal,
    setEditSubtotal,
    editTax,
    setEditTax,
    editTip,
    setEditTip,
    editTotal,
    setEditTotal,
    editMerchant,
    setEditMerchant,
    confirmItems,
    people,
    addPerson,
    removePerson,
    assignments,
    toggleAssignment,
    assignAll,
    assignAllToMe,
    itemsWithExtras,
    computeSummary,
    personShares,
    saveAssignments,
    saving,
    saveError,
    setSaveError,
    reset,
  };
}
