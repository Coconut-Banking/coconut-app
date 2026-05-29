import { Alert, DeviceEventEmitter } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { invalidateApiCache } from "./api";
import { parseStripeConnectReturnUrl } from "./stripe-connect-return";
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

  const redirectUrl = `${appScheme()}://stripe-connect-return`;
  const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);

  invalidateApiCache("/api/stripe/connect/status");
  invalidateApiCache("/api/stripe/wallet");
  DeviceEventEmitter.emit("groups-updated");
  DeviceEventEmitter.emit("stripe-connect-return", { action: "complete" });

  if (result.type === "success" && result.url) {
    const action = parseStripeConnectReturnUrl(result.url);
    if (__DEV__) console.log("[Connect] auth session returned:", action ?? "unknown");
    if (action === "refresh") {
      DeviceEventEmitter.emit("stripe-connect-refresh");
    }
  }

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
  DeviceEventEmitter.emit("groups-updated");
  return true;
}

let connectFlowClosing = false;

/** Close Connect modal routes without POP — dismiss/back often fail on root modals. */
export function dismissConnectFlow(): void {
  if (connectFlowClosing) return;
  connectFlowClosing = true;

  invalidateApiCache("/api/stripe/connect/status");
  invalidateApiCache("/api/stripe/wallet");
  DeviceEventEmitter.emit("groups-updated");

  if (__DEV__) console.log("[Connect] dismissConnectFlow → tabs");

  try {
    // dismiss() dispatches raw POP and often fails on root modals; dismissTo closes modal → tabs.
    if (typeof router.dismissTo === "function") {
      router.dismissTo("/(tabs)");
    } else {
      router.replace("/(tabs)");
    }
  } catch {
    try {
      router.replace("/(tabs)");
    } catch {
      /* ignore */
    }
  } finally {
    setTimeout(() => {
      connectFlowClosing = false;
    }, 400);
  }
}

/** In-app Connect onboarding when embedded is enabled; otherwise Safari Account Link. */
export async function startConnectOnboarding(
  apiFetch: ApiFetch,
  hasAccount: boolean,
): Promise<void> {
  if (canUseStripeConnectEmbedded()) {
    router.push("/connect-onboarding");
    return;
  }
  await openHostedConnectOnboarding(apiFetch, hasAccount);
}

/** In-app payout management when embedded is enabled; otherwise Stripe Express in Safari. */
export async function openConnectCashOut(apiFetch: ApiFetch): Promise<void> {
  if (canUseStripeConnectEmbedded()) {
    router.push("/connect-payouts");
    return;
  }
  await openHostedConnectCashOut(apiFetch);
}

export function openEmbeddedConnectOnboarding(): void {
  router.push("/connect-onboarding");
}

export function openEmbeddedConnectPayouts(): void {
  router.push("/connect-payouts");
}

export async function openHostedConnectOnboardingFromEmbedded(
  apiFetch: ApiFetch,
  hasAccount = true,
): Promise<void> {
  const ok = await openHostedConnectOnboarding(apiFetch, hasAccount);
  if (ok) dismissConnectFlow();
}
