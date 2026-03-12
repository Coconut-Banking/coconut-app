import { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  Pressable,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useClerk, useUser } from "@clerk/expo";
import { useApiFetch } from "../../lib/api";
import { useTransactions, type Transaction } from "../../hooks/useTransactions";
import { useSubscriptions } from "../../hooks/useSubscriptions";
import { useGroupsSummary } from "../../hooks/useGroups";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-lemon.vercel.app";

const MERCHANT_COLORS = [
  "#E50914", "#1DB954", "#00674B", "#FF9900", "#003366", "#7BB848",
  "#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#FF5A5F", "#9B59B6",
];

function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return MERCHANT_COLORS[Math.abs(h) % MERCHANT_COLORS.length];
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

type ApiTransaction = {
  id?: string;
  plaid_transaction_id?: string;
  merchant_name?: string | null;
  raw_name?: string | null;
  amount?: number;
  date?: string;
  primary_category?: string | null;
};

function mapApiTx(t: ApiTransaction): Transaction {
  const merchant = t.merchant_name || t.raw_name || "Unknown";
  const category = (t.primary_category ?? "OTHER").replace(/_/g, " ");
  return {
    id: t.plaid_transaction_id ?? t.id ?? String(Math.random()),
    merchant,
    rawDescription: t.raw_name ?? "",
    amount: t.amount ?? 0,
    category,
    categoryColor: "bg-gray-100",
    date: t.date ?? "",
    dateStr: t.date ? fmtDate(t.date) : "",
    merchantColor: hashColor(merchant),
  };
}

type SearchMode = "exact" | "semantic";

function MerchantAvatar({ name, color }: { name: string; color: string }) {
  const initial = (name[0] || "").toUpperCase();
  return (
    <View style={[styles.avatar, { backgroundColor: color }]}>
      <Text style={styles.avatarText}>{initial || "$"}</Text>
    </View>
  );
}

function TransactionRow({ tx, onPress }: { tx: Transaction; onPress?: () => void }) {
  return (
    <Pressable style={styles.txRow} onPress={onPress}>
      <MerchantAvatar name={tx.merchant} color={tx.merchantColor} />
      <View style={styles.txInfo}>
        <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
        <Text style={styles.txCategory}>{tx.category}</Text>
      </View>
      <View style={styles.txRight}>
        <Text style={styles.txAmount}>${Math.abs(tx.amount).toFixed(2)}</Text>
        <Text style={styles.txDate}>{tx.dateStr}</Text>
      </View>
    </Pressable>
  );
}

function deriveMonthlySpend(transactions: Transaction[]): number {
  const thisMonth = new Date().toISOString().slice(0, 7);
  return transactions
    .filter((tx) => tx.date.startsWith(thisMonth))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
}

function filterExact(transactions: Transaction[], q: string): Transaction[] {
  const lower = q.trim().toLowerCase();
  if (!lower) return transactions;
  return transactions.filter(
    (tx) =>
      tx.merchant.toLowerCase().includes(lower) ||
      tx.category.toLowerCase().includes(lower) ||
      (tx.rawDescription && tx.rawDescription.toLowerCase().includes(lower))
  );
}

