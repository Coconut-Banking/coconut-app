import { useState, useCallback, useEffect } from "react";
import {
  distributeExtras,
  computePersonShares,
  type ReceiptItem,
  type ReceiptItemWithExtras,
  type Assignee,
  type PersonShare,
} from "../lib/receipt-split";

export type Step = "upload" | "review" | "assign" | "summary";

export interface Person {
  name: string;
  memberId: string | null;
  email: string | null;
  hasAccount: boolean;
}

type ApiFetch = (
  path: string,
  opts?: { method?: string; body?: object | FormData; headers?: HeadersInit }
) => Promise<Response>;

export function useReceiptSplit(apiFetch: ApiFetch) {
  const [step, setStep] = useState<Step>("upload");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    "uploading" | "reading" | "extracting" | "cleaning"
  >("uploading");
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  const uploadReceipt = useCallback(
    async (
      uri: string,
      opts?: { mimeType?: string; name?: string }
    ) => {
      setUploading(true);
      setUploadError(null);
      setImageUri(uri);
      setIsPdf(opts?.mimeType === "application/pdf");

      const mimeType = opts?.mimeType ?? "image/jpeg";
      const fileName = opts?.name ?? "receipt.jpg";

      try {
        const formData = new FormData();
        formData.append("image", {
          uri,
          type: mimeType,
          name: fileName,
        } as unknown as Blob);

        const res = await apiFetch("/api/receipt/parse", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? "Parse failed");

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
        setUploadError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [apiFetch]
  );

  const confirmItems = useCallback(
    async () => {
      if (!receiptId) return;
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");

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
        setStep("assign");
      } catch {
        // stay on review
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
    ]
  );

  const addPerson = useCallback(
    (
      name: string,
      opts?: {
        memberId?: string | null;
        email?: string | null;
        hasAccount?: boolean;
      }
    ) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase()))
        return;
      setPeople((prev) => [
        ...prev,
        {
          name: trimmed,
          memberId: opts?.memberId ?? null,
          email: opts?.email ?? null,
          hasAccount: opts?.hasAccount ?? false,
        },
      ]);
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
          const data = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? "Failed to save assignments");
        }
      } catch (e) {
        setSaving(false);
        throw e;
      }
      setSaving(false);
    },
    [receiptId, apiFetch, assignments]
  );

  const reset = useCallback(() => {
    setStep("upload");
    setReceiptId(null);
    setImageUri(null);
    setIsPdf(false);
    setUploadError(null);
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
    uploadReceipt,
    editItems,
    setEditItems,
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
    itemsWithExtras,
    computeSummary,
    personShares,
    saveAssignments,
    saving,
    reset,
  };
}
