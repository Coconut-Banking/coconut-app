import { Share, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, type Href } from "expo-router";

export type PayLinkSettlement = {
  fromMemberId: string;
  toMemberId: string;
  fromName: string;
  toName: string;
  amount: number;
};

export type SettlementPerson = {
  name: string;
  memberId?: string | null;
  totalOwed: number;
};

export type CreatePaymentLinkParams = {
  amount: number;
  currency?: string;
  groupId: string;
  payerMemberId: string;
  receiverMemberId: string;
};

type ApiFetch = (
  path: string,
  opts?: Omit<RequestInit, "body"> & { body?: object | FormData },
) => Promise<Response>;

export type CreatePaymentLinkResult =
  | { ok: true; url: string; token: string }
  | { ok: false; error: string };

function parseApiJson(
  res: Response,
  text: string,
): { url?: string; token?: string; error?: string } {
  try {
    return JSON.parse(text) as { url?: string; token?: string; error?: string };
  } catch {
    if (text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) {
      return {
        error:
          "Payment links are not available on the server yet. Pull the latest API deploy or try again in a minute.",
      };
    }
    return { error: "Invalid response from server" };
  }
}

export async function createPaymentLink(
  apiFetch: ApiFetch,
  params: CreatePaymentLinkParams,
): Promise<CreatePaymentLinkResult> {
  try {
    const res = await apiFetch("/api/stripe/create-payment-link", {
      method: "POST",
      body: {
        amount: params.amount,
        currency: params.currency ?? "USD",
        groupId: params.groupId,
        payerMemberId: params.payerMemberId,
        receiverMemberId: params.receiverMemberId,
      },
    });
    const text = await res.text();
    const data = parseApiJson(res, text);
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Could not create link" };
    }
    if (!data.url || !data.token) {
      return { ok: false, error: data.error ?? "Invalid response from server" };
    }
    return { ok: true, url: data.url, token: data.token };
  } catch {
    return { ok: false, error: "Could not create payment link" };
  }
}

export async function copyPaymentLink(url: string): Promise<void> {
  await Clipboard.setStringAsync(url);
}

/** Create link, copy to clipboard, then optional share sheet. */
export async function deliverPaymentLink(
  apiFetch: ApiFetch,
  params: CreatePaymentLinkParams,
  opts: {
    personName?: string;
    amount?: number;
    currency?: string;
    onCopied?: () => void;
    offerShare?: boolean;
  } = {},
): Promise<CreatePaymentLinkResult> {
  const result = await createPaymentLink(apiFetch, params);
  if (!result.ok) return result;

  await copyPaymentLink(result.url);
  opts.onCopied?.();

  if (opts.offerShare !== false) {
    const amountPart =
      opts.amount != null
        ? ` ($${opts.amount.toFixed(2)}${opts.currency && opts.currency !== "USD" ? ` ${opts.currency}` : ""})`
        : "";
    const who = opts.personName ? `Hey ${opts.personName.split(" ")[0]} — ` : "";
    try {
      await Share.share({
        message: `${who}Pay me on Coconut${amountPart}: ${result.url}`,
        url: result.url,
      });
    } catch {
      /* user dismissed share — link is already copied */
    }
  }

  return result;
}

export async function sharePaymentLink(
  url: string,
  opts: { personName?: string; amount?: number; currency?: string } = {},
): Promise<void> {
  const amountPart =
    opts.amount != null
      ? ` ($${opts.amount.toFixed(2)}${opts.currency && opts.currency !== "USD" ? ` ${opts.currency}` : ""})`
      : "";
  const who = opts.personName ? `Hey ${opts.personName.split(" ")[0]} — ` : "";
  await Share.share({
    message: `${who}Pay me on Coconut${amountPart}: ${url}`,
    url,
  });
}

export function openPaymentLink(token: string) {
  router.push({ pathname: "/pay/[token]", params: { token } } as unknown as Href);
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

function namesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  const aFirst = na.split(/\s+/)[0] ?? na;
  const bFirst = nb.split(/\s+/)[0] ?? nb;
  if (aFirst.length >= 2 && aFirst === bFirst) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/** Match a receipt-split person to a settlement row (member id + fuzzy name). */
export function findSettlementForPerson(
  person: SettlementPerson,
  suggestions: PayLinkSettlement[],
  members: Array<{ id: string; displayName: string }> = [],
): PayLinkSettlement | null {
  if (suggestions.length === 0) return null;

  const memberIdsInGroup = new Set(members.map((m) => m.id));
  const personMemberId =
    person.memberId && memberIdsInGroup.has(person.memberId)
      ? person.memberId
      : null;

  if (personMemberId) {
    const byMemberId = suggestions.find((s) => s.fromMemberId === personMemberId);
    if (byMemberId) return byMemberId;
  }

  for (const m of members) {
    if (personMemberId && m.id === personMemberId) {
      const hit = suggestions.find((s) => s.fromMemberId === m.id);
      if (hit) return hit;
    }
    if (namesLikelyMatch(person.name, m.displayName)) {
      const hit = suggestions.find((s) => s.fromMemberId === m.id);
      if (hit) return hit;
    }
  }

  const exactAmount = suggestions.find(
    (s) =>
      namesLikelyMatch(s.fromName, person.name) &&
      Math.abs(s.amount - person.totalOwed) < 0.06,
  );
  if (exactAmount) return exactAmount;

  const byName = suggestions.filter((s) => namesLikelyMatch(s.fromName, person.name));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    return byName.reduce((best, s) =>
      Math.abs(s.amount - person.totalOwed) < Math.abs(best.amount - person.totalOwed)
        ? s
        : best,
    );
  }

  if (suggestions.length === 1) return suggestions[0];
  return null;
}
