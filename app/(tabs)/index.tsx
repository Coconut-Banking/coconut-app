import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Redirect } from "expo-router";
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
  Image,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useApiFetch } from "../../lib/api";
import { getMerchantLogoUrl } from "../../lib/merchant-logos";
import { useTransactions, type Transaction } from "../../hooks/useTransactions";
import { useSubscriptions } from "../../hooks/useSubscriptions";
import { useGroupsSummary } from "../../hooks/useGroups";
import { useAccounts } from "../../hooks/useAccounts";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-lemon.vercel.app";
const SKIP_AUTH = process.env.EXPO_PUBLIC_SKIP_AUTH === "true";

const SEARCH_CHIPS = [
  { label: "This month", q: "how much did I spend this month" },
  { label: "Food", q: "food spending last month" },
  { label: "Biggest expense", q: "what's my biggest expense this month" },
  { label: "Subscriptions", q: "my subscriptions" },
  { label: "Unusual spending", q: "unusual spending this month" },
  { label: "Coffee", q: "how much on coffee" },
  { label: "Trending up?", q: "is my spending going up" },
] as const;

const MERCHANT_COLORS = [
  "#E50914", "#1DB954", "#00674B", "#FF9900", "#003366", "#7BB848",
  "#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#FF5A5F", "#9B59B6",
];

function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return MERCHANT_COLORS[Math.abs(h) % MERCHANT_COLORS.length];
}

const INSTITUTION_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];
function hashInstitutionColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return INSTITUTION_COLORS[Math.abs(h) % INSTITUTION_COLORS.length];
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
  is_pending?: boolean;
  accountMask?: string | null;
  accountName?: string | null;
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
    isPending: t.is_pending ?? false,
    accountMask: t.accountMask ?? null,
    accountName: t.accountName ?? null,
  };
}

type SearchMode = "exact" | "semantic";

/** Letter avatar fallback when no logo or load fails. */
function LetterAvatar({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "lg" }) {
  const initial = (name[0] || "").toUpperCase();
  const dim = size === "lg" ? 48 : 40;
  return (
    <View style={[styles.avatar, { backgroundColor: color, width: dim, height: dim }]}>
      <Text style={[styles.avatarText, size === "lg" && { fontSize: 18 }]}>{initial || "$"}</Text>
    </View>
  );
}

/** Logo for allowlisted merchants (matches web); letter avatar for others. */
function MerchantLogo({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "lg" }) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = getMerchantLogoUrl(name, size === "lg" ? 128 : 64);

  if (!logoUrl || imgError) return <LetterAvatar name={name} color={color} size={size} />;

  const dim = size === "lg" ? 48 : 40;
  return (
    <View style={[styles.avatar, styles.avatarLogo, { width: dim, height: dim }]}>
      <Image
        source={{ uri: logoUrl }}
        style={size === "lg" ? styles.avatarImgLg : styles.avatarImg}
        onError={() => setImgError(true)}
      />
    </View>
  );
}

/** TRANSFER_OUT is always outflow — Zelle, Venmo, wire, card payments, everything. */
function isDisplayAsOutflow(tx: Transaction): boolean {
  const cat = (tx.category ?? "").toUpperCase();
  if (cat.includes("TRANSFER") && cat.includes("OUT")) return true;
  const text = `${tx.merchant ?? ""} ${tx.rawDescription ?? ""}`.toLowerCase();
  const isTransport = cat.includes("TRANSPORTATION") || /uber|lyft|rideshare|taxi/i.test(text);
  return !!(isTransport && tx.amount > 0);
}

/** Only TRANSFER_IN and actual positive amounts (refunds, deposits) are inflow. */
function isDisplayAsInflow(tx: Transaction): boolean {
  if (isDisplayAsOutflow(tx)) return false;
  const cat = (tx.category ?? "").toUpperCase();
  if (cat.includes("TRANSFER") && cat.includes("IN")) return true;
  if (cat.includes("INCOME")) return true;
  return tx.amount > 0 && !cat.includes("TRANSFER");
}

function formatAmountDisplay(tx: Transaction): { text: string; isInflow: boolean } {
  const isInflow = isDisplayAsInflow(tx);
  const absAmt = Math.abs(tx.amount).toFixed(2);
  const sign = isInflow ? "+" : "-";
  return { text: `${sign}$${absAmt}`, isInflow };
}

