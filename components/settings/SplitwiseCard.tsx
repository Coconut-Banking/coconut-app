import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Linking,
  InteractionManager,
  AppState,
  Platform,
  type AppStateStatus,
} from "react-native";
import { useUser } from "@clerk/expo";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useTheme } from "../../lib/theme-context";
import { useApiFetch, invalidateApiCache } from "../../lib/api";
import {
  clearMemSummaryCache,
  clearMemActivityCache,
} from "../../hooks/useGroups";
import { settingsStyles as s } from "./styles";
import type { UninvitedMember } from "./InviteModal";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-app.dev";

type Props = {
  onShowInvites: (members: UninvitedMember[]) => void;
};

export function SplitwiseCard({ onShowInvites }: Props) {
  const { theme } = useTheme();
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const isFocused = useIsFocused();
  const router = useRouter();
  const params = useLocalSearchParams<{
    splitwise?: string;
    import?: string;
    splitwise_error?: string;
  }>();

  const [splitwiseStatus, setSplitwiseStatus] = useState<{
    configured: boolean;
    connected: boolean;
    connectedAt?: string | null;
    importedSplitwiseGroupCount?: number;
  } | null>(null);
  const [splitwiseLoading, setSplitwiseLoading] = useState(false);
  const [splitwiseImporting, setSplitwiseImporting] = useState(false);
  const [splitwiseClearing, setSplitwiseClearing] = useState(false);
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
  const splitwiseErrorAlertShown = useRef(false);

  useEffect(() => {
    splitwiseStatusRef.current = splitwiseStatus;
  }, [splitwiseStatus]);

  const hasSplitwiseImportedData = useMemo(
    () =>
      (splitwiseStatus?.importedSplitwiseGroupCount ?? 0) > 0 ||
      Boolean(splitwiseResult?.ok),
    [splitwiseStatus?.importedSplitwiseGroupCount, splitwiseResult?.ok],
  );

  const fetchSplitwiseStatus = useCallback(
    async (opts?: { showLoading?: boolean }) => {
      if (!user) return;
      const showBlockingLoad =
        opts?.showLoading === true && splitwiseStatusRef.current === null;
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
          typeof (data as { configured?: unknown }).configured !==
            "boolean" ||
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
    [user, apiFetch],
  );

  useEffect(() => {
    if (!user || !isFocused) return;
    void fetchSplitwiseStatus({ showLoading: true });
  }, [isFocused, user, fetchSplitwiseStatus]);

  useEffect(() => {
    if (!user) return;
    const onChange = (st: AppStateStatus) => {
      if (st === "active" && isFocused) void fetchSplitwiseStatus();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [user, isFocused, fetchSplitwiseStatus]);

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

      const members = (data as { uninvitedMembers?: UninvitedMember[] })
        .uninvitedMembers;
      if (members && members.length > 0) {
        setTimeout(() => onShowInvites(members), 500);
      }
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
        params?.splitwise === "connected" ||
        params?.import === "1" ||
        Boolean(params?.splitwise_error);
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
        Alert.alert(
          "Could not disconnect",
          (data as { error?: string }).error ?? "Try again.",
        );
        return;
      }
      setSplitwiseResult(null);
      invalidateApiCache("/api/splitwise/status");
      invalidateApiCache("/api/groups/summary");
      invalidateApiCache("/api/groups/recent-activity");
      clearMemSummaryCache();
      clearMemActivityCache();
      DeviceEventEmitter.emit("groups-updated");
      await fetchSplitwiseStatus();
    } catch {
      Alert.alert(
        "Error",
        "Could not disconnect. Check your connection.",
      );
    } finally {
      setSplitwiseClearing(false);
    }
  };

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
      ],
    );
  };

  const removeSplitwiseSavedLogin = () => {
    Alert.alert(
      "Remove saved login?",
      "Coconut will forget your Splitwise authorization. You haven't imported groups yet, so nothing is removed from Shared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void runSplitwiseClearAndRefresh(),
        },
      ],
    );
  };

  const connectSplitwise = async () => {
    splitwiseAutoImportStarted.current = false;
    const rawScheme = Constants.expoConfig?.scheme;
    const scheme =
      typeof rawScheme === "string"
        ? rawScheme
        : Array.isArray(rawScheme)
          ? rawScheme[0] ?? "coconut"
          : "coconut";
    const qs = new URLSearchParams({ app: "1", scheme });
    const path = `/api/splitwise/auth-url?${qs.toString()}`;
    try {
      const res = await apiFetch(path);
      const data = await res.json().catch(() => ({}));
      const serverErr = (data as { error?: string }).error?.trim();
      if (!res.ok) {
        if (res.status === 401) {
          Alert.alert(
            "Sign in required",
            "Sign in to Coconut again, then tap Connect Splitwise.",
          );
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
            "Splitwise can't start",
            `This server doesn't have the app Splitwise endpoint (404). Point EXPO_PUBLIC_API_URL at your latest Coconut deployment (same URL as the web app), rebuild the app, and try again.\n\nCurrent API: ${API_URL.replace(/\/$/, "")}`,
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
            Alert.alert(
              "Connection problem",
              msg || "Check your network and try again.",
            );
            return;
          }
          Alert.alert(
            "Splitwise unavailable",
            msg ||
              "Splitwise is not configured on the server (missing SPLITWISE_CLIENT_ID / SECRET on Vercel).",
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
        Alert.alert(
          "Could not open Splitwise",
          "Server did not return an authorization URL. Deploy the latest API.",
        );
        return;
      }

      const callbackUrl = `${scheme}://splitwise-callback`;

      if (Platform.OS === "web") {
        await Linking.openURL(url);
        return;
      }

      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      let result: WebBrowser.WebBrowserAuthSessionResult;
      try {
        result = await WebBrowser.openAuthSessionAsync(url, callbackUrl, {
          preferEphemeralSession: true,
        });
      } catch (e) {
        if (__DEV__)
          console.warn("[splitwise] openAuthSessionAsync failed", e);
        const canOpen = await Linking.canOpenURL(url).catch(() => false);
        if (canOpen) {
          Alert.alert(
            "Open Splitwise",
            "In-app sign-in didn't start. Open Splitwise in your browser instead?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open browser",
                onPress: () => void Linking.openURL(url),
              },
            ],
          );
        } else {
          Alert.alert(
            "Could not open Splitwise",
            "Something went wrong. Please try again.",
          );
        }
        return;
      }

      if (result.type !== "success") {
        const hint =
          result.type === "cancel"
            ? "Sign-in was cancelled or the sign-in window didn't appear."
            : "The sign-in window closed before finishing.";
        Alert.alert(
          "Splitwise sign-in",
          `${hint} Try again, or open Splitwise in your browser to continue.`,
          [
            { text: "OK", style: "cancel" },
            {
              text: "Open browser",
              onPress: () => void Linking.openURL(url),
            },
          ],
        );
        return;
      }

      try {
        const returned = new URL(result.url);
        if (returned.searchParams.get("error")) {
          Alert.alert(
            "Splitwise",
            "Authorization was cancelled or denied.",
          );
          return;
        }
      } catch {
        /* ignore malformed return URL */
      }

      const verifyRes = await apiFetch("/api/splitwise/status");
      if (!verifyRes.ok) {
        Alert.alert(
          "Splitwise",
          "Could not verify the connection. Pull to refresh on Settings.",
        );
        return;
      }
      const st = (await verifyRes.json()) as {
        configured?: boolean;
        connected?: boolean;
        connectedAt?: string | null;
        importedSplitwiseGroupCount?: unknown;
      };
      if (
        typeof st.configured !== "boolean" ||
        typeof st.connected !== "boolean"
      ) {
        Alert.alert(
          "Splitwise",
          "Could not verify the connection. Pull to refresh on Settings.",
        );
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
      Alert.alert(
        "Could not open Splitwise",
        "Something went wrong. Please try again.",
      );
    }
  };

  useEffect(() => {
    if (!user) return;
    if (splitwiseAutoImportStarted.current) return;
    if (
      params?.splitwise === "connected" &&
      params?.import === "1"
    ) {
      splitwiseAutoImportStarted.current = true;
      void startSplitwiseImport();
    }
  }, [params?.splitwise, params?.import, user]);

  useEffect(() => {
    const err = params?.splitwise_error;
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
  }, [params?.splitwise_error, router]);

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <Text style={[s.sectionTitle, { color: theme.text }]}>Splitwise</Text>
      <Text style={[s.sectionBlurb, { color: theme.textTertiary }]}>
        Connect once in the browser, then import groups and expenses. After
        data is imported, you can disconnect to remove Coconut&apos;s copy and
        the saved token (your Splitwise account is unchanged).
      </Text>

      {splitwiseResult ? (
        <View
          style={[
            s.resultBox,
            {
              backgroundColor: splitwiseResult.ok
                ? theme.primaryLight
                : theme.errorLight,
              borderColor: splitwiseResult.ok
                ? theme.border
                : theme.error,
            },
          ]}
        >
          <Text
            style={[
              s.resultTitle,
              {
                color: splitwiseResult.ok ? theme.text : theme.error,
              },
            ]}
          >
            {splitwiseResult.ok ? "Import complete" : "Import failed"}
          </Text>
          {splitwiseResult.ok && splitwiseResult.stats ? (
            <Text
              style={[s.resultDetail, { color: theme.textQuaternary }]}
            >
              {splitwiseResult.stats.groups} groups ·{" "}
              {splitwiseResult.stats.members} members ·{" "}
              {splitwiseResult.stats.expenses} expenses
            </Text>
          ) : splitwiseResult.error ? (
            <Text
              style={[s.resultDetail, { color: theme.textQuaternary }]}
            >
              {splitwiseResult.error}
            </Text>
          ) : null}
        </View>
      ) : null}

      {splitwiseLoading && splitwiseStatus === null ? (
        <ActivityIndicator style={{ marginTop: 14 }} color={theme.text} />
      ) : splitwiseStatus === null ? (
        <Text
          style={[
            s.muted,
            { color: theme.textQuaternary, marginTop: 8 },
          ]}
        >
          Couldn&apos;t load Splitwise status. Check your connection and
          open Settings again.
        </Text>
      ) : !splitwiseStatus.configured ? (
        <Text
          style={[
            s.muted,
            { color: theme.textQuaternary, marginTop: 8 },
          ]}
        >
          Not available in this environment.
        </Text>
      ) : !splitwiseStatus.connected ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={connectSplitwise}
            disabled={splitwiseImporting}
          >
            <Text style={s.primaryBtnText}>Connect Splitwise</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 12, marginTop: 4 }}>
          {(splitwiseStatus?.importedSplitwiseGroupCount ?? 0) === 0 &&
          !splitwiseResult?.ok ? (
            <>
              <Text
                style={[
                  s.muted,
                  { color: theme.textTertiary, marginBottom: 4 },
                ]}
              >
                Splitwise is linked to your account, but nothing is
                imported yet. Open the Shared tab after import, or tap
                Import now.
              </Text>
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  { backgroundColor: theme.primary },
                  splitwiseImporting && s.disabled,
                ]}
                onPress={startSplitwiseImport}
                disabled={splitwiseImporting || splitwiseClearing}
              >
                {splitwiseImporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.primaryBtnText}>
                    Import from Splitwise
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <Text
              style={[
                s.muted,
                { color: theme.textTertiary, marginBottom: 4 },
              ]}
            >
              {splitwiseStatus?.importedSplitwiseGroupCount ?? 0} group
              {(splitwiseStatus?.importedSplitwiseGroupCount ?? 0) !== 1
                ? "s"
                : ""}{" "}
              imported. Sync to refresh balances from Splitwise.
            </Text>
          )}
          {(splitwiseStatus?.importedSplitwiseGroupCount ?? 0) > 0 ? (
            <TouchableOpacity
              style={[
                s.primaryBtn,
                { backgroundColor: theme.primary },
                splitwiseImporting && s.disabled,
              ]}
              onPress={startSplitwiseImport}
              disabled={splitwiseImporting || splitwiseClearing}
            >
              {splitwiseImporting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>
                  Sync from Splitwise
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
          {hasSplitwiseImportedData ? (
            <TouchableOpacity
              style={[
                s.disconnectBtn,
                {
                  borderColor: theme.errorLight,
                  backgroundColor: theme.surfaceSecondary,
                },
              ]}
              onPress={disconnectSplitwiseAndClear}
              disabled={splitwiseClearing || splitwiseImporting}
            >
              {splitwiseClearing ? (
                <ActivityIndicator size="small" color={theme.error} />
              ) : (
                <Text
                  style={[
                    s.disconnectBtnText,
                    { color: theme.error },
                  ]}
                >
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
              <Text
                style={{
                  color: theme.textQuaternary,
                  fontSize: 14,
                  textDecorationLine: "underline",
                }}
              >
                Remove saved Splitwise login
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
