import { useState, useEffect, useRef } from "react";
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
import { useTheme } from "../../lib/theme-context";
import type { ThemeMode } from "../../lib/colors";
import { useDemoMode } from "../../lib/demo-mode-context";
import { colors, font, shadow, radii } from "../../lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-app.dev";

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
      a.nickname ?? a.name
    );
  };
  const [signingOut, setSigningOut] = useState(false);

  const [splitwiseStatus, setSplitwiseStatus] = useState<{
    configured: boolean;
    connected: boolean;
    connectedAt?: string | null;
  } | null>(null);
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
  const splitwiseParams = useLocalSearchParams<{
    splitwise?: string;
    import?: string;
    splitwise_error?: string;
  }>();
  const splitwiseErrorAlertShown = useRef(false);

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
      setAccounts(accountsList);
    } catch {
      setAccountsError("Failed to load accounts");
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
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

  const fetchSplitwiseStatus = async () => {
    if (!user) return;
    try {
      const res = await apiFetch("/api/splitwise/status");
      if (!res.ok) {
        setSplitwiseStatus(null);
        return;
      }
      const data = await res.json();
      setSplitwiseStatus(data);
    } catch {
      setSplitwiseStatus(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (!isFocused) return;
    void fetchSplitwiseStatus();
  }, [isFocused, user]);

  useEffect(() => {
    if (!user) return;
    if (splitwiseAutoImportStarted.current) return;
    if (splitwiseParams?.splitwise === "connected" && splitwiseParams?.import === "1") {
      splitwiseAutoImportStarted.current = true;
      void startSplitwiseImport();
    }
  }, [splitwiseParams?.splitwise, splitwiseParams?.import, user]);

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
   * GET /api/splitwise/auth-url returns JSON { url } — RN fetch usually follows 302 and drops Location,
   * so redirect: "manual" on /api/splitwise/auth does not work reliably.
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
      if (!res.ok) {
        if (res.status === 401) {
          Alert.alert("Sign in required", "Sign in to Coconut again, then tap Connect Splitwise.");
          return;
        }
        if (res.status === 503) {
          Alert.alert(
            "Splitwise unavailable",
            (data as { error?: string }).error ?? "Splitwise is not configured on the server.",
          );
          return;
        }
        Alert.alert(
          "Could not open Splitwise",
          (data as { error?: string }).error ?? "Check your connection and API URL, then try again.",
        );
        return;
      }
      const url = (data as { url?: string }).url;
      if (!url || typeof url !== "string") {
        Alert.alert("Could not open Splitwise", "Server did not return an authorization URL. Deploy the latest API.");
        return;
      }
      await Linking.openURL(url);
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

  const disconnectSplitwiseAndClear = () => {
    Alert.alert(
      "Disconnect Splitwise?",
      "Removes every Splitwise-imported group and expense from Coconut and disconnects your Splitwise login. Your Splitwise account is unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
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
          },
        },
      ]
    );
  };

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

        {/* Connected banks */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <View style={styles.row}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Connected banks</Text>
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
              {accounts.map((a) => (
                <TouchableOpacity
                  key={a.account_id}
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[styles.bankName, { color: theme.text }]}>
                        {a.nickname ?? a.name}
                      </Text>
                      <Ionicons name="pencil-outline" size={12} color={theme.textTertiary} />
                    </View>
                    <Text style={[styles.accountMask, { color: theme.textTertiary }]}>
                      {(a.subtype ?? a.type ?? "Account").replace(/_/g, " ")} ••••{a.mask ?? "****"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
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
            Connect once in the browser, then import groups and expenses. Disconnect removes Coconut&apos;s copy and your saved
            Splitwise login.
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

          {!splitwiseStatus?.configured ? (
            <Text style={[styles.muted, { color: theme.textQuaternary, marginTop: 8 }]}>
              Not available in this environment.
            </Text>
          ) : !splitwiseStatus?.connected ? (
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
                  <Text style={[styles.splitwiseDisconnectBtnText, { color: theme.error }]}>Disconnect Splitwise</Text>
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
