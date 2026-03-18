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
import { colors, font, fontSize, shadow, radii, space, type as T } from "../../lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-lemon.vercel.app";

type PlaidAccount = {
  account_id: string;
  name: string;
  type?: string;
  subtype?: string;
  mask?: string | null;
};

export default function SettingsScreen() {
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your account and preferences</Text>

        {/* Profile */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.firstName?.[0] ?? "")}{(user?.lastName?.[0] ?? "") || "?"}
            </Text>
          </View>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={email}
            editable={false}
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
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
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.sectionTitle}>Connected banks</Text>
            <TouchableOpacity onPress={() => Linking.openURL(connectUrl)}>
              <Text style={styles.link}>{linked ? "+ Add account" : "Connect bank"}</Text>
            </TouchableOpacity>
          </View>
          {accountsLoading ? (
            <ActivityIndicator color="#3D8E62" style={{ paddingVertical: 24 }} />
          ) : accountsError ? (
            <Text style={styles.error}>{accountsError}</Text>
          ) : !Array.isArray(accounts) || accounts.length === 0 ? (
            <Text style={styles.muted}>No accounts linked yet.</Text>
          ) : (
            <View style={styles.accountList}>
              {(Array.isArray(accounts) ? accounts : []).map((a) => (
                <View key={a.account_id} style={styles.accountRow}>
                  <View style={styles.accountIcon}>
                    <Text style={styles.accountIconText}>{a.name[0]}</Text>
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{a.name}</Text>
                    <Text style={styles.accountMask}>
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
            <Text style={styles.link}>Fix connection (re-auth at bank)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dangerButton, (disconnecting || wiping) && styles.buttonDisabled]}
            onPress={disconnectBank}
            disabled={disconnecting || wiping}
          >
            <Text style={styles.dangerText}>{disconnecting ? "Disconnecting…" : "Disconnect bank"}</Text>
          </TouchableOpacity>
        </View>

        {/* Tap to Pay — checklist 3.6 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tap to Pay</Text>
          <View style={styles.infoBox}>
            <Ionicons name="hardware-chip-outline" size={16} color="#3D8E62" />
            <Text style={styles.infoText}>
              Accept contactless payments with your iPhone. No reader required. Connect and accept terms in the Pay tab.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push("/(tabs)/pay")}
          >
            <Text style={styles.link}>Open Pay tab →</Text>
          </TouchableOpacity>
        </View>

        {/* Data & Security */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Data & security</Text>
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark" size={16} color="#3D8E62" />
            <Text style={styles.infoText}>
              Coconut uses read-only access. We never store banking credentials.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.dangerButton, (disconnecting || wiping) && styles.buttonDisabled]}
            onPress={wipeAllData}
            disabled={disconnecting || wiping}
          >
            <Text style={styles.dangerText}>{wiping ? "Wiping…" : "Wipe all data & start fresh"}</Text>
          </TouchableOpacity>
        </View>

        {/* Full settings in browser */}
        <TouchableOpacity
          style={styles.browserLink}
          onPress={() => Linking.openURL(webSettingsUrl)}
        >
          <Ionicons name="open-outline" size={16} color="#3D8E62" />
          <Text style={styles.browserLinkText}>Full settings (email, 2FA) in browser</Text>
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Text style={styles.signOutText}>Sign out</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: "700", fontFamily: font.bold, color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, fontFamily: font.regular, color: colors.textTertiary, marginBottom: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    ...shadow.md,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: "600", fontFamily: font.semibold, color: colors.text, marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: { fontSize: 20, fontWeight: "600", fontFamily: font.semibold, color: colors.surface },
  label: { fontSize: 13, fontWeight: "500", fontFamily: font.medium, color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    marginBottom: 16,
  },
  inputDisabled: { backgroundColor: colors.surfaceSecondary, color: colors.textTertiary },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: "600", fontFamily: font.semibold },
  accountList: { marginBottom: 12 },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  accountIconText: { fontSize: 16, fontWeight: "600", fontFamily: font.semibold, color: colors.surface },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 14, fontWeight: "600", fontFamily: font.semibold, color: colors.text },
  accountMask: { fontSize: 12, fontFamily: font.regular, color: colors.textTertiary, marginTop: 2 },
  link: { fontSize: 14, color: colors.primary, fontWeight: "500", fontFamily: font.medium },
  linkButton: { marginBottom: 12 },
  dangerButton: {
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.redBorder,
    backgroundColor: colors.redSurface,
    alignItems: "center",
    marginTop: 8,
  },
  dangerText: { fontSize: 14, color: colors.red, fontWeight: "500", fontFamily: font.medium },
  error: { fontSize: 13, fontFamily: font.regular, color: colors.red, marginBottom: 12 },
  muted: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, marginBottom: 12 },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: colors.primaryLight,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    padding: 14,
    marginBottom: 16,
  },
  infoText: { fontSize: 13, fontFamily: font.regular, color: colors.primaryDark, flex: 1, lineHeight: 20 },
  browserLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    marginBottom: 24,
  },
  browserLinkText: { fontSize: 14, color: colors.primary, fontWeight: "500", fontFamily: font.medium },
  signOutButton: { paddingVertical: 14, alignItems: "center" },
  signOutText: { fontSize: 15, color: colors.red, fontWeight: "500", fontFamily: font.medium },
});
