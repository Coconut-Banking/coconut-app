import { Platform, Alert } from "react-native";
import Purchases, {
  type PurchasesPackage,
  type CustomerInfo,
  LOG_LEVEL,
} from "react-native-purchases";

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

const PRO_ENTITLEMENT = "pro";

let _configured = false;

export function configurePurchases(clerkUserId?: string) {
  if (_configured) return;
  const key = Platform.OS === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
  if (!key) {
    console.warn("[purchases] No RevenueCat API key — skipping init");
    return;
  }
  Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: key, appUserID: clerkUserId ?? undefined });
  _configured = true;
  console.log("[purchases] RevenueCat configured", { platform: Platform.OS, userId: clerkUserId ?? "anonymous" });
}

export function isConfigured() {
  return _configured;
}

export async function getOfferings(): Promise<{
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}> {
  try {
    const offerings = await Purchases.getOfferings();
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
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
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
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
    return { success: true, isPro, customerInfo };
  } catch (e: any) {
    console.error("[purchases] restorePurchases failed:", e);
    Alert.alert("Restore failed", e.message ?? "Could not restore purchases. Please try again.");
    return { success: false, isPro: false };
  }
}

export async function checkProStatus(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[PRO_ENTITLEMENT] !== undefined;
  } catch {
    return false;
  }
}

export async function loginUser(clerkUserId: string) {
  if (!_configured) return;
  try {
    await Purchases.logIn(clerkUserId);
  } catch (e) {
    console.warn("[purchases] logIn failed:", e);
  }
}

export async function logoutUser() {
  if (!_configured) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn("[purchases] logOut failed:", e);
  }
}
