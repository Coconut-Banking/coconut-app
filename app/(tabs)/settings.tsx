import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  DeviceEventEmitter,
  Platform,
  AppState,
  InteractionManager,
  type AppStateStatus,
} from "react-native";
import { MerchantLogo } from "../../components/merchant/MerchantLogo";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useUser, useClerk, useAuth } from "@clerk/expo";
import { useIsFocused } from "@react-navigation/native";
import { useApiFetch } from "../../lib/api";
import { useTransactions } from "../../hooks/useTransactions";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "../../lib/theme-context";
import type { ThemeMode } from "../../lib/colors";
import { useDemoMode } from "../../lib/demo-mode-context";
import { colors, font, shadow, radii } from "../../lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-app.dev";

/** Strip emoji and normalize whitespace — Plaid sometimes adds emoji to account names */
function stripEmoji(str: string): string {
  return str.replace(/\p{Emoji_Presentation}/gu, "").replace(/\s+/g, " ").trim();
}

type PlaidAccount = {
  id: string;
  account_id: string;
  name: string;
  type?: string;
  subtype?: string;
  mask?: string | null;
  institution_name?: string | null;
  nickname?: string | null;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, mode, setMode } = useTheme();
  const { setIsDemoOn } = useDemoMode();
  const { user } = useUser();
  const { sessionId } = useAuth();
  const { signOut } = useClerk();
  const apiFetch = useApiFetch();
  const { linked } = useTransactions();
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [accountSort, setAccountSort] = useState<"default" | "name" | "institution" | "type">("default");
  const ACCOUNTS_PREVIEW = 5;
  const STARS_KEY = "coconut:starred_accounts";

  // Load persisted stars on mount
  useEffect(() => {
    AsyncStorage.getItem(STARS_KEY).then((raw) => {
      if (raw) {
        try { setStarredIds(new Set(JSON.parse(raw))); } catch { /* ignore */ }
      }
    });
  }, []);

  const toggleStar = (id: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      AsyncStorage.setItem(STARS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const sortedAccounts = useMemo(() => {
    const starred = accounts.filter((a) => starredIds.has(a.id));
    const rest = accounts.filter((a) => !starredIds.has(a.id));
    const sorter = (arr: PlaidAccount[]) => {
      if (accountSort === "name") return [...arr].sort((a, b) => (a.nickname ?? a.name).localeCompare(b.nickname ?? b.name));
      if (accountSort === "institution") return [...arr].sort((a, b) => (a.institution_name ?? "").localeCompare(b.institution_name ?? ""));
      if (accountSort === "type") return [...arr].sort((a, b) => (a.subtype ?? a.type ?? "").localeCompare(b.subtype ?? b.type ?? ""));
      return arr;
    };
    return [...sorter(starred), ...sorter(rest)];
  }, [accounts, starredIds, accountSort]);

  const renameAccount = (a: PlaidAccount) => {
    Alert.prompt(
      "Rename account",
      `Enter a nickname for ••••${a.mask ?? "****"}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save",
          onPress: async (value?: string) => {
            const nickname = value?.trim() || null;
            try {
              await apiFetch(`/api/plaid/accounts/${a.id}`, {
                method: "PATCH",
                body: { nickname },
              });
              setAccounts((prev) =>
                prev.map((acc) =>
                  acc.id === a.id ? { ...acc, nickname } : acc
                )
              );
            } catch {
              Alert.alert("Error", "Could not save nickname.");
            }
          },
        },
      ],
      "plain-text",
      stripEmoji(a.nickname ?? a.name)
    );
  };
  const [signingOut, setSigningOut] = useState(false);

  const [splitwiseStatus, setSplitwiseStatus] = useState<{
    configured: boolean;
    connected: boolean;
    connectedAt?: string | null;
    /** From server: Splitwise-sourced groups you own (0 if authorized but never imported / cleared). */
    importedSplitwiseGroupCount?: number;
  } | null>(null);
  const [splitwiseImporting, setSplitwiseImporting] = useState(false);
  const [splitwiseClearing, setSplitwiseClearing] = useState(false);
  /** True only while the in-focus Settings fetch runs (avoids treating null status as “not configured”). */
  const [splitwiseLoading, setSplitwiseLoading] = useState(false);
  const [splitwiseResult, setSplitwiseResult] = useState<{
    ok?: boolean;
    stats?: {
      groups: number;
      members: number;
      expenses: number;
      settlements: number;
      skipped: number;
    };
    error?: string;
  } | null>(null);

  const splitwiseAutoImportStarted = useRef(false);
  const splitwiseStatusRef = useRef(splitwiseStatus);
  const splitwiseParams = useLocalSearchParams<{
    splitwise?: string;
    import?: string;
    splitwise_error?: string;
    connected?: string;
    error?: string;
    stripe_connect?: string;
  }>();
  const splitwiseErrorAlertShown = useRef(false);

  useEffect(() => {
    splitwiseStatusRef.current = splitwiseStatus;
  }, [splitwiseStatus]);

  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email: string | null;
    lastScanAt: string | null;
  } | null>(null);
  const [gmailScanning, setGmailScanning] = useState(false);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);
  const [gmailScanResult, setGmailScanResult] = useState<{
    ok: boolean;
    emailsFetched?: number;
    inserted?: number;
    matched?: number;
    isFirstScan?: boolean;
    error?: string;
  } | null>(null);
  const gmailConnectedHandled = useRef(false);

  const [connectStatus, setConnectStatus] = useState<{
    hasAccount: boolean;
    onboardingComplete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectActionLoading, setConnectActionLoading] = useState(false);
  const connectReturnHandled = useRef(false);

  const fetchAccounts = async (forceRefresh = false) => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const url = forceRefresh ? "/api/plaid/accounts?refresh=1" : "/api/plaid/accounts";
      const res = await apiFetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAccountsError(body.error ?? "Failed to load");
        setAccounts([]);
        return;
      }
      const data = await res.json();
      const accountsList = Array.isArray(data?.accounts) ? data.accounts : [];
      if (__DEV__) console.log("[accounts] total:", accountsList.length, accountsList.map((a: PlaidAccount) => `${a.institution_name ?? "?"} | ${a.name} | ${a.subtype ?? a.type} ••••${a.mask}`));
      setAccounts(accountsList);
    } catch {
      setAccountsError("Failed to load accounts");
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  };

  const fetchConnectStatus = useCallback(async () => {
    if (!user) return;
    setConnectLoading(true);
    try {
      const res = await apiFetch("/api/stripe/connect/status");
      if (!res.ok) { setConnectStatus(null); return; }
      const data = await res.json();
      setConnectStatus(data as typeof connectStatus);
    } catch {
      setConnectStatus(null);
    } finally {
      setConnectLoading(false);
    }
  }, [user, apiFetch]);

  const startConnectOnboarding = async () => {
    setConnectActionLoading(true);
    try {
      const endpoint = connectStatus?.hasAccount
        ? "/api/stripe/connect/onboarding-link"
        : "/api/stripe/connect/create-account";
      const res = await apiFetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Error", (data as { error?: string }).error ?? "Could not start setup");
        return;
      }
      const data = await res.json();
      const url = (data as { url?: string }).url;
      if (!url) {
        Alert.alert("Error", "Could not get onboarding URL");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Could not start payment setup. Check your connection.");
    } finally {
      setConnectActionLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts(linked);
  }, [linked]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("bank-disconnected", async () => {
      setAccounts([]);
      setAccountsLoading(true);
      setAccountsError(null);
      try {
        const res = await apiFetch("/api/plaid/accounts");
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setAccounts(Array.isArray(body?.accounts) ? body.accounts : []);
        } else {
          setAccountsError((body as { error?: string }).error ?? "Failed to load");
          setAccounts([]);
        }
      } catch {
        setAccountsError("Failed to load accounts");
        setAccounts([]);
      } finally {
        setAccountsLoading(false);
      }
    });
    return () => sub.remove();
  }, [apiFetch]);

  useEffect(() => {
    if (isFocused && !prevFocused.current && linked) {
      fetchAccounts(true);
    }
    prevFocused.current = isFocused;
  }, [isFocused, linked]);

  const fetchSplitwiseStatus = useCallback(
    async (opts?: { showLoading?: boolean }) => {
      if (!user) return;
      const showBlockingLoad = opts?.showLoading === true && splitwiseStatusRef.current === null;
      if (showBlockingLoad) setSplitwiseLoading(true);
      try {
        const res = await apiFetch("/api/splitwise/status");
        if (!res.ok) {
          setSplitwiseStatus(null);
          return;
        }
        const data: unknown = await res.json();
        if (
          typeof data !== "object" ||
          data === null ||
          typeof (data as { configured?: unknown }).configured !== "boolean" ||
          typeof (data as { connected?: unknown }).connected !== "boolean"
        ) {
          setSplitwiseStatus(null);
          return;
        }
        const row = data as {
          configured: boolean;
          connected: boolean;
          connectedAt?: string | null;
          importedSplitwiseGroupCount?: unknown;
        };
        const n = row.importedSplitwiseGroupCount;
        setSplitwiseStatus({
          configured: row.configured,
          connected: row.connected,
          connectedAt: row.connectedAt ?? null,
          importedSplitwiseGroupCount: typeof n === "number" ? n : 0,
        });
      } catch {
        setSplitwiseStatus(null);
      } finally {
        if (showBlockingLoad) setSplitwiseLoading(false);
      }
    },
    [user, apiFetch]
  );

  const fetchGmailStatus = async () => {
    if (!user) return;
    try {
      const res = await apiFetch("/api/gmail/status");
      if (!res.ok) { setGmailStatus(null); return; }
      const data = await res.json();
      setGmailStatus(data as { connected: boolean; email: string | null; lastScanAt: string | null });
    } catch {
      setGmailStatus(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (!isFocused) return;
    void fetchSplitwiseStatus({ showLoading: true });
    void fetchGmailStatus();
    void fetchConnectStatus();
  }, [isFocused, user, fetchSplitwiseStatus, fetchConnectStatus]);

  // After Safari OAuth, token can exist before the app was opened — refresh when returning to foreground.
  useEffect(() => {
    if (!user) return;
    const onChange = (s: AppStateStatus) => {
      if (s === "active" && isFocused) void fetchSplitwiseStatus();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [user, isFocused, fetchSplitwiseStatus]);

  const connectGmail = async () => {
    try {
      const redirect = "coconut://settings";
      const res = await apiFetch(`/api/gmail/auth?redirect=${encodeURIComponent(redirect)}`);
      const data = await res.json().catch(() => ({}));
      const authUrl = (data as { authUrl?: string }).authUrl;
      if (authUrl) {
        void Linking.openURL(authUrl);
      } else {
        Alert.alert("Gmail", "Could not start Gmail connection. Try again.");
      }
    } catch {
      Alert.alert("Gmail", "Could not start Gmail connection. Check your connection.");
    }
  };

  const scanGmail = async (daysBack?: number) => {
    setGmailScanning(true);
    setGmailScanResult(null);
    const isFirstScan = !gmailStatus?.lastScanAt;
    // Always use at least 90 days on first scan, or when explicitly requested
    const days = daysBack ?? (isFirstScan ? 90 : 7);
    try {
      const body = { daysBack: days };
      console.log("[gmail:scan] starting — daysBack:", days, "body:", JSON.stringify(body));
      const res = await apiFetch("/api/gmail/scan", { method: "POST", body });
      console.log("[gmail:scan] response status:", res.status);
      const data = await res.json().catch((e) => { console.warn("[gmail:scan] json parse error:", e); return {}; });
      console.log("[gmail:scan] response body:", JSON.stringify(data));
      if (!res.ok) {
        if (res.status === 403 && (data as { authError?: boolean }).authError) {
          setGmailStatus((prev) => prev ? { ...prev, connected: false } : null);
          Alert.alert("Gmail", "Gmail connection expired. Please reconnect.");
        } else {
          setGmailScanResult({ ok: false, error: (data as { error?: string }).error ?? "Scan failed. Try again." });
        }
      } else {
        const d = data as { emailsFetched?: number; inserted?: number; matched?: number; error?: string };
        console.log("[gmail:scan] success — fetched:", d.emailsFetched, "inserted:", d.inserted, "matched:", d.matched, "error:", d.error);
        if (d.error) {
          setGmailScanResult({ ok: false, error: d.error });
        } else {
          setGmailScanResult({ ok: true, emailsFetched: d.emailsFetched, inserted: d.inserted ?? 0, matched: d.matched ?? 0, isFirstScan });
        }
        void fetchGmailStatus();
      }
    } catch (e) {
      console.error("[gmail:scan] exception:", e instanceof Error ? e.message : e);
      setGmailScanResult({ ok: false, error: "Scan failed. Check your connection." });
    } finally {
      setGmailScanning(false);
    }
  };

  const disconnectGmail = () => {
    Alert.alert(
      "Disconnect Gmail?",
      "Removes your Gmail connection. Matched receipts stay in Coconut.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setGmailDisconnecting(true);
            try {
              const res = await apiFetch("/api/gmail/disconnect", { method: "POST" });
              if (!res.ok) {
                Alert.alert("Error", "Could not disconnect. Try again.");
              } else {
                setGmailStatus({ connected: false, email: null, lastScanAt: null });
                setGmailScanResult(null);
              }
            } catch {
              Alert.alert("Error", "Could not disconnect. Check your connection.");
            } finally {
              setGmailDisconnecting(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!user) return;
    if (splitwiseAutoImportStarted.current) return;
    if (splitwiseParams?.splitwise === "connected" && splitwiseParams?.import === "1") {
      splitwiseAutoImportStarted.current = true;
      void startSplitwiseImport();
    }
  }, [splitwiseParams?.splitwise, splitwiseParams?.import, user]);

  useEffect(() => {
    if (!user) return;
    if (gmailConnectedHandled.current) return;
    if (splitwiseParams?.connected === "true") {
      gmailConnectedHandled.current = true;
      router.replace("/(tabs)/settings");
      // Fetch status first, then auto-scan with 90 days on first connect
      fetchGmailStatus().then(() => {
        void scanGmail(90);
      });
    } else if (splitwiseParams?.error === "auth_failed") {
      gmailConnectedHandled.current = true;
      Alert.alert("Gmail", "Could not connect Gmail. Please try again.");
      router.replace("/(tabs)/settings");
    }
  }, [splitwiseParams?.connected, splitwiseParams?.error, user]);

  // Handle return from Stripe Connect onboarding
  useEffect(() => {
    if (!user) return;
    if (connectReturnHandled.current) return;
    const sc = splitwiseParams?.stripe_connect;
    if (sc === "complete") {
      connectReturnHandled.current = true;
      void fetchConnectStatus();
      router.replace("/(tabs)/settings");
    } else if (sc === "refresh") {
      connectReturnHandled.current = true;
      void startConnectOnboarding();
      router.replace("/(tabs)/settings");
    }
  }, [splitwiseParams?.stripe_connect, user]);

  useEffect(() => {
    const err = splitwiseParams?.splitwise_error;
    if (!err || splitwiseErrorAlertShown.current) return;
    splitwiseErrorAlertShown.current = true;
    const msg =
      err === "token_exchange_failed"
        ? "Failed to connect to Splitwise. Please try again."
        : err === "invalid_state"
          ? "That link expired or was invalid. Try Connect Splitwise again."
          : "Could not connect to Splitwise.";
    Alert.alert("Splitwise", msg, [
      {
        text: "OK",
        onPress: () => {
          router.replace("/(tabs)/settings");
          splitwiseErrorAlertShown.current = false;
        },
      },
    ]);
  }, [splitwiseParams?.splitwise_error, router]);

  /**
   * Native: in-app auth session (SFSafariViewController / Custom Tabs) so the callback URL returns to the app
   * without system Safari / invalid custom-scheme links. Web: open external browser.
   */
  const connectSplitwise = async () => {
    splitwiseAutoImportStarted.current = false;
    const rawScheme = Constants.expoConfig?.scheme;
    const scheme =
      typeof rawScheme === "string" ? rawScheme : Array.isArray(rawScheme) ? rawScheme[0] ?? "coconut" : "coconut";
    const qs = new URLSearchParams({ app: "1", scheme });
    const path = `/api/splitwise/auth-url?${qs.toString()}`;
    try {
      const res = await apiFetch(path);
      const data = await res.json().catch(() => ({}));
      const serverErr = (data as { error?: string }).error?.trim();
      if (!res.ok) {
        if (res.status === 401) {
          Alert.alert("Sign in required", "Sign in to Coconut again, then tap Connect Splitwise.");
          return;
        }
        if (res.status === 425) {
          Alert.alert(
            "Session not ready",
            "Wait a moment after opening the app, then try Connect Splitwise again.",
          );
          return;
        }
        if (res.status === 404) {
          Alert.alert(
            "Splitwise can’t start",
            `This server doesn’t have the app Splitwise endpoint (404). Point EXPO_PUBLIC_API_URL at your latest Coconut deployment (same URL as the web app), rebuild the app, and try again.\n\nCurrent API: ${API_URL.replace(/\/$/, "")}`,
          );
          return;
        }
        if (res.status === 503) {
          const msg = serverErr ?? "";
          const isNetwork =
            msg.includes("timed out") ||
            msg.includes("Network request failed") ||
            msg.includes("connection");
          if (isNetwork) {
            Alert.alert("Connection problem", msg || "Check your network and try again.");
            return;
          }
          Alert.alert(
            "Splitwise unavailable",
            msg || "Splitwise is not configured on the server (missing SPLITWISE_CLIENT_ID / SECRET on Vercel).",
          );
          return;
        }
        Alert.alert(
          "Could not open Splitwise",
          serverErr ||
            `The server returned HTTP ${res.status}. Check EXPO_PUBLIC_API_URL and that production is up to date.`,
        );
        return;
      }
      const url = (data as { url?: string }).url;
      if (!url || typeof url !== "string") {
        Alert.alert("Could not open Splitwise", "Server did not return an authorization URL. Deploy the latest API.");
        return;
      }

      // Use the app's custom scheme so ASWebAuthenticationSession watches for
      // "coconut-dev://" (not "https://") and only dismisses when the server
      // redirects to the deep link — no intermediate HTML page visible.
      const callbackUrl = `${scheme}://splitwise-callback`;

      if (Platform.OS === "web") {
        await Linking.openURL(url);
        return;
      }

      // Defer so ASWebAuthenticationSession / Custom Tabs can attach a valid window (avoids no-op opens).
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      let result: WebBrowser.WebBrowserAuthSessionResult;
      try {
        result = await WebBrowser.openAuthSessionAsync(url, callbackUrl, {
          preferEphemeralSession: true,
        });
      } catch (e) {
        if (__DEV__) console.warn("[splitwise] openAuthSessionAsync failed", e);
        const canOpen = await Linking.canOpenURL(url).catch(() => false);
        if (canOpen) {
          Alert.alert(
            "Open Splitwise",
            "In-app sign-in didn’t start. Open Splitwise in your browser instead?",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open browser", onPress: () => void Linking.openURL(url) },
            ],
          );
        } else {
          Alert.alert("Could not open Splitwise", "Something went wrong. Please try again.");
        }
        return;
      }

      if (result.type !== "success") {
        const hint =
          result.type === "cancel"
            ? "Sign-in was cancelled or the sign-in window didn’t appear."
            : "The sign-in window closed before finishing.";
        Alert.alert(
          "Splitwise sign-in",
          `${hint} Try again, or open Splitwise in your browser to continue.`,
          [
            { text: "OK", style: "cancel" },
            { text: "Open browser", onPress: () => void Linking.openURL(url) },
          ],
        );
        return;
      }

      try {
        const returned = new URL(result.url);
        if (returned.searchParams.get("error")) {
          Alert.alert("Splitwise", "Authorization was cancelled or denied.");
          return;
        }
      } catch {
        /* ignore malformed return URL */
      }

      const verifyRes = await apiFetch("/api/splitwise/status");
      if (!verifyRes.ok) {
        Alert.alert("Splitwise", "Could not verify the connection. Pull to refresh on Settings.");
        return;
      }
      const st = (await verifyRes.json()) as {
        configured?: boolean;
        connected?: boolean;
        connectedAt?: string | null;
        importedSplitwiseGroupCount?: unknown;
      };
      if (typeof st.configured !== "boolean" || typeof st.connected !== "boolean") {
        Alert.alert("Splitwise", "Could not verify the connection. Pull to refresh on Settings.");
        return;
      }
      const n = st.importedSplitwiseGroupCount;
      setSplitwiseStatus({
        configured: st.configured,
        connected: st.connected,
        connectedAt: st.connectedAt ?? null,
        importedSplitwiseGroupCount: typeof n === "number" ? n : 0,
      });
      if (!st.connected) {
        Alert.alert(
          "Splitwise",
          "Connection did not complete. Try Connect again, or use the Coconut website if this keeps happening.",
        );
        return;
      }

      splitwiseAutoImportStarted.current = false;
      await startSplitwiseImport();
    } catch (e) {
      if (__DEV__) console.warn("[splitwise] auth exception", e);
      Alert.alert("Could not open Splitwise", "Something went wrong. Please try again.");
    }
  };

  const startSplitwiseImport = async () => {
    setSplitwiseImporting(true);
    setSplitwiseResult(null);
    try {
      const res = await apiFetch("/api/splitwise/import", {
        method: "POST",
        body: {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? "Import failed";
        if (__DEV__) console.warn("[splitwise] import HTTP", res.status, msg);
        setSplitwiseResult({ ok: false, error: msg });
        return;
      }
      setSplitwiseResult(data as typeof splitwiseResult);
      DeviceEventEmitter.emit("groups-updated");
    } catch (e) {
      if (__DEV__) console.warn("[splitwise] import exception", e);
      setSplitwiseResult({
        ok: false,
        error: "Import failed. Please try again.",
      });
    } finally {
      setSplitwiseImporting(false);
      void fetchSplitwiseStatus();
      const hadOauthParams =
        splitwiseParams?.splitwise === "connected" ||
        splitwiseParams?.import === "1" ||
        Boolean(splitwiseParams?.splitwise_error);
      if (hadOauthParams) {
        splitwiseAutoImportStarted.current = false;
        router.replace("/(tabs)/settings");
      }
    }
  };

  const runSplitwiseClearAndRefresh = async () => {
    setSplitwiseClearing(true);
    try {
      const res = await apiFetch("/api/splitwise/clear", {
        method: "POST",
        body: { disconnectToken: true },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert("Could not disconnect", (data as { error?: string }).error ?? "Try again.");
        return;
      }
      setSplitwiseResult(null);
      DeviceEventEmitter.emit("groups-updated");
      await fetchSplitwiseStatus();
    } catch {
      Alert.alert("Error", "Could not disconnect. Check your connection.");
    } finally {
      setSplitwiseClearing(false);
    }
  };

  /** Full disconnect: only after Splitwise data exists in Coconut (imported groups or a successful import this session). */
  const disconnectSplitwiseAndClear = () => {
    Alert.alert(
      "Disconnect Splitwise?",
      "Removes every Splitwise-imported group and expense from Coconut and disconnects your Splitwise login. Your Splitwise account is unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => void runSplitwiseClearAndRefresh(),
        },
      ]
    );
  };

  /** Linked token only (no imported data yet): remove OAuth token without implying a full data wipe. */
  const removeSplitwiseSavedLogin = () => {
    Alert.alert(
      "Remove saved login?",
      "Coconut will forget your Splitwise authorization. You haven’t imported groups yet, so nothing is removed from Shared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void runSplitwiseClearAndRefresh(),
        },
      ]
    );
  };

  const hasSplitwiseImportedData = useMemo(
    () =>
      (splitwiseStatus?.importedSplitwiseGroupCount ?? 0) > 0 || Boolean(splitwiseResult?.ok),
    [splitwiseStatus?.importedSplitwiseGroupCount, splitwiseResult?.ok]
  );

  const disconnectBank = () => {
    Alert.alert(
      "Disconnect bank",
      "You can reconnect anytime from here.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setDisconnecting(true);
            try {
              const res = await apiFetch("/api/plaid/disconnect", { method: "POST" });
              if (!res.ok) {
                Alert.alert("Error", "Failed to disconnect");
              } else {
                DeviceEventEmitter.emit("bank-disconnected");
                Alert.alert("Bank disconnected", "You can link a bank again from the Home tab or Connect flow.");
              }
            } catch {
              Alert.alert("Error", "Failed to disconnect");
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    if (!signOut) return;
    setSigningOut(true);
    try {
      setIsDemoOn(false);
      const p = sessionId ? signOut({ sessionId }) : signOut();
      await Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Sign out timed out")), 15_000),
        ),
      ]);
      // Root AuthSwitch will swap stacks; replace so back never returns to signed-in tabs.
      setTimeout(() => {
        try {
          router.replace("/(auth)/sign-in");
        } catch {
          /* ignore */
        }
      }, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign out failed";
      Alert.alert("Sign out", msg === "Sign out timed out" ? "Sign out is taking too long. Try again." : msg);
    } finally {
      setSigningOut(false);
    }
  };

  const base = API_URL.replace(/\/$/, "");
  const connectUrl = `${base}/connect?from_app=1`;

  const appearanceOptions: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "auto", label: "System" },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

        {/* Preferences */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Preferences</Text>
          {user ? (
            <View style={styles.accountBlock}>
              <Text style={[styles.profileName, { color: theme.text }]}>
                {user.fullName || user.username || "Account"}
              </Text>
              <Text style={[styles.accountEmail, { color: theme.textTertiary }]} numberOfLines={1}>
                {user.primaryEmailAddress?.emailAddress ?? ""}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Appearance</Text>
          <View style={styles.segmentRow}>
            {appearanceOptions.map((opt) => {
              const selected = mode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.segment,
                    {
                      borderColor: selected ? theme.primary : theme.border,
                      backgroundColor: selected ? theme.primaryLight : theme.surfaceSecondary,
                    },
                  ]}
                  onPress={() => setMode(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: selected ? theme.primary : theme.textSecondary, fontFamily: selected ? font.semibold : font.medium },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Payments (Stripe Connect) */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Payments</Text>
          <Text style={[styles.sectionBlurb, { color: theme.textTertiary }]}>
            Set up payments to receive Tap to Pay funds directly in your bank account.
          </Text>

          {connectLoading && connectStatus === null ? (
            <ActivityIndicator style={{ marginTop: 14 }} color={theme.primary} />
          ) : connectStatus?.onboardingComplete ? (
            <View style={[styles.resultBox, { backgroundColor: "#EEF7F2", borderColor: "#C3E0D3" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="checkmark-circle" size={20} color={theme.positive} />
                <Text style={[styles.resultTitle, { color: theme.text }]}>Payments enabled</Text>
              </View>
              <Text style={[styles.resultDetail, { color: theme.textQuaternary }]}>
                Tap to Pay funds will be deposited directly to your bank account.
              </Text>
            </View>
          ) : connectStatus?.hasAccount ? (
            <View style={{ gap: 12, marginTop: 4 }}>
              <View style={[styles.resultBox, { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="time-outline" size={20} color="#F59E0B" />
                  <Text style={[styles.resultTitle, { color: theme.text }]}>Setup incomplete</Text>
                </View>
                <Text style={[styles.resultDetail, { color: theme.textQuaternary }]}>
                  Finish setting up your account to receive payments.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }, connectActionLoading && styles.disabled]}
                onPress={startConnectOnboarding}
                disabled={connectActionLoading}
              >
                {connectActionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Continue setup</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }, connectActionLoading && styles.disabled]}
                onPress={startConnectOnboarding}
                disabled={connectActionLoading}
              >
                {connectActionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Set up payments</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Connected banks */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <View style={styles.row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Connected banks</Text>
              <TouchableOpacity onPress={() => fetchAccounts(true)} hitSlop={10} disabled={accountsLoading}>
                <Ionicons name="refresh-outline" size={16} color={accountsLoading ? theme.textTertiary : theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => Linking.openURL(connectUrl)} hitSlop={8}>
              <Text style={[styles.link, { color: theme.primary }]}>{linked ? "Add account" : "Connect"}</Text>
            </TouchableOpacity>
          </View>
          {accountsLoading ? (
            <ActivityIndicator color={theme.primary} style={{ paddingVertical: 20 }} />
          ) : accountsError ? (
            <Text style={[styles.error, { color: theme.error }]}>{accountsError}</Text>
          ) : accounts.length === 0 ? (
            <Text style={[styles.muted, { color: theme.textQuaternary }]}>No bank accounts linked.</Text>
          ) : (
            <View style={styles.accountList}>
              {/* Sort bar — only visible when list is expanded */}
              {showAllAccounts && accounts.length > 1 ? (
                <View style={[styles.sortBar, { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight }]}>
                  <Text style={[styles.sortLabel, { color: theme.textTertiary }]}>Sort</Text>
                  <View style={styles.sortChips}>
                    {(["default", "name", "institution", "type"] as const).map((s) => {
                      const active = accountSort === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => setAccountSort(s)}
                          activeOpacity={0.7}
                          style={[styles.sortChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primaryLight : theme.surface }]}
                        >
                          <Text style={[styles.sortChipText, { color: active ? theme.primary : theme.textSecondary, fontFamily: active ? font.semibold : font.medium }]}>
                            {s === "default" ? "Default" : s === "name" ? "Name" : s === "institution" ? "Bank" : "Type"}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Starred section header */}
              {starredIds.size > 0 && showAllAccounts ? (
                <View style={[styles.accountSectionHeader, { borderBottomColor: theme.borderLight }]}>
                  <Ionicons name="star" size={11} color="#F5A623" />
                  <Text style={[styles.accountSectionLabel, { color: theme.textTertiary }]}>Starred</Text>
                </View>
              ) : null}

              {(showAllAccounts ? sortedAccounts : sortedAccounts.slice(0, ACCOUNTS_PREVIEW)).map((a, i, arr) => {
                const isStarred = starredIds.has(a.id);
                // Insert "Other" divider between starred and non-starred when expanded
                const prevStarred = i > 0 && starredIds.has(arr[i - 1].id);
                const showDivider = showAllAccounts && starredIds.size > 0 && !isStarred && prevStarred;
                return (
                  <View key={a.account_id}>
                    {showDivider ? (
                      <View style={[styles.accountSectionHeader, { borderBottomColor: theme.borderLight }]}>
                        <Text style={[styles.accountSectionLabel, { color: theme.textTertiary }]}>Other accounts</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.accountRow, { borderBottomColor: theme.borderLight }]}
                      onPress={() => renameAccount(a)}
                      activeOpacity={0.7}
                    >
                      <MerchantLogo
                        merchantName={a.institution_name ?? a.name}
                        size={40}
                        fallbackText={a.institution_name ?? a.name}
                        style={styles.accountIcon}
                      />
                      <View style={styles.accountInfo}>
                        <Text style={[styles.bankName, { color: theme.text }]} numberOfLines={2}>
                          {stripEmoji(a.nickname ?? a.name)}
                        </Text>
                        <Text style={[styles.accountMask, { color: theme.textTertiary }]}>
                          {(a.subtype ?? a.type ?? "Account").replace(/_/g, " ")} ••••{a.mask ?? "****"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => toggleStar(a.id)}
                        hitSlop={12}
                        style={styles.starBtn}
                        accessibilityLabel={isStarred ? "Unstar account" : "Star account"}
                      >
                        <Ionicons
                          name={isStarred ? "star" : "star-outline"}
                          size={18}
                          color={isStarred ? "#F5A623" : theme.textTertiary}
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {accounts.length > ACCOUNTS_PREVIEW ? (
                <TouchableOpacity
                  onPress={() => setShowAllAccounts((v) => !v)}
                  style={[styles.showAllRow, { borderTopColor: theme.borderLight }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.showAllText, { color: theme.primary }]}>
                    {showAllAccounts ? "Show less" : `Show all · ${accounts.length} accounts`}
                  </Text>
                  <Ionicons
                    name={showAllAccounts ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={theme.primary}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          {linked ? (
            <>
              <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(`${base}/connect?update=1&from_app=1`)}>
                <Ionicons name="refresh-outline" size={18} color={theme.primary} />
                <Text style={[styles.linkInline, { color: theme.primary }]}>Update bank connection</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dangerOutline, { borderColor: theme.errorLight }]}
                onPress={disconnectBank}
                disabled={disconnecting}
              >
                <Text style={[styles.dangerText, { color: theme.error }]}>
                  {disconnecting ? "Disconnecting…" : "Disconnect all banks"}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* Splitwise import */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Splitwise</Text>
          <Text style={[styles.sectionBlurb, { color: theme.textTertiary }]}>
            Connect once in the browser, then import groups and expenses. After data is imported, you can disconnect to remove
            Coconut&apos;s copy and the saved token (your Splitwise account is unchanged).
          </Text>

          {splitwiseResult ? (
            <View
              style={[
                styles.resultBox,
                {
                  backgroundColor: splitwiseResult.ok ? "#EEF7F2" : "#FEE2E2",
                  borderColor: splitwiseResult.ok ? "#C3E0D3" : theme.errorLight,
                },
              ]}
            >
              <Text style={[styles.resultTitle, { color: splitwiseResult.ok ? theme.text : theme.error }]}>
                {splitwiseResult.ok ? "Import complete" : "Import failed"}
              </Text>
              {splitwiseResult.ok && splitwiseResult.stats ? (
                <Text style={[styles.resultDetail, { color: theme.textQuaternary }]}>
                  {splitwiseResult.stats.groups} groups · {splitwiseResult.stats.members} members ·{" "}
                  {splitwiseResult.stats.expenses} expenses
                </Text>
              ) : splitwiseResult.error ? (
                <Text style={[styles.resultDetail, { color: theme.textQuaternary }]}>{splitwiseResult.error}</Text>
              ) : null}
            </View>
          ) : null}

          {splitwiseLoading && splitwiseStatus === null ? (
            <ActivityIndicator style={{ marginTop: 14 }} color={theme.primary} />
          ) : splitwiseStatus === null ? (
            <Text style={[styles.muted, { color: theme.textQuaternary, marginTop: 8 }]}>
              Couldn&apos;t load Splitwise status. Check your connection and open Settings again.
            </Text>
          ) : !splitwiseStatus.configured ? (
            <Text style={[styles.muted, { color: theme.textQuaternary, marginTop: 8 }]}>
              Not available in this environment.
            </Text>
          ) : !splitwiseStatus.connected ? (
            <View style={{ gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                onPress={connectSplitwise}
                disabled={splitwiseImporting}
              >
                <Text style={styles.primaryBtnText}>Connect Splitwise</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 4 }}>
              {(splitwiseStatus?.importedSplitwiseGroupCount ?? 0) === 0 && !splitwiseResult?.ok ? (
                <Text style={[styles.muted, { color: theme.textTertiary, marginBottom: 4 }]}>
                  Splitwise is linked to your account, but nothing is imported yet. Open the Shared tab after import, or tap
                  Import now.
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }, splitwiseImporting && styles.disabled]}
                onPress={startSplitwiseImport}
                disabled={splitwiseImporting || splitwiseClearing}
              >
                {splitwiseImporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Import from Splitwise</Text>
                )}
              </TouchableOpacity>
              {hasSplitwiseImportedData ? (
                <TouchableOpacity
                  style={[
                    styles.splitwiseDisconnectBtn,
                    { borderColor: theme.errorLight, backgroundColor: theme.surfaceSecondary },
                  ]}
                  onPress={disconnectSplitwiseAndClear}
                  disabled={splitwiseClearing || splitwiseImporting}
                >
                  {splitwiseClearing ? (
                    <ActivityIndicator size="small" color={theme.error} />
                  ) : (
                    <Text style={[styles.splitwiseDisconnectBtnText, { color: theme.error }]}>
                      Disconnect &amp; remove saved login
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={removeSplitwiseSavedLogin}
                  disabled={splitwiseClearing || splitwiseImporting}
                  style={{ alignSelf: "flex-start", paddingVertical: 4 }}
                >
                  <Text style={{ color: theme.textQuaternary, fontSize: 14, textDecorationLine: "underline" }}>
                    Remove saved Splitwise login
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Email receipts */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Email receipts</Text>
          <Text style={[styles.sectionBlurb, { color: theme.textTertiary }]}>
            Connect Gmail to automatically match email receipts to your bank transactions.
          </Text>

          {gmailScanResult ? (
            <View
              style={[
                styles.resultBox,
                {
                  backgroundColor: gmailScanResult.ok ? "#EEF7F2" : "#FEE2E2",
                  borderColor: gmailScanResult.ok ? "#C3E0D3" : theme.errorLight,
                },
              ]}
            >
              <Text style={[styles.resultTitle, { color: gmailScanResult.ok ? theme.text : theme.error }]}>
                {gmailScanResult.ok
                  ? gmailScanResult.inserted === 0
                    ? "No new receipts"
                    : "Scan complete"
                  : "Scan failed"}
              </Text>
              {gmailScanResult.ok ? (
                <Text style={[styles.resultDetail, { color: theme.textQuaternary }]}>
                  {gmailScanResult.emailsFetched != null
                    ? `${gmailScanResult.emailsFetched} emails scanned · `
                    : ""}
                  {gmailScanResult.inserted ?? 0} new receipts · {gmailScanResult.matched ?? 0} matched
                  {gmailScanResult.isFirstScan ? " (last 90 days)" : ""}
                </Text>
              ) : gmailScanResult.error ? (
                <Text style={[styles.resultDetail, { color: theme.textQuaternary }]}>{gmailScanResult.error}</Text>
              ) : null}
            </View>
          ) : null}

          {!gmailStatus?.connected ? (
            <View style={{ gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                onPress={connectGmail}
                disabled={gmailScanning}
              >
                <Text style={styles.primaryBtnText}>Connect Gmail</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                {gmailStatus.email ? (
                  <Text style={[styles.muted, { color: theme.textTertiary }]}>{gmailStatus.email}</Text>
                ) : null}
                {gmailStatus.lastScanAt ? (
                  <Text style={[styles.muted, { color: theme.textQuaternary, fontSize: 12 }]}>
                    Last scan {new Date(gmailStatus.lastScanAt).toLocaleDateString()}
                  </Text>
                ) : (
                  <Text style={[styles.muted, { color: theme.textQuaternary, fontSize: 12 }]}>Never scanned</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }, gmailScanning && styles.disabled]}
                onPress={() => scanGmail()}
                disabled={gmailScanning || gmailDisconnecting}
              >
                {gmailScanning ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.primaryBtnText}>Scanning…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {!gmailStatus.lastScanAt ? "Scan receipts (last 90 days)" : "Scan new receipts"}
                  </Text>
                )}
              </TouchableOpacity>
              {gmailStatus.lastScanAt ? (
                <TouchableOpacity
                  style={[styles.splitwiseDisconnectBtn, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                  onPress={() => scanGmail(90)}
                  disabled={gmailScanning || gmailDisconnecting}
                >
                  <Text style={[styles.splitwiseDisconnectBtnText, { color: theme.textSecondary }]}>
                    Scan last 90 days
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.push("/(tabs)/email-receipts")}
              >
                <Ionicons name="mail-outline" size={16} color={theme.primary} />
                <Text style={[styles.linkInline, { color: theme.primary }]}>View all receipts</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.splitwiseDisconnectBtn, { borderColor: theme.errorLight, backgroundColor: theme.surfaceSecondary }]}
                onPress={disconnectGmail}
                disabled={gmailDisconnecting || gmailScanning}
              >
                {gmailDisconnecting ? (
                  <ActivityIndicator size="small" color={theme.error} />
                ) : (
                  <Text style={[styles.splitwiseDisconnectBtnText, { color: theme.error }]}>Disconnect Gmail</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.signOutButton,
            { borderColor: theme.errorLight, backgroundColor: theme.surfaceSecondary },
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.85}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={theme.error} />
          ) : (
            <Text style={[styles.signOutText, { color: theme.error }]}>Sign out</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: "700", fontFamily: font.bold, marginBottom: 20 },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    ...shadow.sm,
    padding: 18,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontFamily: font.semibold, marginBottom: 12 },
  sectionBlurb: { fontSize: 14, fontFamily: font.regular, lineHeight: 20, marginBottom: 12 },
  accountBlock: { marginBottom: 16 },
  profileName: { fontSize: 16, fontFamily: font.semibold },
  accountEmail: { fontSize: 14, fontFamily: font.regular, marginTop: 4 },
  fieldLabel: { fontSize: 13, fontFamily: font.medium, marginBottom: 8 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
  },
  segmentText: { fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  link: { fontSize: 15, fontFamily: font.semibold },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 8 },
  linkInline: { fontSize: 15, fontFamily: font.medium },
  linkCenter: { fontSize: 15, fontFamily: font.medium, textAlign: "center" },
  accountList: { marginTop: 4 },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  sortLabel: { fontSize: 12, fontFamily: font.medium },
  sortChips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortChipText: { fontSize: 12 },
  accountSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  accountSectionLabel: { fontSize: 11, fontFamily: font.semibold, textTransform: "uppercase", letterSpacing: 0.6 },
  starBtn: { padding: 6, marginLeft: 4 },
  showAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  showAllText: { fontSize: 14, fontFamily: font.semibold },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  accountIconText: { fontSize: 16, fontFamily: font.semibold, color: "#fff" },
  accountInfo: { flex: 1 },
  bankName: { fontSize: 14, fontFamily: font.semibold },
  accountMask: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  error: { fontSize: 14, fontFamily: font.regular, paddingVertical: 8 },
  muted: { fontSize: 14, fontFamily: font.regular },
  dangerOutline: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
  },
  dangerText: { fontSize: 15, fontFamily: font.medium },
  resultBox: { borderRadius: radii.md, borderWidth: 1, padding: 14, marginBottom: 8 },
  resultTitle: { fontSize: 15, fontFamily: font.semibold },
  resultDetail: { fontSize: 13, fontFamily: font.regular, marginTop: 6, lineHeight: 18 },
  primaryBtn: { paddingVertical: 14, borderRadius: radii.md, alignItems: "center", marginTop: 4 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: font.semibold },
  disabled: { opacity: 0.6 },
  splitwiseDisconnectBtn: {
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    borderWidth: 1,
  },
  splitwiseDisconnectBtnText: { fontSize: 16, fontFamily: font.semibold },
  signOutButton: {
    marginTop: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 52,
  },
  signOutText: { fontSize: 16, fontFamily: font.semibold },
});
