import { Platform, Alert } from "react-native";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { SUBSCRIPTIONS_ENABLED } from "./subscriptions-enabled";

export type { PurchasesPackage };

async function loadPurchases() {
  if (!SUBSCRIPTIONS_ENABLED) return null;
  const mod = await import("react-native-purchases");
  return { Purchases: mod.default, LOG_LEVEL: mod.LOG_LEVEL };
}

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

const PRO_ENTITLEMENT = "pro";

let _configured = false;

export function configurePurchases(clerkUserId?: string) {
  if (!SUBSCRIPTIONS_ENABLED || _configured) return;
  void (async () => {
    const rc = await loadPurchases();
    if (!rc) return;
    const key = Platform.OS === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
    if (!key) {
      if (__DEV__) console.warn("[purchases] No RevenueCat API key — skipping init");
      return;
    }
    rc.Purchases.setLogLevel(rc.LOG_LEVEL.WARN);
    rc.Purchases.configure({ apiKey: key, appUserID: clerkUserId ?? undefined });
    _configured = true;
    if (__DEV__) {
      console.log("[purchases] RevenueCat configured", {
        platform: Platform.OS,
        userId: clerkUserId ?? "anonymous",
      });
    }
  })();
}

export function isConfigured() {
  return _configured;
}

export async function getOfferings(): Promise<{
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}> {
  if (!SUBSCRIPTIONS_ENABLED) return { monthly: null, annual: null };
  const rc = await loadPurchases();
  if (!rc || !_configured) return { monthly: null, annual: null };
  try {
    const offerings = await rc.Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return { monthly: null, annual: null };
    return {
      monthly: current.monthly ?? null,
      annual: current.annual ?? null,
    };
  } catch (e) {
    console.warn("[purchases] getOfferings failed:", e);
    return { monthly: null, annual: null };
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  cancelled?: boolean;
}> {
  if (!SUBSCRIPTIONS_ENABLED) return { success: false };
  const rc = await loadPurchases();
  if (!rc) return { success: false };
  try {
    const { customerInfo } = await rc.Purchases.purchasePackage(pkg);
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
    return { success: isPro, customerInfo };
  } catch (e: any) {
    if (e.userCancelled) {
      return { success: false, cancelled: true };
    }
    console.error("[purchases] purchasePackage failed:", e);
    Alert.alert("Purchase failed", e.message ?? "Something went wrong. Please try again.");
    return { success: false };
  }
}

export async function restorePurchases(): Promise<{
  success: boolean;
  isPro: boolean;
  customerInfo?: CustomerInfo;
}> {
  if (!SUBSCRIPTIONS_ENABLED) return { success: false, isPro: false };
  const rc = await loadPurchases();
  if (!rc) return { success: false, isPro: false };
  try {
    const customerInfo = await rc.Purchases.restorePurchases();
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
    return { success: true, isPro, customerInfo };
  } catch (e: any) {
    console.error("[purchases] restorePurchases failed:", e);
    Alert.alert("Restore failed", e.message ?? "Could not restore purchases. Please try again.");
    return { success: false, isPro: false };
  }
}

export async function checkProStatus(): Promise<boolean> {
  if (!SUBSCRIPTIONS_ENABLED || !_configured) return false;
  const rc = await loadPurchases();
  if (!rc) return false;
  try {
    const customerInfo = await rc.Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
  } catch {
    return false;
  }
}

export async function loginUser(clerkUserId: string) {
  if (!SUBSCRIPTIONS_ENABLED || !_configured) return;
  const rc = await loadPurchases();
  if (!rc) return;
  try {
    await rc.Purchases.logIn(clerkUserId);
  } catch (e) {
    console.warn("[purchases] logIn failed:", e);
  }
}

export async function logoutUser() {
  if (!SUBSCRIPTIONS_ENABLED || !_configured) return;
  const rc = await loadPurchases();
  if (!rc) return;
  try {
    await rc.Purchases.logOut();
  } catch (e) {
    console.warn("[purchases] logOut failed:", e);
  }
}
