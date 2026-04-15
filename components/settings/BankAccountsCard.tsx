import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useTheme } from "../../lib/theme-context";
import { useApiFetch, invalidateApiCache } from "../../lib/api";
import { usePlaidLinked } from "../../hooks/usePlaidLinked";
import { MerchantLogo } from "../merchant/MerchantLogo";
import { font, radii } from "../../lib/theme";
import { settingsStyles as s } from "./styles";

function stripEmoji(str: string): string {
  return str
    .replace(/\p{Emoji_Presentation}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
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

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-app.dev";
const ACCOUNTS_PREVIEW = 5;

export function BankAccountsCard() {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const { linked } = usePlaidLinked();
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);
  const prevLinked = useRef(linked);

  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  const base = API_URL.replace(/\/$/, "");
  const rawScheme = Constants.expoConfig?.scheme;
  const appScheme =
    typeof rawScheme === "string"
      ? rawScheme
      : Array.isArray(rawScheme)
        ? rawScheme[0] ?? "coconut"
        : "coconut";
  const connectUrl = `${base}/connect?from_app=1&scheme=${appScheme}`;

  const fetchAccounts = useCallback(
    async (forceRefresh = false) => {
      setAccountsLoading(true);
      setAccountsError(null);
      try {
        const url = forceRefresh
          ? "/api/plaid/accounts?refresh=1"
          : "/api/plaid/accounts";
        const res = await apiFetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setAccountsError(body.error ?? "Failed to load");
          setAccounts([]);
          return;
        }
        const data = await res.json();
        const accountsList = Array.isArray(data?.accounts)
          ? data.accounts
          : [];
        if (__DEV__)
          console.log(
            "[accounts] total:",
            accountsList.length,
            accountsList.map(
              (a: PlaidAccount) =>
                `${a.institution_name ?? "?"} | ${a.name} | ${a.subtype ?? a.type} ••••${a.mask}`,
            ),
          );
        setAccounts(accountsList);
      } catch {
        setAccountsError("Failed to load accounts");
        setAccounts([]);
      } finally {
        setAccountsLoading(false);
      }
    },
    [apiFetch],
  );

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
                  acc.id === a.id ? { ...acc, nickname } : acc,
                ),
              );
              invalidateApiCache("/api/plaid/transactions");
              invalidateApiCache("/api/plaid/accounts");
            } catch {
              Alert.alert("Error", "Could not save nickname.");
            }
          },
        },
      ],
      "plain-text",
      stripEmoji(a.nickname ?? a.name),
    );
  };

  const openBankConnect = async (url: string) => {
    const callbackUrl = `${appScheme}://connected`;
    await WebBrowser.openAuthSessionAsync(url, callbackUrl);
    invalidateApiCache("/api/plaid/status");
    fetchAccounts(true);
  };

  const disconnectBank = () => {
    Alert.alert("Disconnect bank", "You can reconnect anytime from here.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          setDisconnecting(true);
          try {
            const res = await apiFetch("/api/plaid/disconnect", {
              method: "POST",
            });
            if (!res.ok) {
              Alert.alert("Error", "Failed to disconnect");
            } else {
              DeviceEventEmitter.emit("bank-disconnected");
              Alert.alert(
                "Bank disconnected",
                "You can link a bank again from the Home tab or Connect flow.",
              );
            }
          } catch {
            Alert.alert("Error", "Failed to disconnect");
          } finally {
            setDisconnecting(false);
          }
        },
      },
    ]);
  };

  useEffect(() => {
    const wasFocused = prevFocused.current;
    const wasLinked = prevLinked.current;
    prevFocused.current = isFocused;
    prevLinked.current = linked;
    if (!isFocused) return;
    if (!wasFocused) {
      fetchAccounts(linked);
    } else if (linked && !wasLinked) {
      fetchAccounts(true);
    }
  }, [isFocused, linked, fetchAccounts]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "bank-disconnected",
      async () => {
        setAccounts([]);
        setAccountsLoading(true);
        setAccountsError(null);
        try {
          const res = await apiFetch("/api/plaid/accounts");
          const body = await res.json().catch(() => ({}));
          if (res.ok) {
            setAccounts(
              Array.isArray(body?.accounts) ? body.accounts : [],
            );
          } else {
            setAccountsError(
              (body as { error?: string }).error ?? "Failed to load",
            );
            setAccounts([]);
          }
        } catch {
          setAccountsError("Failed to load accounts");
          setAccounts([]);
        } finally {
          setAccountsLoading(false);
        }
      },
    );
    return () => sub.remove();
  }, [apiFetch]);

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <View style={s.row}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}
          >
            Connected banks
          </Text>
          <TouchableOpacity
            onPress={() => fetchAccounts(true)}
            hitSlop={10}
            disabled={accountsLoading}
          >
            <Ionicons
              name="refresh-outline"
              size={16}
              color={
                accountsLoading ? theme.textTertiary : theme.textSecondary
              }
            />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => openBankConnect(connectUrl)}
          hitSlop={8}
        >
          <Text style={[styles.link, { color: theme.accent }]}>
            {linked ? "Add account" : "Connect"}
          </Text>
        </TouchableOpacity>
      </View>

      {accountsLoading ? (
        <ActivityIndicator
          color={theme.text}
          style={{ paddingVertical: 20 }}
        />
      ) : accountsError ? (
        <Text style={[styles.error, { color: theme.error }]}>
          {accountsError}
        </Text>
      ) : accounts.length === 0 ? (
        <Text style={[s.muted, { color: theme.textQuaternary }]}>
          No bank accounts linked.
        </Text>
      ) : (
        <View style={styles.accountList}>
          {(showAllAccounts
            ? accounts
            : accounts.slice(0, ACCOUNTS_PREVIEW)
          ).map((a) => (
            <TouchableOpacity
              key={a.account_id}
              style={[
                styles.accountRow,
                { borderBottomColor: theme.borderLight },
              ]}
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
                <Text
                  style={[styles.bankName, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {stripEmoji(a.nickname ?? a.name)}
                </Text>
                <Text
                  style={[styles.accountMask, { color: theme.textTertiary }]}
                >
                  {(a.subtype ?? a.type ?? "Account").replace(/_/g, " ")}{" "}
                  ••••{a.mask ?? "****"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          {accounts.length > ACCOUNTS_PREVIEW ? (
            <TouchableOpacity
              onPress={() => setShowAllAccounts((v) => !v)}
              style={[
                styles.showAllRow,
                { borderTopColor: theme.borderLight },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.showAllText, { color: theme.accent }]}>
                {showAllAccounts
                  ? "Show less"
                  : `Show all · ${accounts.length} accounts`}
              </Text>
              <Ionicons
                name={showAllAccounts ? "chevron-up" : "chevron-down"}
                size={14}
                color={theme.text}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {linked ? (
        <>
          <TouchableOpacity
            style={s.linkRow}
            onPress={() =>
              openBankConnect(
                `${base}/connect?update=1&from_app=1&scheme=${appScheme}`,
              )
            }
          >
            <Ionicons name="refresh-outline" size={18} color={theme.text} />
            <Text style={[s.linkInline, { color: theme.accent }]}>
              Update bank connection
            </Text>
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
  );
}

const styles = StyleSheet.create({
  link: { fontSize: 15, fontFamily: font.semibold },
  error: { fontSize: 14, fontFamily: font.regular, paddingVertical: 8 },
  accountList: { marginTop: 4 },
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
  accountInfo: { flex: 1 },
  bankName: { fontSize: 14, fontFamily: font.semibold },
  accountMask: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  dangerOutline: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
  },
  dangerText: { fontSize: 15, fontFamily: font.medium },
});
