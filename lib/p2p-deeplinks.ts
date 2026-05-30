import { Linking, Platform } from "react-native";

/** Venmo deep links require a username — emails break Safari / app handoff. */
export function isVenmoUsername(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.replace(/^@/, "").trim();
  if (!v || v.includes("@")) return false;
  return /^[a-zA-Z0-9._-]{3,30}$/.test(v);
}

export function getVenmoDeepLink(
  amount: number,
  recipient?: string | null,
  note?: string
): { appUrl: string; webUrl: string } {
  const username = recipient?.replace(/^@/, "").trim() ?? "";
  const params = new URLSearchParams();
  params.set("txn", "pay");
  params.set("recipients", username);
  params.set("amount", amount.toFixed(2));
  if (note) params.set("note", note);

  const webParams = new URLSearchParams();
  webParams.set("txn", "pay");
  webParams.set("amount", amount.toFixed(2));
  if (note) webParams.set("note", note);

  return {
    appUrl: `venmo://paycharge?${params.toString()}`,
    webUrl: `https://venmo.com/${encodeURIComponent(username)}?${webParams.toString()}`,
  };
}

export function getPayPalMeLink(
  amount: number,
  username?: string | null
): { url: string } {
  if (!username) return { url: "https://paypal.me" };
  return { url: `https://paypal.me/${username}/${amount.toFixed(2)}` };
}

export function getCashAppDeepLink(
  amount: number,
  cashtag?: string | null
): { url: string } {
  const tag = cashtag
    ? cashtag.startsWith("$") ? cashtag : `$${cashtag}`
    : null;
  const base = tag ? `https://cash.app/${tag}` : "https://cash.app";
  return { url: amount > 0 ? `${base}/${amount.toFixed(2)}` : base };
}

export class VenmoRecipientError extends Error {
  constructor(message = "Venmo username required") {
    super(message);
    this.name = "VenmoRecipientError";
  }
}

/**
 * Open Venmo with prefilled recipient + amount.
 * On iOS, tries the native app URL first; falls back to venmo.com/username web pay.
 */
export async function openVenmo(
  amount: number,
  recipient?: string | null,
  note?: string
): Promise<boolean> {
  if (!isVenmoUsername(recipient)) {
    throw new VenmoRecipientError();
  }

  const { appUrl, webUrl } = getVenmoDeepLink(amount, recipient, note);

  if (Platform.OS === "ios") {
    const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(appUrl);
      return true;
    }
  }

  await Linking.openURL(webUrl);
  return true;
}

export async function openPayPal(
  amount: number,
  username?: string | null
): Promise<boolean> {
  const { url } = getPayPalMeLink(amount, username);
  await Linking.openURL(url);
  return true;
}

export async function openCashApp(
  amount: number,
  cashtag?: string | null
): Promise<boolean> {
  const { url } = getCashAppDeepLink(amount, cashtag);
  await Linking.openURL(url);
  return true;
}
