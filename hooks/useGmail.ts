import { useState, useEffect, useCallback } from "react";
import * as WebBrowser from "expo-web-browser";
import { useApiFetch, getApiUrl } from "../lib/api";

interface GmailState {
  connected: boolean;
  email: string | null;
  lastScan: string | null;
  loading: boolean;
  scanning: boolean;
  scanResult: { scanned: number; matched: number } | null;
  tokenError: boolean;
}

type ApiFetch = ReturnType<typeof useApiFetch> extends Promise<infer T> ? never : ReturnType<typeof useApiFetch>;

export function useGmail(apiFetch: (path: string, opts?: { method?: string; body?: object }) => Promise<Response>) {
  const [state, setState] = useState<GmailState>({
    connected: false,
    email: null,
    lastScan: null,
    loading: true,
    scanning: false,
    scanResult: null,
    tokenError: false,
  });

  const checkStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/gmail/status");
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          connected: data.connected,
          email: data.email || null,
          lastScan: data.lastScanAt || null,
          loading: false,
        }));
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [apiFetch]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const connect = useCallback(async () => {
    try {
      const redirectUri = "coconut://gmail-callback";
      const res = await apiFetch(`/api/gmail/auth?redirect=${encodeURIComponent(redirectUri)}`);
      if (!res.ok) return;
      const { authUrl } = await res.json();

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === "success") {
        await checkStatus();
      }
    } catch (e) {
      console.error("[useGmail] connect error:", e);
    }
  }, [apiFetch, checkStatus]);

  const disconnect = useCallback(async () => {
    try {
      await apiFetch("/api/gmail/disconnect", { method: "POST" });
      setState((prev) => ({
        ...prev,
        connected: false,
        email: null,
        lastScan: null,
        scanResult: null,
        tokenError: false,
      }));
    } catch (e) {
      console.error("[useGmail] disconnect error:", e);
    }
  }, [apiFetch]);

  const scan = useCallback(async () => {
    setState((prev) => ({ ...prev, scanning: true, scanResult: null, tokenError: false }));
    try {
      const res = await apiFetch("/api/gmail/scan", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.authError) {
          setState((prev) => ({ ...prev, scanning: false, tokenError: true }));
          return;
        }
        setState((prev) => ({ ...prev, scanning: false }));
        return;
      }
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        scanning: false,
        scanResult: { scanned: data.scanned ?? 0, matched: data.matched ?? 0 },
        lastScan: new Date().toISOString(),
      }));
    } catch {
      setState((prev) => ({ ...prev, scanning: false }));
    }
  }, [apiFetch]);

  return { ...state, connect, disconnect, scan, refresh: checkStatus };
}
