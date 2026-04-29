import { Linking, Platform } from "react-native";

export function getVenmoDeepLink(
  amount: number,
  recipient?: string | null,
  note?: string
): { appUrl: string; webUrl: string } {
  const params = new URLSearchParams();
  params.set("txn", "pay");
  if (recipient) params.set("recipients", recipient.replace(/^@/, ""));
  params.set("amount", amount.toFixed(2));
  if (note) params.set("note", note);

  return {
    appUrl: `venmo://paycharge?${params.toString()}`,
    webUrl: `https://venmo.com/?${params.toString()}`,
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

/**
 * Open a P2P payment app with prefilled recipient + amount.
 * On iOS, tries the native app URL first; falls back to web.
 */
export async function openVenmo(
  amount: number,
  recipient?: string | null,
  note?: string
): Promise<boolean> {
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