function TransactionDetailModal({
  tx,
  onClose,
  formatAmount,
}: {
  tx: Transaction;
  onClose: () => void;
  formatAmount: (t: Transaction) => { text: string; isInflow: boolean };
}) {
  const { text: amountText, isInflow } = formatAmount(tx);
  return (
    <Modal visible={!!tx} transparent animationType="slide">
      <Pressable style={styles.detailOverlay} onPress={onClose}>
        <Pressable style={styles.detailSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.detailHandle} />
          <View style={styles.detailHeader}>
            <View style={styles.detailHeaderRow}>
              <MerchantLogo name={tx.merchant} color={tx.merchantColor} size="lg" />
              <View style={styles.detailHeaderText}>
                <Text style={styles.detailMerchant} numberOfLines={1}>{tx.merchant}</Text>
            <Text style={[styles.detailAmount, isInflow ? styles.txAmountInflow : styles.txAmountOutflow]}>
                {amountText}
              </Text>
              </View>
            </View>
          </View>
          <View style={styles.detailMeta}>
            <View style={styles.detailMetaRow}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{tx.dateStr}</Text>
            </View>
            <View style={styles.detailMetaRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailValue}>{tx.isPending ? "Pending" : "Posted"}</Text>
            </View>
            <View style={styles.detailMetaRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{tx.category}</Text>
            </View>
            {(tx.accountName || tx.accountMask) ? (
              <View style={styles.detailMetaRow}>
                <Text style={styles.detailLabel}>Account</Text>
                <Text style={styles.detailValue}>{tx.accountName || (tx.accountMask ? `••••${tx.accountMask}` : "")}</Text>
              </View>
            ) : null}
            {tx.rawDescription ? (
              <View style={styles.detailMetaRow}>
                <Text style={styles.detailLabel}>Description</Text>
                <Text style={[styles.detailValue, styles.detailRaw]} selectable>
                  {tx.rawDescription}
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity style={styles.detailCloseBtn} onPress={onClose}>
            <Text style={styles.detailCloseText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Bank tag for multi-account display, e.g. "••••1234" or "Chase Checking" */
function BankTag({ tx }: { tx: Transaction }) {
  const tag = tx.accountName || (tx.accountMask ? `••••${tx.accountMask}` : null);
  if (!tag) return null;
  return (
    <View style={styles.bankTag}>
      <Text style={styles.bankTagText}>{tag}</Text>
    </View>
  );
}


const TransactionRow = React.memo(function TransactionRow({ tx, onPress, institutionColor }: { tx: Transaction; onPress?: () => void; institutionColor?: string }) {
  const { text: amountText, isInflow } = formatAmountDisplay(tx);
  return (
    <Pressable style={styles.txRow} onPress={onPress}>
      {institutionColor ? (
        <View style={[styles.txInstitutionBar, { backgroundColor: institutionColor }]} />
      ) : null}
      <MerchantLogo name={tx.merchant} color={tx.merchantColor} />
      <View style={styles.txInfo}>
        <View style={styles.txMerchantRow}>
          <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
          <BankTag tx={tx} />
        </View>
        <Text style={styles.txCategory}>{tx.category}</Text>
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, isInflow ? styles.txAmountInflow : styles.txAmountOutflow]}>
          {amountText}
        </Text>
        <Text style={styles.txDate}>{tx.dateStr}</Text>
      </View>
    </Pressable>
  );
});

/** Monthly spend = expenses only (amount < 0), matching web dashboard. */
function deriveMonthlySpend(transactions: Transaction[]): number {
  const thisMonth = new Date().toISOString().slice(0, 7);
  return transactions
    .filter((tx) => tx.date.startsWith(thisMonth) && tx.amount < 0)
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

const STUCK_DELAY_MS = 4000;

function LoadingScreen({
  onSignOut,
  onOpenBrowser,
  onRetry,
}: {
  onSignOut: () => void;
  onOpenBrowser: () => void;
  onRetry: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const [showEscapeHatches, setShowEscapeHatches] = useState(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const t = setTimeout(() => setShowEscapeHatches(true), STUCK_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.loadingCard}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Text style={styles.loadingCoconut}>🥥</Text>
        </Animated.View>
        <Text style={styles.loadingTitle}>Loading your accounts…</Text>
        <Text style={styles.loadingSubtitle}>
          Fetching transactions from your bank
        </Text>
        {showEscapeHatches && (
          <View style={styles.loadingEscape}>
            <TouchableOpacity style={styles.loadingEscapeBtn} onPress={onRetry}>
              <Ionicons name="refresh" size={16} color="#3D8E62" />
              <Text style={styles.loadingEscapeText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.loadingEscapeBtn} onPress={onOpenBrowser}>
              <Text style={styles.loadingEscapeText}>Open in browser</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.loadingEscapeBtn} onPress={onSignOut}>
              <Text style={[styles.loadingEscapeText, styles.loadingEscapeTextMuted]}>Sign out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

export default function HomeScreen() {
  const { getToken, isLoaded: authLoaded, isSignedIn, sessionId } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const { transactions, linked, loading, status, refetch } = useTransactions();
  const { subscriptions } = useSubscriptions();
  const { summary: groupsSummary } = useGroupsSummary();
  const { accounts: bankAccounts, byInstitution } = useAccounts();

  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAccountSheet, setShowAccountSheet] = useState<string | null>(null);

  const [searchMode, setSearchMode] = useState<SearchMode>("exact");
  const [searchQuery, setSearchQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState<Transaction[] | null>(null);
  const [semanticSearching, setSemanticSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);

  useEffect(() => {
    if (!isFocused) setShowFabMenu(false);
  }, [isFocused]);

  // AppState listener in useTransactions handles refetch on resume.
  // Only refetch on first focus (after bank connect flow).
  const hasFetchedOnce = useRef(false);
  useEffect(() => {
    if (isFocused && !hasFetchedOnce.current) {
      hasFetchedOnce.current = true;
    } else if (isFocused && !prevFocused.current) {
      refetch(true);
    }
    prevFocused.current = isFocused;
  }, [isFocused, refetch]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const t = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    return user?.firstName ? `Good ${t}, ${user.firstName}` : `Good ${t}`;
  }, [user?.firstName]);
  const dateLabel = useMemo(() => new Date().toLocaleString("en", { weekday: "long", month: "long", day: "numeric" }), []);

  const monthlySpend = useMemo(() => deriveMonthlySpend(transactions), [transactions]);
  const subsTotal = useMemo(
    () => subscriptions.reduce((s, sub) => s + sub.amount, 0),
    [subscriptions]
  );
  const sharedNet = groupsSummary
    ? groupsSummary.totalOwedToMe - groupsSummary.totalIOwe
    : 0;

  const [hasSearchedSemantic, setHasSearchedSemantic] = useState(false);
  const [semanticAnswer, setSemanticAnswer] = useState<string>("");

  const onPressTx = useCallback((tx: Transaction) => setSelectedTx(tx), []);

  // Map transaction accountName/accountMask to institution_name
  const txInstitutionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const acct of bankAccounts) {
      // Key by name and by mask for lookup
      if (acct.name) map[`name:${acct.name}`] = acct.institution_name;
      if (acct.mask) map[`mask:${acct.mask}`] = acct.institution_name;
    }
    return map;
  }, [bankAccounts]);

  const getInstitutionForTx = useCallback(
    (tx: Transaction): string | null => {
      if (tx.accountName && txInstitutionMap[`name:${tx.accountName}`]) {
        return txInstitutionMap[`name:${tx.accountName}`];
      }
      if (tx.accountMask && txInstitutionMap[`mask:${tx.accountMask}`]) {
        return txInstitutionMap[`mask:${tx.accountMask}`];
      }
      return null;
    },
    [txInstitutionMap],
  );

  const displayTransactions = useMemo(() => {
    let list: Transaction[];
    if (searchMode === "exact") {
      list = filterExact(transactions, searchQuery);
    } else if (hasSearchedSemantic && semanticResults !== null) {
      list = semanticResults;
    } else {
      list = transactions;
    }
    // Apply institution / account filter
    if (selectedInstitution) {
      const acctIds = (byInstitution[selectedInstitution] || []).map((a) => a.id);
      const acctNames = (byInstitution[selectedInstitution] || []).map((a) => a.name);
      const acctMasks = (byInstitution[selectedInstitution] || []).map((a) => a.mask);
      list = list.filter((tx) => {
        if (selectedAccountId) {
          const acct = bankAccounts.find((a) => a.id === selectedAccountId);
          if (!acct) return false;
          return (tx.accountName && tx.accountName === acct.name) ||
            (tx.accountMask && tx.accountMask === acct.mask);
        }
        return (
          (tx.accountName && acctNames.includes(tx.accountName)) ||
          (tx.accountMask && acctMasks.includes(tx.accountMask))
        );
      });
    }
    // Sort: pending first, then by date desc (recent first) — match web
    return [...list].sort((a, b) => {
      if ((a.isPending ? 0 : 1) !== (b.isPending ? 0 : 1))
        return (a.isPending ? 0 : 1) - (b.isPending ? 0 : 1);
      return b.date.localeCompare(a.date);
    });
  }, [searchMode, transactions, semanticResults, searchQuery, hasSearchedSemantic, selectedInstitution, selectedAccountId, byInstitution, bankAccounts]);

  const { pendingTxs, postedTxs } = useMemo(() => {
    const pendingTxs: Transaction[] = [];
    const postedTxs: Transaction[] = [];
    for (const tx of displayTransactions) {
      (tx.isPending ? pendingTxs : postedTxs).push(tx);
    }
    return { pendingTxs, postedTxs };
  }, [displayTransactions]);

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

  // Auto-redirect to sign-up when auth is loaded but user is not signed in (skip when SKIP_AUTH)
  if (!SKIP_AUTH && authLoaded && !isSignedIn) {
    return <Redirect href="/(auth)/sign-up" />;
  }

  const openConnect = async () => {
    setConnectError(null);
    if (!isSignedIn) {
      return;
    }
    const base = API_URL.replace(/\/$/, "");
    const email = user?.primaryEmailAddress?.emailAddress;
    try {
      let token: string | null = null;
      for (let i = 0; i < 4; i++) {
        token = await getToken({ skipCache: i > 0 });
        if (token) break;
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
      if (token) {
        const res = await apiFetch("/api/auth/handoff-token", { method: "POST" });
        if (res.ok) {
          const { url } = await res.json();
          if (url) {
            const canOpenHandoff = await Linking.canOpenURL(url);
            if (canOpenHandoff) {
              await Linking.openURL(url);
              return;
            }
          }
        }
      }
    } catch {
      /* fallback */
    }
    const fallback = `${base}/connect-from-app`;
    const fallbackUrl = email ? `${fallback}?hint=${encodeURIComponent(email)}` : fallback;
    try {
      const canOpenFallback = await Linking.canOpenURL(fallbackUrl);
      if (!canOpenFallback) throw new Error("cannot_open");
      await Linking.openURL(fallbackUrl);
    } catch {
      setConnectError("Could not open browser. Please sign in first, then try again.");
    }
  };
  const openSettings = () => router.push("/(tabs)/settings");

  // Loading — show escape hatches FIRST; cached session can land us here, then API/token may hang
  const returnToAppUrl = `${API_URL.replace(/\/$/, "")}/auth/return-to-app`;
  const webLoginUrl = `${API_URL.replace(/\/$/, "")}/login?redirect_url=${encodeURIComponent(returnToAppUrl)}`;
  const handleSignOut = async () => {
    try {
      await signOut();
      // AuthSwitch will switch to (auth) automatically; router ensures we land on sign-in
      router.replace("/(auth)/sign-in");
    } catch (e) {
      console.error("[home] signOut failed:", e);
    }
  };

  // Smooth loading screen — coconut pulse animation; escape hatches after delay
  if (loading) {
    return (
      <LoadingScreen
        onSignOut={handleSignOut}
        onOpenBrowser={() => Linking.openURL(webLoginUrl)}
        onRetry={() => refetch(false)}
      />
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
          {user?.id ? (
            <Text style={styles.connectAccountId}>
              Clerk user: {user.id}
            </Text>
          ) : null}
          {(!user?.id || !user?.primaryEmailAddress?.emailAddress) ? (
            <Text style={styles.connectAccountId}>
              Auth loaded: {String(authLoaded)} | Signed in: {String(isSignedIn)}
            </Text>
          ) : null}
          <Text style={styles.connectSubtitle}>
            Link your account to see spending, transactions, and split receipts with friends.
          </Text>
          <Text style={styles.connectHint}>
            1) Tap "Connect in web app" and sign in with this same account.
          </Text>
          {accountHint ? (
            <Text style={styles.connectHintImportant}>{accountHint}</Text>
          ) : null}
          {connectError ? (
            <Text style={styles.connectErrorText}>{connectError}</Text>
          ) : null}
          {signOutError ? (
            <Text style={styles.connectErrorText}>{signOutError}</Text>
          ) : null}
          <Text style={styles.connectHint}>
            2) Stay in the browser until you see "Bank connected!" and then tap "Return to app".
          </Text>
          <Text style={styles.connectHint}>Do not close early on Plaid's "Continue to Coconut" screen.</Text>
          <TouchableOpacity
            style={styles.connectButton}
            onPress={openConnect}
          >
            <Text style={styles.connectButtonText}>{isSignedIn ? "Connect in web app" : "Sign in to continue"}</Text>
            {isSignedIn ? <Ionicons name="open-outline" size={16} color="#fff" /> : null}
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
          {isSignedIn ? (
            <TouchableOpacity
              style={styles.connectSignOutButton}
              onPress={async () => {
                if (signingOut) return;
                setSigningOut(true);
                setSignOutError(null);
                try {
                  const signOutPromise = sessionId ? signOut({ sessionId }) : signOut();
                  const signOutWithTimeout = Promise.race([
                    signOutPromise,
                    new Promise((_, reject) =>
                      setTimeout(() => reject(new Error("Sign out timed out")), 12000),
                    ),
                  ]);
                  await signOutWithTimeout;
                } catch (e) {
                  const err = e as { message?: string };
                  setSignOutError(
                    err.message === "Sign out timed out"
                      ? "Sign out is taking too long. Please try again."
                      : (err.message ?? "Sign out failed. Please try again."),
                  );
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
                  {accountHint ? "Sign out & switch account" : "Sign out"}
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
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.subGreeting}>{dateLabel}</Text>
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
          {searchMode === "semantic" && !searchQuery.trim() && (
            <>
              <Text style={styles.searchHint}>Try a question about your spending:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScrollContent}>
                {SEARCH_CHIPS.map((chip) => (
                  <TouchableOpacity
                    key={chip.q}
                    style={styles.searchChip}
                    onPress={() => { setSearchQuery(chip.q); setTimeout(runSemanticSearch, 100); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.searchChipText}>{chip.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
          {searchMode === "semantic" && searchQuery.trim() && (
            <Text style={styles.searchHint}>Tap the search icon or press return</Text>
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

        {/* Bank filter chips */}
        {Object.keys(byInstitution).length >= 2 && (
          <View style={styles.bankChipSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bankChipScroll}
            >
              <TouchableOpacity
                style={[
                  styles.bankChip,
                  !selectedInstitution && styles.bankChipActive,
                ]}
                onPress={() => {
                  setSelectedInstitution(null);
                  setSelectedAccountId(null);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.bankChipText,
                    !selectedInstitution && styles.bankChipTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {Object.keys(byInstitution).map((inst) => {
                const isActive = selectedInstitution === inst;
                const dotColor = hashInstitutionColor(inst);
                return (
                  <TouchableOpacity
                    key={inst}
                    style={[styles.bankChip, isActive && styles.bankChipActive]}
                    onPress={() => {
                      if (isActive) {
                        setSelectedInstitution(null);
                        setSelectedAccountId(null);
                      } else {
                        setSelectedInstitution(inst);
                        setSelectedAccountId(null);
                      }
                    }}
                    onLongPress={() => setShowAccountSheet(inst)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.bankChipDot, { backgroundColor: dotColor }]} />
                    <Text
                      style={[
                        styles.bankChipText,
                        isActive && styles.bankChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {inst}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* Account sub-chips when an institution is selected with 2+ accounts */}
            {selectedInstitution &&
              (byInstitution[selectedInstitution] || []).length >= 2 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.accountSubChipScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.accountSubChip,
                      !selectedAccountId && styles.accountSubChipActive,
                    ]}
                    onPress={() => setSelectedAccountId(null)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.accountSubChipText,
                        !selectedAccountId && styles.accountSubChipTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {(byInstitution[selectedInstitution] || []).map((acct) => {
                    const isActive = selectedAccountId === acct.id;
                    const label = `${(acct.subtype || acct.type || "Account").replace(/_/g, " ")} ••${acct.mask || "****"}`;
                    return (
                      <TouchableOpacity
                        key={acct.id}
                        style={[
                          styles.accountSubChip,
                          isActive && styles.accountSubChipActive,
                        ]}
                        onPress={() =>
                          setSelectedAccountId(isActive ? null : acct.id)
                        }
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.accountSubChipText,
                            isActive && styles.accountSubChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
          </View>
        )}

        {/* Recent transactions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {searchQuery.trim() ? "Results" : "Recent"}
          </Text>
          <Text style={styles.sectionMeta}>
            {displayTransactions.length} transaction{displayTransactions.length !== 1 ? "s" : ""}
          </Text>
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
          <>
            {pendingTxs.length > 0 && (
              <View style={styles.txSection}>
                <View style={styles.txSectionHeader}>
                  <Text style={styles.txSectionTitle}>Pending</Text>
                </View>
                {pendingTxs.map((tx) => {
                  const inst = getInstitutionForTx(tx);
                  return (
                    <TransactionRow key={tx.id} tx={tx} onPress={() => onPressTx(tx)} institutionColor={inst ? hashInstitutionColor(inst) : undefined} />
                  );
                })}
              </View>
            )}
            {postedTxs.length > 0 && (
              <View style={styles.txSection}>
                <View style={[styles.txSectionHeader, styles.txSectionHeaderPosted]}>
                  <Text style={styles.txSectionTitlePosted}>Posted</Text>
                </View>
                {postedTxs.map((tx) => {
                  const inst = getInstitutionForTx(tx);
                  return (
                    <TransactionRow key={tx.id} tx={tx} onPress={() => onPressTx(tx)} institutionColor={inst ? hashInstitutionColor(inst) : undefined} />
                  );
                })}
              </View>
            )}
          </>
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

      {selectedTx && (
        <TransactionDetailModal
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          formatAmount={formatAmountDisplay}
        />
      )}

      {/* Institution account sheet */}
      <Modal
        visible={!!showAccountSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountSheet(null)}
      >
        <Pressable style={styles.detailOverlay} onPress={() => setShowAccountSheet(null)}>
          <Pressable style={styles.detailSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.detailHandle} />
            {showAccountSheet && (
              <>
                <View style={styles.instSheetHeader}>
                  <View style={[styles.bankChipDot, { backgroundColor: hashInstitutionColor(showAccountSheet), width: 8, height: 8, borderRadius: 4 }]} />
                  <Text style={styles.instSheetTitle}>{showAccountSheet}</Text>
                </View>
                {(byInstitution[showAccountSheet] || []).map((acct) => (
                  <View key={acct.id} style={styles.instSheetRow}>
                    <View style={styles.instSheetAcctInfo}>
                      <Text style={styles.instSheetAcctName}>{acct.name}</Text>
                      <Text style={styles.instSheetAcctMeta}>
                        {(acct.subtype || acct.type || "account").replace(/_/g, " ")} ••{acct.mask || "****"}
                      </Text>
                    </View>
                    <Text style={styles.instSheetBalance}>
                      ${(acct.balance_current ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                ))}
                <View style={styles.instSheetTotalRow}>
                  <Text style={styles.instSheetTotalLabel}>Total</Text>
                  <Text style={styles.instSheetTotalValue}>
                    ${(byInstitution[showAccountSheet] || [])
                      .reduce((s, a) => s + (a.balance_current ?? 0), 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.instSheetViewBtn}
                  onPress={() => {
                    const inst = showAccountSheet;
                    setShowAccountSheet(null);
                    setSelectedInstitution(inst);
                    setSelectedAccountId(null);
                  }}
                >
                  <Text style={styles.instSheetViewBtnText}>View all transactions</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
  chipScrollContent: { gap: 8, paddingVertical: 6 },
  searchChip: { backgroundColor: "#EEF7F2", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  searchChipText: { fontSize: 13, fontWeight: "600", color: "#3D8E62" },
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
  txSection: { marginBottom: 16 },
  txSectionHeader: {
    backgroundColor: "#FFFBEB",
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  txSectionHeaderPosted: {
    backgroundColor: "#F9FAFB",
    borderBottomColor: "#F3F4F6",
  },
  txSectionTitle: { fontSize: 12, fontWeight: "600", color: "#92400E" },
  txSectionTitlePosted: { fontSize: 12, fontWeight: "600", color: "#4B5563" },
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
  avatarLogo: {
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
  },
  avatarImg: { width: 28, height: 28 },
  avatarImgLg: { width: 36, height: 36 },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  txInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
  txMerchantRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  txMerchant: { fontSize: 15, fontWeight: "500", color: "#1F2937", flexShrink: 1 },
  bankTag: {
    backgroundColor: "#EEF7F2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  bankTagText: { fontSize: 10, fontWeight: "500", color: "#3D8E62" },
  txCategory: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 15, fontWeight: "600" },
  txAmountInflow: { color: "#059669" },
  txAmountOutflow: { color: "#1F2937" },
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
  loadingCard: {
    flex: 1,
    margin: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#EEF7F2",
  },
  loadingCoconut: { fontSize: 72, marginBottom: 16 },
  loadingTitle: { fontSize: 18, fontWeight: "600", color: "#1F2937", marginBottom: 6 },
  loadingSubtitle: { fontSize: 14, color: "#6B7280" },
  loadingEscape: {
    marginTop: 28,
    alignItems: "center",
    gap: 12,
  },
  loadingEscapeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  loadingEscapeText: { fontSize: 14, fontWeight: "500", color: "#3D8E62" },
  loadingEscapeTextMuted: { color: "#6B7280" },
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
  connectAccountId: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
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
  connectErrorText: {
    fontSize: 12,
    color: "#DC2626",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 18,
    paddingHorizontal: 8,
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
  detailOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  detailSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  detailHandle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  detailHeader: {
    marginBottom: 20,
  },
  detailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  detailHeaderText: { flex: 1, minWidth: 0 },
  detailMerchant: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  detailAmount: { fontSize: 24, fontWeight: "700", marginTop: 8 },
  detailMeta: { gap: 12 },
  detailMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  detailLabel: { fontSize: 12, color: "#9CA3AF", minWidth: 80 },
  detailValue: { fontSize: 14, color: "#374151", flex: 1, textAlign: "right" },
  detailRaw: { textAlign: "left", fontFamily: "monospace", fontSize: 12 },
  detailCloseBtn: {
    marginTop: 24,
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  detailCloseText: { fontSize: 16, fontWeight: "600", color: "#374151" },
  // Institution bar on transaction rows
  txInstitutionBar: {
    width: 3,
    borderRadius: 2,
    alignSelf: "stretch",
    marginRight: 10,
  },
  // Bank filter chip bar
  bankChipSection: {
    marginBottom: 16,
  },
  bankChipScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  bankChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  bankChipActive: {
    backgroundColor: "#3D8E62",
    borderColor: "#3D8E62",
  },
  bankChipDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  bankChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  bankChipTextActive: {
    color: "#fff",
  },
  // Account sub-chips
  accountSubChipScroll: {
    gap: 6,
    paddingVertical: 4,
    marginTop: 6,
  },
  accountSubChip: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  accountSubChipActive: {
    backgroundColor: "#D1EAE0",
  },
  accountSubChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6B7280",
  },
  accountSubChipTextActive: {
    color: "#2D5A44",
    fontWeight: "600",
  },
  // Institution bottom sheet
  instSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  instSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  instSheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  instSheetAcctInfo: {
    flex: 1,
    minWidth: 0,
  },
  instSheetAcctName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1F2937",
  },
  instSheetAcctMeta: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  instSheetBalance: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    marginLeft: 12,
  },
  instSheetTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  instSheetTotalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  instSheetTotalValue: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
  },
  instSheetViewBtn: {
    backgroundColor: "#3D8E62",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  instSheetViewBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
