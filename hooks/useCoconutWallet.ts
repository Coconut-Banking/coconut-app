import { useCallback, useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { openConnectCashOut } from "../lib/stripe-connect-actions";
import { Alert } from "react-native";
import { useApiFetch, invalidateApiCache } from "../lib/api";
import { TAP_TO_PAY_SETTLED_EVENT } from "../lib/tap-to-pay-events";

export type CoconutWallet = {
  currency: string;
  available: number;
  pending: number;
  coconutHeld: number;
  totalCollected: number;
  stripeAvailable: number | null;
  stripePending: number | null;
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  canCashOut: boolean;
  canSetupPayouts: boolean;
  autoPayout: {
    enabled: boolean;
    thresholdUsd: number | null;
    allowedThresholds: readonly number[];
  };
};

export function useCoconutWallet(enabled = true) {
  const apiFetch = useApiFetch();
  const isFocused = useIsFocused();
  const [wallet, setWallet] = useState<CoconutWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [cashOutLoading, setCashOutLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      invalidateApiCache("/api/stripe/wallet");
      const res = await apiFetch("/api/stripe/wallet");
      if (!res.ok) {
        setWallet(null);
        return;
      }
      const data = (await res.json()) as CoconutWallet;
      setWallet(data);
    } catch {
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, enabled]);

  useEffect(() => {
    if (!enabled || !isFocused) return;
    void refresh();
  }, [enabled, isFocused, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => void refresh();
    const subs = [
      DeviceEventEmitter.addListener(TAP_TO_PAY_SETTLED_EVENT, onRefresh),
      DeviceEventEmitter.addListener("groups-updated", onRefresh),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [enabled, refresh]);

  const openCashOut = useCallback(async () => {
    if (!wallet?.canCashOut) {
      Alert.alert(
        wallet?.chargesEnabled && !wallet?.payoutsEnabled
          ? "Add your bank"
          : "Set up payouts",
        wallet?.chargesEnabled && !wallet?.payoutsEnabled
          ? "Finish bank setup in Account to transfer funds."
          : "Finish payment setup in Account to transfer funds to your bank."
      );
      return;
    }
    setCashOutLoading(true);
    try {
      await openConnectCashOut(apiFetch);
      void refresh();
    } catch {
      Alert.alert("Cash out", "Check your connection and try again.");
    } finally {
      setCashOutLoading(false);
    }
  }, [apiFetch, wallet?.canCashOut, refresh]);

  return { wallet, loading, refresh, openCashOut, cashOutLoading };
}