export default function HomeScreen() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const { transactions, linked, loading, status, refetch } = useTransactions();
  const { subscriptions } = useSubscriptions();
  const { summary: groupsSummary } = useGroupsSummary();

  const [searchMode, setSearchMode] = useState<SearchMode>("exact");
  const [searchQuery, setSearchQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<Transaction[] | null>(null);
  const [semanticSearching, setSemanticSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);

  useEffect(() => {
    if (!isFocused) setShowFabMenu(false);
  }, [isFocused]);

  // Refetch when returning to this tab (e.g. from connected screen after bank link)
  useEffect(() => {
    if (isFocused && !prevFocused.current) {
      refetch(true);
    }
    prevFocused.current = isFocused;
  }, [isFocused, refetch]);

  const monthlySpend = useMemo(() => deriveMonthlySpend(transactions), [transactions]);
  const subsTotal = useMemo(
    () => subscriptions.reduce((s, sub) => s + sub.amount, 0),
    [subscriptions]
  );
  const sharedNet = groupsSummary
    ? groupsSummary.totalOwedToMe - groupsSummary.totalIOwe
    : 0;

  const recentTransactions = transactions.slice(0, 50);

  const [hasSearchedSemantic, setHasSearchedSemantic] = useState(false);
  const [semanticAnswer, setSemanticAnswer] = useState<string>("");

  const displayTransactions = useMemo(() => {
    if (searchMode === "exact") {
      return filterExact(recentTransactions, searchQuery);
    }
    if (hasSearchedSemantic && semanticResults !== null) return semanticResults;
    return recentTransactions;
  }, [searchMode, semanticResults, recentTransactions, searchQuery, hasSearchedSemantic]);

  const runSemanticSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSemanticResults(null);
      setHasSearchedSemantic(false);
      setSemanticAnswer("");
      return;
    }
    setSemanticSearching(true);
    setHasSearchedSemantic(true);
    setSemanticAnswer("");
    try {
      const res = await apiFetch("/api/nl-search", {
        method: "POST",
        body: { q },
      });
      const data = await res.json();
      const raw = data.transactions ?? [];
      const txs = Array.isArray(raw) ? raw.map(mapApiTx) : [];
      setSemanticResults(txs);
      setSemanticAnswer(data.answer ?? "");
    } catch {
      setSemanticResults([]);
      setSemanticAnswer("Search failed.");
    } finally {
      setSemanticSearching(false);
    }
  };

  const openConnect = () =>
    Linking.openURL(`${API_URL.replace(/\/$/, "")}/connect-from-app`);
  const openSettings = () => Linking.openURL(`${API_URL.replace(/\/$/, "")}/app/settings`);

  // Loading — never show dashboard until we know linked status
  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3D8E62" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Not linked — show Connect CTA only; never show dashboard
  if (!linked) {
    const accountHint =
      status === "unauthorized"
        ? "Sign in with the same account you used on the website."
        : status === "not_linked"
          ? "Connected on a different account? Sign in with that email here."
          : null;

    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.connectCard}>
          <Ionicons name="wallet-outline" size={48} color="#3D8E62" />
          <Text style={styles.connectTitle}>Connect your bank</Text>
          {user?.primaryEmailAddress?.emailAddress ? (
            <Text style={styles.connectAccountEmail}>
              Signed in as {user.primaryEmailAddress.emailAddress}
            </Text>
          ) : null}
          <Text style={styles.connectSubtitle}>
            Link your account to see spending, transactions, and split receipts with friends.
          </Text>
          <Text style={styles.connectHint}>
            When you tap &quot;Connect in web app&quot;, sign in on the web with this same account before connecting your bank.
          </Text>
          {accountHint ? (
            <Text style={styles.connectHintImportant}>{accountHint}</Text>
          ) : null}
          <Text style={styles.connectHint}>
            Important: Stay in the browser until you see &quot;Bank connected!&quot; and tap &quot;Return to app&quot;.
            Don&apos;t close early on Plaid&apos;s &quot;Continue to Coconut&quot; screen.
          </Text>
          <TouchableOpacity style={styles.connectButton} onPress={openConnect}>
            <Text style={styles.connectButtonText}>Connect in web app</Text>
            <Ionicons name="open-outline" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.connectRefreshButton}
            onPress={() => {
              setRefreshing(true);
              refetch(true).finally(() => setRefreshing(false));
            }}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#3D8E62" />
            ) : (
              <Ionicons name="refresh" size={16} color="#3D8E62" />
            )}
            <Text style={styles.connectRefreshText}>
              {refreshing ? "Checking..." : "Just connected? Tap to refresh"}
            </Text>
          </TouchableOpacity>
          {signOut ? (
            <TouchableOpacity
              style={styles.connectSignOutButton}
              onPress={async () => {
                if (signingOut) return;
                setSigningOut(true);
                try {
                  await signOut();
                } finally {
                  setSigningOut(false);
                }
              }}
              disabled={signingOut}
            >
              {signingOut ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color="#6B7280" />
                  <Text style={styles.connectSignOutText}>Signing out…</Text>
                </View>
              ) : (
                <Text style={styles.connectSignOutText}>
                  {accountHint ? "Sign out &amp; switch account" : "Sign out"}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  // Linked — show dashboard
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Good {new Date().getHours() < 12 ? "morning" : "afternoon"}
            </Text>
            <Text style={styles.subGreeting}>
              {new Date().toLocaleString("en", { month: "long", year: "numeric" })}
            </Text>
          </View>
          <TouchableOpacity onPress={openSettings} style={styles.settingsBtn} hitSlop={12}>
            <Ionicons name="settings-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* 3 metric panels */}
        <View style={styles.panels}>
          <View style={styles.panel}>
            <View style={[styles.panelIcon, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="trending-down" size={18} color="#DC2626" />
            </View>
            <Text style={styles.panelValue}>${monthlySpend.toLocaleString()}</Text>
            <Text style={styles.panelLabel}>This month</Text>
          </View>
          <View style={styles.panel}>
            <View style={[styles.panelIcon, { backgroundColor: "#F3E8FF" }]}>
              <Ionicons name="refresh" size={18} color="#7C3AED" />
            </View>
            <Text style={styles.panelValue}>${subsTotal.toFixed(0)}</Text>
            <Text style={styles.panelLabel}>Subscriptions</Text>
          </View>
          <View style={styles.panel}>
            <View style={[styles.panelIcon, { backgroundColor: "#EEF7F2" }]}>
              <Ionicons name="people" size={18} color="#3D8E62" />
            </View>
            <Text style={[
              styles.panelValue,
              sharedNet > 0 && styles.panelValueGreen,
              sharedNet < 0 && styles.panelValueAmber,
            ]}>
              {sharedNet >= 0 ? "+" : ""}${sharedNet.toFixed(0)}
            </Text>
            <Text style={styles.panelLabel}>Shared</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder={
                searchMode === "exact"
                  ? "Starbucks, Uber, Food & Drink..."
                  : "dinner with Alex in January"
              }
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={(t) => {
                setSearchQuery(t);
                if (searchMode === "exact") setSemanticResults(null);
                else { setHasSearchedSemantic(false); setSemanticAnswer(""); }
              }}
              onSubmitEditing={() => searchMode === "semantic" && runSemanticSearch()}
              returnKeyType={searchMode === "semantic" ? "search" : "default"}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  setSemanticResults(null);
                  setHasSearchedSemantic(false);
                  setSemanticAnswer("");
                }}
              >
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
            {searchMode === "semantic" && (
              <TouchableOpacity
                style={styles.searchIconBtn}
                onPress={runSemanticSearch}
                disabled={semanticSearching || !searchQuery.trim()}
              >
                {semanticSearching ? (
                  <ActivityIndicator size="small" color="#3D8E62" />
                ) : (
                  <Ionicons name="search" size={20} color="#3D8E62" />
                )}
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.searchModeRow}>
            <TouchableOpacity
              style={[styles.modeChip, searchMode === "exact" && styles.modeChipActive]}
              onPress={() => { setSearchMode("exact"); setSemanticResults(null); setHasSearchedSemantic(false); setSemanticAnswer(""); }}
            >
              <Text style={[styles.modeChipText, searchMode === "exact" && styles.modeChipTextActive]}>
                Exact
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeChip, searchMode === "semantic" && styles.modeChipActive]}
              onPress={() => setSearchMode("semantic")}
            >
              <Text style={[styles.modeChipText, searchMode === "semantic" && styles.modeChipTextActive]}>
                Natural language
              </Text>
            </TouchableOpacity>
          </View>
          {searchMode === "semantic" && (
            <Text style={styles.searchHint}>
              Try: &quot;coffee last week&quot;, &quot;dinner with Alex&quot; — tap search icon
            </Text>
          )}
        </View>

        {/* Semantic search answer — shown above results when available */}
        {searchMode === "semantic" && hasSearchedSemantic && (semanticSearching || semanticAnswer) && (
          <View style={styles.answerBanner}>
            {semanticSearching ? (
              <Text style={styles.answerText}>Searching...</Text>
            ) : (
              <Text style={styles.answerText}>{semanticAnswer || "No answer for this query."}</Text>
            )}
          </View>
        )}

        {/* Recent transactions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {searchQuery.trim() ? "Results" : "Recent"}
          </Text>
          {!searchQuery.trim() && (
            <Text style={styles.sectionMeta}>{transactions.length} transactions</Text>
          )}
        </View>

        {semanticSearching ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#3D8E62" />
            <Text style={styles.loadingText}>Searching...</Text>
          </View>
        ) : displayTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={40} color="#9CA3AF" />
            <Text style={styles.emptyText}>
              {searchQuery ? "No matches" : "No transactions yet"}
            </Text>
          </View>
        ) : (
          displayTransactions.slice(0, 15).map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))
        )}
      </ScrollView>

      {/* FAB — only on Home tab */}
      {isFocused && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowFabMenu(true)}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal
        visible={showFabMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFabMenu(false)}
      >
        <Pressable style={styles.fabOverlay} onPress={() => setShowFabMenu(false)}>
          <View style={styles.fabMenu}>
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                setShowFabMenu(false);
                router.push("/(tabs)/receipt");
              }}
            >
              <Ionicons name="receipt" size={24} color="#3D8E62" />
              <Text style={styles.fabMenuText}>Scan receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                setShowFabMenu(false);
                router.push("/(tabs)/add-expense");
              }}
            >
              <Ionicons name="add-circle" size={24} color="#3D8E62" />
              <Text style={styles.fabMenuText}>Add expense</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAF8" },
  center: { justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  greeting: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  subGreeting: { fontSize: 14, color: "#6B7280", marginTop: 2 },
  settingsBtn: { padding: 4 },
  panels: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  panel: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEF7F2",
  },
  panelIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  panelValue: { fontSize: 17, fontWeight: "700", color: "#1F2937" },
  panelValueGreen: { color: "#059669" },
  panelValueAmber: { color: "#B45309" },
  panelLabel: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  searchSection: { marginBottom: 20 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchInput: { flex: 1, fontSize: 15, color: "#1F2937", padding: 0 },
  searchIconBtn: {
    padding: 6,
  },
  searchModeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
  },
  modeChipActive: { backgroundColor: "#3D8E62" },
  modeChipText: { fontSize: 13, fontWeight: "500", color: "#6B7280" },
  modeChipTextActive: { color: "#fff" },
  searchHint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 6,
  },
  answerBanner: {
    backgroundColor: "#EEF7F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1EAE0",
    padding: 16,
    marginBottom: 16,
  },
  answerText: {
    fontSize: 15,
    color: "#2D5A44",
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#374151" },
  sectionMeta: { fontSize: 12, color: "#9CA3AF" },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  txInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
  txMerchant: { fontSize: 15, fontWeight: "500", color: "#1F2937" },
  txCategory: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  txDate: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  emptyText: { fontSize: 14, color: "#9CA3AF", marginTop: 12 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  loadingText: { fontSize: 14, color: "#6B7280", marginTop: 12 },
  connectCard: {
    flex: 1,
    margin: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF7F2",
  },
  connectTitle: { fontSize: 20, fontWeight: "700", color: "#1F2937", marginTop: 20 },
  connectAccountEmail: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 6,
    textAlign: "center",
  },
  connectSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  connectHintImportant: {
    fontSize: 14,
    fontWeight: "600",
    color: "#B45309",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  connectHint: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  connectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#3D8E62",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 28,
  },
  connectButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  connectRefreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
  },
  connectRefreshText: { color: "#3D8E62", fontSize: 14, fontWeight: "500" },
  connectSignOutButton: {
    marginTop: 16,
    paddingVertical: 10,
  },
  connectSignOutText: { color: "#6B7280", fontSize: 14, textDecorationLine: "underline" },
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#3D8E62",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  fabOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    paddingBottom: 120,
    paddingHorizontal: 20,
  },
  fabMenu: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  fabMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  fabMenuText: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
});
