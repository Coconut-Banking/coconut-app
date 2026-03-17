import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useUser, useClerk } from "@clerk/expo";
import { useIsFocused } from "@react-navigation/native";
import { useApiFetch } from "../../lib/api";
import { useTransactions } from "../../hooks/useTransactions";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import type { ThemeMode } from "../../lib/colors";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-lemon.vercel.app";

type PlaidAccount = {
  account_id: string;
  name: string;
  type?: string;
  subtype?: string;
  mask?: string | null;
};

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const { theme, mode, setMode } = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const apiFetch = useApiFetch();
  const { linked } = useTransactions();
  const router = useRouter();
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.fullName ?? "");
      setEmail(user.primaryEmailAddress?.emailAddress ?? "");
    }
  }, [user]);

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
  }, [linked]); // Use refresh when linked so we get fresh accounts (fixes "no accounts" after multi-bank connect)

  // Refetch accounts when returning to this tab (e.g. after connecting a bank in browser)
  useEffect(() => {
    if (isFocused && !prevFocused.current && linked) {
      fetchAccounts(true);
    }
    prevFocused.current = isFocused;
  }, [isFocused, linked]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const [firstName, ...rest] = name.trim().split(" ");
      const lastName = rest.join(" ");
      await user.update({ firstName: firstName || "", lastName: lastName || "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const disconnectBank = () => {
    Alert.alert(
      "Disconnect bank",
      "You can reconnect anytime to get real transactions.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setDisconnecting(true);
            try {
              const res = await apiFetch("/api/plaid/disconnect", { method: "POST" });
              if (res.ok) {
                router.replace("/(tabs)");
              } else {
                Alert.alert("Error", "Failed to disconnect");
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

  const wipeAllData = () => {
    Alert.alert(
      "Wipe all data",
      "This will delete ALL transactions, accounts, and linked data. You'll need to reconnect your bank. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe",
          style: "destructive",
          onPress: async () => {
            setWiping(true);
            try {
              const res = await apiFetch("/api/plaid/wipe", { method: "POST" });
              if (res.ok) {
                router.replace("/(tabs)");
              } else {
                Alert.alert("Error", "Failed to wipe data");
              }
            } catch {
              Alert.alert("Error", "Failed to wipe data");
            } finally {
              setWiping(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut?.();
    } finally {
      setSigningOut(false);
    }
  };

  const base = API_URL.replace(/\/$/, "");
  const connectUrl = `${base}/connect?from_app=1`;
  const webSettingsUrl = `${base}/app/settings`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: theme.textTertiary }]}>Manage your account and preferences</Text>

        {/* Appearance */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.themeBtn,
                  { backgroundColor: theme.surfaceTertiary },
                  mode === opt.key && { backgroundColor: theme.primary },
                ]}
                onPress={() => setMode(opt.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.themeBtnText,
                    { color: theme.textTertiary },
                    mode === opt.key && { color: "#fff", fontWeight: "700" },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Profile */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Profile</Text>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>
              {(user?.firstName?.[0] ?? "")}{(user?.lastName?.[0] ?? "") || "?"}
            </Text>
          </View>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Full name</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.border, color: theme.text }]}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={theme.inputPlaceholder}
          />
          <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary, color: theme.textTertiary }]}
            value={email}
            editable={false}
            placeholderTextColor={theme.inputPlaceholder}
          />
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }, saving && styles.buttonDisabled]}
            onPress={handleSaveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{saved ? "Saved" : "Save changes"}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Banks */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <View style={styles.row}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Connected banks</Text>
            <TouchableOpacity onPress={() => Linking.openURL(connectUrl)}>
              <Text style={[styles.link, { color: theme.primary }]}>{linked ? "+ Add account" : "Connect bank"}</Text>
            </TouchableOpacity>
          </View>
          {accountsLoading ? (
            <ActivityIndicator color={theme.primary} style={{ paddingVertical: 24 }} />
          ) : accountsError ? (
            <Text style={[styles.error, { color: theme.error }]}>{accountsError}</Text>
          ) : !Array.isArray(accounts) || accounts.length === 0 ? (
            <Text style={[styles.muted, { color: theme.textQuaternary }]}>No accounts linked yet.</Text>
          ) : (
            <View style={styles.accountList}>
              {(Array.isArray(accounts) ? accounts : []).map((a) => (
                <View key={a.account_id} style={[styles.accountRow, { borderBottomColor: theme.borderLight }]}>
                  <View style={[styles.accountIcon, { backgroundColor: theme.primary }]}>
                    <Text style={styles.accountIconText}>{a.name[0]}</Text>
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountName, { color: theme.text }]}>{a.name}</Text>
                    <Text style={[styles.accountMask, { color: theme.textTertiary }]}>
                      {(a.subtype ?? a.type ?? "account").replace(/_/g, " ")} ••••{a.mask ?? "****"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => Linking.openURL(`${base}/connect?update=1&from_app=1`)}
          >
            <Text style={[styles.link, { color: theme.primary }]}>Fix connection (re-auth at bank)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dangerButton, { borderColor: theme.errorLight, backgroundColor: theme.errorLight }, (disconnecting || wiping) && styles.buttonDisabled]}
            onPress={disconnectBank}
            disabled={disconnecting || wiping}
          >
            <Text style={[styles.dangerText, { color: theme.error }]}>{disconnecting ? "Disconnecting…" : "Disconnect bank"}</Text>
          </TouchableOpacity>
        </View>

        {/* Data & Security */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Data & security</Text>
          <View style={[styles.infoBox, { backgroundColor: theme.primaryLight, borderColor: theme.primaryLight }]}>
            <Ionicons name="shield-checkmark" size={16} color={theme.primary} />
            <Text style={[styles.infoText, { color: theme.primary }]}>
              Coconut uses read-only access. We never store banking credentials.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.dangerButton, { borderColor: theme.errorLight, backgroundColor: theme.errorLight }, (disconnecting || wiping) && styles.buttonDisabled]}
            onPress={wipeAllData}
            disabled={disconnecting || wiping}
          >
            <Text style={[styles.dangerText, { color: theme.error }]}>{wiping ? "Wiping…" : "Wipe all data & start fresh"}</Text>
          </TouchableOpacity>
        </View>

        {/* Full settings in browser */}
        <TouchableOpacity
          style={styles.browserLink}
          onPress={() => Linking.openURL(webSettingsUrl)}
        >
          <Ionicons name="open-outline" size={16} color={theme.primary} />
          <Text style={[styles.browserLinkText, { color: theme.primary }]}>Full settings (email, 2FA) in browser</Text>
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={theme.error} />
          ) : (
            <Text style={[styles.signOutText, { color: theme.error }]}>Sign out</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  themeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  themeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  themeBtnText: {
    fontSize: 14,
    fontWeight: "500",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: { fontSize: 20, fontWeight: "600", color: "#fff" },
  label: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  inputDisabled: {},
  button: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  accountList: { marginBottom: 12 },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  accountIconText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 14, fontWeight: "600" },
  accountMask: { fontSize: 12, marginTop: 2 },
  link: { fontSize: 14, fontWeight: "500" },
  linkButton: { marginBottom: 12 },
  dangerButton: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    marginTop: 8,
  },
  dangerText: { fontSize: 14, fontWeight: "500" },
  error: { fontSize: 13, marginBottom: 12 },
  muted: { fontSize: 13, marginBottom: 12 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  infoText: { fontSize: 13, flex: 1, lineHeight: 20 },
  browserLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    marginBottom: 24,
  },
  browserLinkText: { fontSize: 14, fontWeight: "500" },
  signOutButton: { paddingVertical: 14, alignItems: "center" },
  signOutText: { fontSize: 15, fontWeight: "500" },
});
