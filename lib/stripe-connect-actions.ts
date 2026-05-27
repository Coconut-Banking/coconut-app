import { Alert, DeviceEventEmitter } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { invalidateApiCache } from "./api";
import { canUseStripeConnectEmbedded } from "./stripe-connect-embedded";

type ApiFetch = (
  path: string,
  opts?: Omit<RequestInit, "body"> & { body?: object | FormData },
) => Promise<Response>;

function appScheme(): string {
  const rawScheme = Constants.expoConfig?.scheme;
  if (typeof rawScheme === "string") return rawScheme;
  if (Array.isArray(rawScheme)) return rawScheme[0] ?? "coconut";
  return "coconut";
}

export async function openHostedConnectOnboarding(
  apiFetch: ApiFetch,
  hasAccount: boolean,
): Promise<boolean> {
  const endpoint = hasAccount
    ? "/api/stripe/connect/onboarding-link"
    : "/api/stripe/connect/create-account";

  const res = await apiFetch(endpoint, {
    method: "POST",
    body: { scheme: appScheme() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    Alert.alert("Error", (data as { error?: string }).error ?? "Could not start setup");
    return false;
  }

  const data = await res.json();
  const url = (data as { url?: string }).url;
  if (!url) {
    Alert.alert("Error", "Could not get onboarding URL");
    return false;
  }

  await WebBrowser.openAuthSessionAsync(url, `${appScheme()}://stripe-connect-return`);
  invalidateApiCache("/api/stripe/connect/status");
  DeviceEventEmitter.emit("groups-updated");
  return true;
}

export async function openHostedConnectCashOut(apiFetch: ApiFetch): Promise<boolean> {
  const res = await apiFetch("/api/stripe/connect/dashboard-link", {
    method: "POST",
    body: {},
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    Alert.alert("Cash out", data.error ?? "Could not open payout settings.");
    return false;
  }
  await WebBrowser.openBrowserAsync(data.url);
  invalidateApiCache("/api/stripe/wallet");
  invalidateApiCache("/api/stripe/connect/status");
  return true;
}

export function openEmbeddedConnectOnboarding(): void {
  router.push("/connect-onboarding");
}

export function openEmbeddedConnectPayouts(): void {
  router.push("/connect-payouts");
}

export async function startConnectOnboarding(
  apiFetch: ApiFetch,
  hasAccount: boolean,
): Promise<void> {
  if (canUseStripeConnectEmbedded()) {
    openEmbeddedConnectOnboarding();
    return;
  }
  await openHostedConnectOnboarding(apiFetch, hasAccount);
}

export async function openConnectCashOut(apiFetch: ApiFetch): Promise<void> {
  if (canUseStripeConnectEmbedded()) {
    openEmbeddedConnectPayouts();
    return;
  }
  await openHostedConnectCashOut(apiFetch);
}
