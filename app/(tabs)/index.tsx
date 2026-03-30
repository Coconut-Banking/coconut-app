/**
 * Home tab — UI matches `Create design prototype (1)/src/app/pages/MobileAppPage.tsx` HomeScreen.
 * No legacy transaction list / NL search / insights on this screen.
 */
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useApiFetch } from "../../lib/api";
import { fetchReceiptDetailForTransaction } from "../../lib/fetch-receipt-detail";
import { getDemoItemizedReceipt } from "../../lib/demo-receipt-itemized";
import { ItemizedReceiptPreview } from "../../components/ItemizedReceiptPreview";
import { MerchantEnrichmentCard, MerchantItemsList } from "../../components/MerchantEnrichmentCard";
import type { ReceiptItem } from "../../lib/receipt-split";
import { useGroupsSummary } from "../../hooks/useGroups";
import { useTransactions, type Transaction } from "../../hooks/useTransactions";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";
import { useTheme } from "../../lib/theme-context";
import { BalanceHero } from "../../components/split/BalanceHero";
import { colors, font, radii, shadow, darkUI, prototype } from "../../lib/theme";
import { MerchantLogo } from "../../components/merchant/MerchantLogo";
import { PROTOTYPE_DEMO_BANK_CHARGES } from "../../lib/prototype-bank-demo";
import { DEMO_HOME_DISPLAY_NAME, formatHomeGreetingLine } from "../../lib/home-greeting";
import {
  buildLiveMatchedStrip,
  demoChargeToStripRow,
  merchantEmoji,
  type HomeBankStripRow,
} from "../../lib/home-bank-strip";
import { useSearch, type SearchTransaction } from "../../hooks/useSearch";
import { CalendarPicker } from "../../components/CalendarPicker";
import { friendBalanceLines, formatSplitCurrencyAmount, groupBalanceLines } from "../../lib/format-split-money";
import { haptic } from "../../components/ui";

/** Convert a raw bank Transaction into a sheet-compatible row (no receipt match). */
function txToSheetRow(tx: { id: string; merchant?: string; rawDescription?: string; amount: number; dateStr?: string; date?: string; alreadySplit?: boolean }): HomeBankStripRow {
  const merchant = tx.merchant || tx.rawDescription || "Purchase";
  return {
    stripId: tx.id,
    merchant,
    emoji: merchantEmoji(merchant),
    amount: Math.abs(Number(tx.amount)),
    cardDetailLine: tx.dateStr || tx.date || "",
    cardDetailIsReceipt: false,
    hasMailBadge: false,
    sheetDateLine: tx.dateStr || tx.date || "",
    showReceiptBox: false,
  };
}

const FRIEND_HUES = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"] as const;

function FriendAvatar({ name, size = 42 }: { name: string; size?: number }) {
  const hue = FRIEND_HUES[name.charCodeAt(0) % FRIEND_HUES.length];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${hue}33`,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: `${hue}55`,
      }}
    >
      <Text style={{ color: hue, fontFamily: font.bold, fontSize: size * 0.3 }}>
        {name.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.sLabel, { color: theme.textTertiary }]}>{children}</Text>;
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function normalizeMerchant(tx: Transaction) {
  return (tx.merchant || tx.rawDescription || "purchase").trim().toLowerCase();
}

function txTimeMs(tx: Transaction) {
  const d = new Date(tx.dateStr || tx.date || "").getTime();
  return Number.isNaN(d) ? 0 : d;
}

/**
 * Hide refund/void reversals from split UI:
 * if a debit has a nearby matching credit (same merchant + absolute amount),
 * omit both so users don't try splitting charges that net to zero.
 */
function filterOffsettingBankPairs(transactions: Transaction[]): Transaction[] {
  const sorted = [...transactions].sort((a, b) => txTimeMs(b) - txTimeMs(a));
  const creditByKey = new Map<string, number[]>();

  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    const amt = Number(tx.amount);
    if (!(amt > 0)) continue;
    const key = `${normalizeMerchant(tx)}|${Math.abs(amt).toFixed(2)}`;
    const list = creditByKey.get(key) ?? [];
    list.push(i);
    creditByKey.set(key, list);
  }

  const omitted = new Set<number>();
  const maxMs = 7 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < sorted.length; i++) {
    if (omitted.has(i)) continue;
    const tx = sorted[i];
    const amt = Number(tx.amount);
    if (!(amt < 0)) continue;
    const key = `${normalizeMerchant(tx)}|${Math.abs(amt).toFixed(2)}`;
    const credits = creditByKey.get(key);
    if (!credits || credits.length === 0) continue;

    const debitTime = txTimeMs(tx);
    const matchPos = credits.findIndex((idx) => {
      if (omitted.has(idx)) return false;
      const creditTime = txTimeMs(sorted[idx]);
      return Math.abs(debitTime - creditTime) <= maxMs;
    });
    if (matchPos === -1) continue;
    const creditIdx = credits.splice(matchPos, 1)[0];
    omitted.add(i);
    omitted.add(creditIdx);
  }

  return sorted.filter((_, idx) => !omitted.has(idx));
}

export default function BalancesPrototypeScreen() {
  const { theme } = useTheme();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { summary: apiSummary, loading: summaryLoading, refetch } = useGroupsSummary();

  const summary = isDemoOn ? demo.summary : apiSummary;
  const [dismissedBank, setDismissedBank] = useState<string[]>([]);
  const [selectedStrip, setSelectedStrip] = useState<HomeBankStripRow | null>(null);
  const [showAllBank, setShowAllBank] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [bankFilter, setBankFilter] = useState<"all" | "unsplit">("all");
  const [searchMode, setSearchMode] = useState<"keyword" | "natural">("keyword");
  const [datePreset, setDatePreset] = useState<"all" | "week" | "month" | "custom">("all");
  const [customDateStart, setCustomDateStart] = useState<Date | null>(null);
  const [customDateEnd, setCustomDateEnd] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const { results: askResults, loading: askLoading, error: askError, search: askSearch, clear: askClear } = useSearch();
  const [refreshing, setRefreshing] = useState(false);
  const apiFetch = useApiFetch();
  const [itemizedReceipt, setItemizedReceipt] = useState<{
    items: ReceiptItem[];
    merchantName: string;
    merchantType: string | null;
    merchantDetails: Record<string, unknown> | null;
    subtotal: number;
    tax: number;
    tip: number;
    total: number;
    extras: Array<{ name: string; amount: number }>;
  } | null>(null);
  const [itemizedLoading, setItemizedLoading] = useState(false);
  const [itemizedError, setItemizedError] = useState<string | null>(null);

  // Avoid treating Clerk's initial isSignedIn=false/undefined as "guest" — that flashed demo bank while session loads.
  const useDemoBankUi = isDemoOn || (authLoaded && !isSignedIn);
  const { transactions, linked, loading: txLoading, status: txStatus, refetch: refetchTx, runFullSync } = useTransactions();
  const bankVisibleTransactions = useMemo(() => filterOffsettingBankPairs(transactions), [transactions]);
  const initialHomeLoading =
    !isDemoOn &&
    isSignedIn &&
    !summary &&
    summaryLoading &&
    txLoading;

  const demoStripRows = useMemo(() => {
    if (!useDemoBankUi) return [];
    return PROTOTYPE_DEMO_BANK_CHARGES.filter(
      (tx) => tx.unsplit && !dismissedBank.includes(tx.id)
    ).map(demoChargeToStripRow);
  }, [useDemoBankUi, dismissedBank]);

  const liveStripRows = useMemo(() => {
    if (useDemoBankUi || !linked) return [];
    const built = buildLiveMatchedStrip(bankVisibleTransactions);
    return built.filter((r) => !dismissedBank.includes(r.stripId));
  }, [useDemoBankUi, linked, bankVisibleTransactions, dismissedBank]);

  const stripRows = useDemoBankUi ? demoStripRows : liveStripRows;

  useEffect(() => {
    if (!selectedStrip) {
      setItemizedReceipt(null);
      setItemizedError(null);
      setItemizedLoading(false);
      return;
    }
    let cancelled = false;
    setItemizedReceipt(null);
    setItemizedError(null);
    if (selectedStrip.receiptId === "__demo__") {
      setItemizedReceipt(getDemoItemizedReceipt());
      setItemizedLoading(false);
      return;
    }
    if (!selectedStrip.receiptId) {
      setItemizedLoading(false);
      return;
    }
    setItemizedLoading(true);
    fetchReceiptDetailForTransaction(apiFetch, selectedStrip.receiptId)
      .then((d) => {
        if (cancelled) return;
        if (d) setItemizedReceipt(d);
        else
          setItemizedError(
            "Could not load line items. Ensure the web API exposes GET /api/receipt/[id] for this receipt."
          );
      })
      .catch(() => {
        if (!cancelled) setItemizedError("Could not load receipt details.");
      })
      .finally(() => {
        if (!cancelled) setItemizedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStrip, apiFetch]);

  const allLinkedBankRows = useMemo(() => {
    if (!linked) return [];
    return bankVisibleTransactions
      .filter((tx) => Number(tx.amount) < 0)
      .sort((a, b) => {
        const da = new Date(a.dateStr || a.date || "").getTime();
        const db = new Date(b.dateStr || b.date || "").getTime();
        return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
      })
      .slice(0, 120);
  }, [bankVisibleTransactions, linked]);

  const dateFilterRange = useMemo((): { start: Date; end: Date } | null => {
    if (datePreset === "all") return null;
    if (datePreset === "custom" && customDateStart && customDateEnd) {
      return { start: customDateStart, end: customDateEnd };
    }
    const end = new Date();
    const start = new Date();
    if (datePreset === "week") start.setDate(start.getDate() - 7);
    else if (datePreset === "month") start.setDate(start.getDate() - 30);
    else return null;
    return { start, end };
  }, [datePreset, customDateStart, customDateEnd]);

  const filteredAllBankRows = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    return allLinkedBankRows.filter((tx) => {
      if (bankFilter === "unsplit" && tx.alreadySplit) return false;
      if (dateFilterRange) {
        const txDate = new Date(tx.dateStr || tx.date || "");
        if (!Number.isNaN(txDate.getTime()) && (txDate < dateFilterRange.start || txDate > dateFilterRange.end)) return false;
      }
      if (!q) return true;
      const merchant = (tx.merchant || tx.rawDescription || "").toLowerCase();
      return merchant.includes(q) || String(Math.abs(Number(tx.amount)).toFixed(2)).includes(q);
    });
  }, [allLinkedBankRows, bankFilter, bankSearch, dateFilterRange]);

  const onRefresh = useCallback(async () => {
    if (isDemoOn) return;
    setRefreshing(true);
    try {
      // runFullSync pulls fresh data from Plaid into the DB, then reloads the list (can take ~15–30s).
      await Promise.all([refetch(), runFullSync(false)]);
    } finally {
      setRefreshing(false);
    }
  }, [isDemoOn, refetch, runFullSync]);

  useEffect(() => {
    if (isDemoOn) return;
    const sub = DeviceEventEmitter.addListener("groups-updated", () => {
      void refetch();
    });
    return () => sub.remove();
  }, [isDemoOn, refetch]);

  /** After disconnect, strip rows must stay empty; close sheet and reset dismiss state. */
  useEffect(() => {
    if (isDemoOn || linked) return;
    setDismissedBank([]);
    setShowAllBank(false);
    setSelectedStrip(null);
  }, [isDemoOn, linked]);

  const friends = summary?.friends ?? [];
  const groups = summary?.groups ?? [];
  const hasFriendsOrGroups = friends.length > 0 || groups.length > 0;
  const friendExpenseCount = (key: string) =>
    isDemoOn ? (demo.personDetails[key]?.activity.length ?? 0) : undefined;

  const greetingName = isDemoOn
    ? DEMO_HOME_DISPLAY_NAME
    : userLoaded && isSignedIn
      ? (user?.firstName?.trim() || user?.username?.trim() || "")
      : "";
  const greetingTitle = formatHomeGreetingLine(greetingName);
  if (initialHomeLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={styles.homeLoadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.homeLoadingText, { color: theme.textTertiary }]}>Loading your home…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isDemoOn ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          )
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {greetingTitle}
            </Text>
            <Text style={[styles.titleSub, { color: theme.textTertiary }]}>Here&apos;s where you stand with friends and groups.</Text>
          </View>
        </View>

        <BalanceHero summary={summary} />

        {useDemoBankUi && stripRows.length > 0 ? (
          <View style={{ marginBottom: 18 }}>
            <View style={styles.sectionRow}>
              <SLabel>From your bank</SLabel>
              <TouchableOpacity onPress={() => setShowAllBank(true)} hitSlop={8}>
                <Text style={[styles.seeAll, { color: theme.text }]}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              data={stripRows}
              keyExtractor={(t) => t.stripId}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 8 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.bankCard, item.cardDetailIsReceipt && styles.bankCardEmail, { backgroundColor: theme.surface, borderColor: item.cardDetailIsReceipt ? "#D9D7F0" : theme.border }]}
                  onPress={() => setSelectedStrip(item)}
                >
                  <View style={styles.bankTop}>
                    <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]}>
                      <MerchantLogo
                        merchantName={item.merchant}
                        size={22}
                        fallbackText={item.emoji}
                        backgroundColor="transparent"
                        borderColor="transparent"
                      />
                      {item.hasMailBadge ? (
                        <View style={styles.mailDot}>
                          <Ionicons name="mail" size={7} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => setDismissedBank((d) => [...d, item.stripId])}
                      hitSlop={8}
                      style={{ padding: 2 }}
                    >
                      <Ionicons name="close" size={13} color={darkUI.labelMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.bankMerchant, { color: theme.text }]} numberOfLines={1}>
                    {item.merchant}
                  </Text>
                  <Text
                    style={item.cardDetailIsReceipt ? styles.bankEmailLine : styles.bankHint}
                    numberOfLines={1}
                  >
                    {item.cardDetailLine}
                  </Text>
                  <Text style={[styles.bankAmt, { color: theme.text }]}>${item.amount.toFixed(2)}</Text>
                  <View style={[styles.bankCta, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <Text style={[styles.bankCtaText, { color: theme.text }]}>
                      {item.cardDetailIsReceipt ? "View receipt" : "Split this"}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          </View>
        ) : !useDemoBankUi ? (
          <View style={{ marginBottom: 18 }}>
            <View style={styles.sectionRow}>
              <SLabel>From your bank</SLabel>
              {linked ? (
                <TouchableOpacity onPress={() => setShowAllBank(true)} hitSlop={8}>
                  <Text style={[styles.seeAll, { color: theme.text }]}>See all</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {linked && txStatus === "ok" ? (
              <Text style={styles.bankSyncHint}>
                Pull down on Home to sync new charges from your bank (often ~15–30s). Updates also arrive in the background when your bank notifies Plaid.
              </Text>
            ) : null}
            {txStatus === "api_unreachable" ? (
              <View style={[styles.emptyBank, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.emptyBankText, { color: theme.textTertiary }]}>
                  Can&apos;t reach the Coconut API (got 404). Set EXPO_PUBLIC_API_URL in .env to your live Next.js URL
                  (same host as the web app), restart Expo, and try again.
                </Text>
              </View>
            ) : txStatus === "unauthorized" ? (
              <View style={[styles.emptyBank, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.emptyBankText, { color: theme.textTertiary }]}>Sign in again to load bank charges.</Text>
              </View>
            ) : !linked ? (
              <View style={[styles.emptyBank, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.emptyBankText, { color: theme.textTertiary }]}>
                  Connect your bank on the web to see charges. When a purchase matches an email receipt,
                  it&apos;ll show here to split.
                </Text>
              </View>
            ) : stripRows.length > 0 ? (
              <FlatList
                horizontal
                data={stripRows}
                keyExtractor={(t) => t.stripId}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 8 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.bankCard, item.cardDetailIsReceipt && styles.bankCardEmail, { backgroundColor: theme.surface, borderColor: item.cardDetailIsReceipt ? "#D9D7F0" : theme.border }]}
                    onPress={() => { haptic.selection(); setSelectedStrip(item); }}
                  >
                    <View style={styles.bankTop}>
                      <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]}>
                        <MerchantLogo
                          merchantName={item.merchant}
                          size={22}
                          fallbackText={item.emoji}
                          backgroundColor="transparent"
                          borderColor="transparent"
                        />
                        {item.hasMailBadge ? (
                          <View style={styles.mailDot}>
                            <Ionicons name="mail" size={7} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => setDismissedBank((d) => [...d, item.stripId])}
                        hitSlop={8}
                        style={{ padding: 2 }}
                      >
                        <Ionicons name="close" size={13} color={darkUI.labelMuted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.bankMerchant, { color: theme.text }]} numberOfLines={1}>
                      {item.merchant}
                    </Text>
                    <Text
                      style={item.cardDetailIsReceipt ? styles.bankEmailLine : styles.bankHint}
                      numberOfLines={1}
                    >
                      {item.cardDetailLine}
                    </Text>
                    <Text style={styles.bankAmt}>${item.amount.toFixed(2)}</Text>
                    <View style={styles.bankCta}>
                      <Text style={styles.bankCtaText}>
                        {item.cardDetailIsReceipt ? "View receipt" : "Split this"}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            ) : txLoading ? (
              <View style={[styles.emptyBank, styles.emptyBankLoading]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.emptyBankText, { marginTop: 10 }]}>Loading bank charges…</Text>
              </View>
            ) : (
              allLinkedBankRows.length > 0 ? (
                <FlatList
                  horizontal
                  data={allLinkedBankRows.slice(0, 12)}
                  keyExtractor={(tx) => `live-${tx.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingRight: 8 }}
                  renderItem={({ item: tx }) => (
                    <Pressable
                      style={styles.bankCard}
                      onPress={() => {
                        haptic.selection();
                        setSelectedStrip(txToSheetRow(tx));
                      }}
                    >
                      <View style={styles.bankTop}>
                        <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]}>
                          <MerchantLogo
                            merchantName={tx.merchant || tx.rawDescription || "Purchase"}
                            size={22}
                            fallbackText="💳"
                            backgroundColor="transparent"
                            borderColor="transparent"
                          />
                        </View>
                      </View>
                      <Text style={[styles.bankMerchant, { color: theme.text }]} numberOfLines={1}>
                        {tx.merchant || tx.rawDescription || "Purchase"}
                      </Text>
                      <Text style={styles.bankHint} numberOfLines={1}>
                        {tx.dateStr || tx.date || "—"}
                      </Text>
                      <Text style={styles.bankAmt}>${Math.abs(Number(tx.amount)).toFixed(2)}</Text>
                      <View style={styles.bankCta}>
                        <Text style={styles.bankCtaText}>Split this</Text>
                      </View>
                    </Pressable>
                  )}
                />
              ) : (
                <View style={[styles.emptyBank, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.emptyBankText, { color: theme.textTertiary }]}>
                    No bank charges yet. Pull to refresh after linking your bank.
                  </Text>
                </View>
              )
            )}
          </View>
        ) : null}

        <View style={{ marginBottom: 12 }}>
          <View style={styles.sectionRow}>
            <SLabel>Friends & groups</SLabel>
            <TouchableOpacity onPress={() => router.push("/(tabs)/shared")} hitSlop={8}>
              <Text style={[styles.seeAll, { color: theme.text }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {!hasFriendsOrGroups ? (
            <View style={[styles.emptyFriend, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="people-outline" size={28} color={theme.textTertiary} />
              <Text style={[styles.emptyFriendTitle, { color: theme.text }]}>No friends or groups yet</Text>
              <Text style={[styles.emptyFriendSub, { color: theme.textTertiary }]}>Open See all to add people and groups.</Text>
            </View>
          ) : (
            <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {friends.map((f, i) => {
                const nExp = friendExpenseCount(f.key);
                const lines = friendBalanceLines(f);
                const settled = lines.length === 0;
                const pos =
                  !settled &&
                  lines.some((l) => l.amount > 0.005) &&
                  lines.every((l) => l.amount >= -0.005);
                const neg =
                  !settled &&
                  lines.some((l) => l.amount < -0.005) &&
                  lines.every((l) => l.amount <= 0.005);
                const mixed = !settled && !pos && !neg;
                const expSuffix =
                  nExp != null ? ` · ${nExp} expense${nExp !== 1 ? "s" : ""}` : "";
                const meta = settled
                  ? "settled up"
                  : mixed
                    ? `balances${expSuffix}`
                    : pos
                      ? `owes you${expSuffix}`
                      : `you owe${expSuffix}`;
                return (
                  <View key={f.key}>
                    <TouchableOpacity
                      style={styles.friendRow}
                      onPress={() => router.push({ pathname: "/(tabs)/shared/person", params: { key: f.key } })}
                      activeOpacity={0.75}
                    >
                      <FriendAvatar name={f.displayName} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.friendName, { color: theme.text }]}>{f.displayName}</Text>
                        <Text style={[styles.friendMeta, { color: theme.textTertiary }]}>{meta}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        {settled ? (
                          <Text style={[styles.friendAmt, { color: darkUI.labelMuted }]}>—</Text>
                        ) : (
                          lines.map((b) => {
                            const p = b.amount > 0.005;
                            const n = b.amount < -0.005;
                            return (
                              <Text
                                key={b.currency}
                                style={[
                                  styles.friendAmt,
                                  p && { color: prototype.green },
                                  n && { color: prototype.red },
                                ]}
                              >
                                {p ? "+" : n ? "−" : ""}
                                {formatSplitCurrencyAmount(b.amount, b.currency)}
                              </Text>
                            );
                          })
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={darkUI.labelMuted} style={{ marginLeft: 6, opacity: 0.5 }} />
                    </TouchableOpacity>
                    {i < friends.length - 1 ? <View style={[styles.rowSep, { backgroundColor: theme.borderLight }]} /> : null}
                  </View>
                );
              })}
              {friends.length > 0 && groups.length > 0 ? <View style={[styles.sectionDivider, { backgroundColor: theme.borderLight }]} /> : null}
              {groups.length > 0 ? (
                <>
                  <View
                    style={[
                      styles.inlineSectionLabel,
                      friends.length > 0 ? styles.inlineSectionLabelAfterFriends : styles.inlineSectionLabelFirst,
                    ]}
                  >
                    <Text style={styles.inlineSectionLabelText}>Groups</Text>
                  </View>
                  {groups.map((g, i) => (
                    <View key={g.id}>
                      {i > 0 ? <View style={styles.rowSep} /> : null}
                      <TouchableOpacity
                        style={styles.groupRow}
                        onPress={() => router.push({ pathname: "/(tabs)/shared/group", params: { id: g.id } })}
                        activeOpacity={0.75}
                      >
                        <View style={styles.groupIcon}>
                          <Ionicons name="people" size={18} color="#1F2937" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.groupRowName}>{g.name}</Text>
                          <Text style={styles.groupRowSub}>
                            {g.memberCount} members · {timeAgo(g.lastActivityAt)}
                          </Text>
                        </View>
                        {groupBalanceLines(g).length > 0 ? (
                          <View style={{ alignItems: "flex-end" }}>
                            {groupBalanceLines(g).map((b) => (
                              <Text
                                key={b.currency}
                                style={[
                                  styles.groupRowBal,
                                  b.amount > 0 ? styles.balAmtIn : styles.balAmtOut,
                                ]}
                              >
                                {b.amount > 0 ? "+" : "−"}
                                {formatSplitCurrencyAmount(b.amount, b.currency)}
                              </Text>
                            ))}
                          </View>
                        ) : (
                          <Text style={[styles.groupRowBal, styles.balMuted]}>—</Text>
                        )}
                        <Ionicons name="chevron-forward" size={14} color={darkUI.labelMuted} style={{ marginLeft: 6, opacity: 0.5 }} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!selectedStrip} transparent animationType="slide" onRequestClose={() => setSelectedStrip(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setSelectedStrip(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {selectedStrip ? (
              <ScrollView
                style={styles.sheetScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheetHead}>
                  <View style={styles.sheetEmoji}>
                    <MerchantLogo
                      merchantName={selectedStrip.merchant}
                      size={32}
                      fallbackText={selectedStrip.emoji}
                      backgroundColor="transparent"
                      borderColor="transparent"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetMerchant}>{selectedStrip.merchant}</Text>
                    <Text style={styles.sheetDate}>{selectedStrip.sheetDateLine}</Text>
                  </View>
                  <Text style={styles.sheetAmt}>${selectedStrip.amount.toFixed(2)}</Text>
                </View>
                {selectedStrip.showReceiptBox ? (
                  <View style={styles.emailBox}>
                    <View style={styles.emailRow}>
                      <Ionicons name="mail-outline" size={12} color={prototype.blue} />
                      <Text style={styles.emailLbl}>MATCHED FROM EMAIL RECEIPT</Text>
                    </View>
                  </View>
                ) : null}
                {itemizedReceipt?.merchantType && itemizedReceipt.merchantDetails ? (
                  <>
                    <MerchantEnrichmentCard
                      merchantType={itemizedReceipt.merchantType}
                      merchantDetails={itemizedReceipt.merchantDetails}
                    />
                    {itemizedReceipt.merchantType === "ecommerce" && itemizedReceipt.items.length > 0 ? (
                      <MerchantItemsList
                        items={itemizedReceipt.items}
                        estimatedDelivery={(itemizedReceipt.merchantDetails as Record<string, unknown>).estimated_delivery as string | undefined}
                      />
                    ) : null}
                  </>
                ) : selectedStrip.cardDetailIsReceipt && selectedStrip.receiptId ? (
                  <>
                    <Text style={styles.itemizedSectionTitle}>Itemized receipt</Text>
                    <ItemizedReceiptPreview
                      loading={itemizedLoading}
                      error={itemizedError}
                      merchantName={itemizedReceipt?.merchantName ?? ""}
                      items={itemizedReceipt?.items ?? []}
                      subtotal={itemizedReceipt?.subtotal ?? 0}
                      tax={itemizedReceipt?.tax ?? 0}
                      tip={itemizedReceipt?.tip ?? 0}
                      extras={itemizedReceipt?.extras ?? []}
                      total={itemizedReceipt?.total ?? selectedStrip.amount}
                    />
                  </>
                ) : null}
                <TouchableOpacity
                  style={styles.splitBtn}
                  onPress={() => {
                    const row = selectedStrip;
                    setSelectedStrip(null);
                    router.push({
                      pathname: "/(tabs)/add-expense",
                      params: {
                        prefillDesc: row.merchant,
                        prefillAmount: row.amount.toFixed(2),
                        prefillNonce: String(Date.now()),
                      },
                    });
                  }}
                >
                  <Ionicons name="git-branch-outline" size={18} color="#fff" />
                  <Text style={styles.splitBtnText}>Split this charge</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetClose} onPress={() => setSelectedStrip(null)}>
                  <Text style={styles.sheetCloseText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={showAllBank} transparent animationType="slide" onRequestClose={() => { setShowAllBank(false); setSearchMode("keyword"); askClear(); }}>
        <Pressable style={styles.sheetOverlay} onPress={() => { setShowAllBank(false); setSearchMode("keyword"); askClear(); }}>
          <Pressable style={[styles.sheet, { maxHeight: "92%" }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.allBankHead}>
              <Text style={styles.sheetMerchant}>Bank charges</Text>
              <TouchableOpacity onPress={() => { setShowAllBank(false); setSearchMode("keyword"); askClear(); }} hitSlop={8}>
                <Ionicons name="close" size={18} color={darkUI.labelMuted} />
              </TouchableOpacity>
            </View>

            {/* Search / Ask tab toggle */}
            <View style={searchStyles.tabRow}>
              {([["keyword", "Search", "search"] as const, ["natural", "Ask", "sparkles"] as const]).map(([mode, label, icon]) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => { setSearchMode(mode); setBankSearch(""); askClear(); }}
                  style={[searchStyles.tab, searchMode === mode && searchStyles.tabActive]}
                >
                  <Ionicons name={icon as any} size={13} color={searchMode === mode ? "#fff" : darkUI.labelMuted} />
                  <Text style={[searchStyles.tabText, searchMode === mode && searchStyles.tabTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search input */}
            <View style={[styles.sheetSearchWrap, searchMode === "natural" && bankSearch.trim() ? { borderColor: "#A78BFA60" } : {}]}>
              <Ionicons
                name={searchMode === "natural" ? "sparkles" : "search"}
                size={16}
                color={searchMode === "natural" && bankSearch.trim() ? "#A78BFA" : darkUI.labelMuted}
              />
              <TextInput
                value={bankSearch}
                onChangeText={(text) => {
                  setBankSearch(text);
                  if (searchMode === "natural" && text.trim()) {
                    const dateOpts = dateFilterRange
                      ? { dateStart: dateFilterRange.start.toISOString().slice(0, 10), dateEnd: dateFilterRange.end.toISOString().slice(0, 10) }
                      : undefined;
                    askSearch(text, dateOpts);
                  } else if (searchMode === "natural" && !text.trim()) {
                    askClear();
                  }
                }}
                onSubmitEditing={() => {
                  if (searchMode === "natural" && bankSearch.trim()) {
                    const dateOpts = dateFilterRange
                      ? { dateStart: dateFilterRange.start.toISOString().slice(0, 10), dateEnd: dateFilterRange.end.toISOString().slice(0, 10) }
                      : undefined;
                    askSearch(bankSearch, dateOpts);
                  }
                }}
                placeholder={searchMode === "natural" ? "Ask in plain English..." : "Search by name, amount, etc."}
                placeholderTextColor={darkUI.labelMuted}
                style={styles.sheetSearchInput}
                returnKeyType={searchMode === "natural" ? "search" : "done"}
              />
              {bankSearch.length > 0 && (
                <TouchableOpacity onPress={() => { setBankSearch(""); askClear(); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={darkUI.labelMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Date filter presets */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
              {([["all", "All time"], ["week", "Last 7 days"], ["month", "Last 30 days"], ["custom", "Custom"]] as const).map(([preset, label]) => (
                <TouchableOpacity
                  key={preset}
                  onPress={() => {
                    setDatePreset(preset);
                    if (preset === "custom") setShowCalendar(true);
                    else { setShowCalendar(false); setCustomDateStart(null); setCustomDateEnd(null); }
                  }}
                  style={[searchStyles.dateChip, datePreset === preset && searchStyles.dateChipActive]}
                >
                  <Text style={[searchStyles.dateChipText, datePreset === preset && searchStyles.dateChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Calendar picker for Custom */}
            {datePreset === "custom" && showCalendar ? (
              <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                <CalendarPicker
                  startDate={customDateStart}
                  endDate={customDateEnd}
                  onSelect={(start, end) => { setCustomDateStart(start); setCustomDateEnd(end); }}
                />
              </View>
            ) : null}

            {/* Ask mode: AI answer banner */}
            {searchMode === "natural" && askResults?.answer && !askLoading ? (
              <View style={searchStyles.answerBanner}>
                <Ionicons name="sparkles" size={14} color="#A78BFA" />
                <Text style={searchStyles.answerText}>{askResults.answer}</Text>
              </View>
            ) : null}

            {/* Ask mode: loading */}
            {searchMode === "natural" && askLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <ActivityIndicator size="small" color="#A78BFA" />
                <Text style={[searchStyles.loadingText, { color: darkUI.labelMuted }]}>Searching...</Text>
              </View>
            ) : null}

            {/* Ask mode: error */}
            {searchMode === "natural" && askError && !askLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <Text style={{ color: "#F87171", fontSize: 13, fontFamily: font.medium }}>{askError}</Text>
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {searchMode === "keyword" ? (
                /* Keyword search: local filtered transactions */
                filteredAllBankRows.length === 0 ? (
                  <View style={[styles.emptyBank, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.emptyBankText, { color: theme.textTertiary }]}>No charges found.</Text>
                  </View>
                ) : (
                  <View style={styles.groupedCard}>
                    {filteredAllBankRows.map((tx, i) => (
                      <View key={tx.id}>
                        <TouchableOpacity
                          style={styles.friendRow}
                          activeOpacity={0.75}
                          onPress={() => {
                            setShowAllBank(false);
                            haptic.selection();
                            setSelectedStrip(txToSheetRow(tx));
                          }}
                        >
                          <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]}>
                            <MerchantLogo
                              merchantName={tx.merchant || tx.rawDescription || "Purchase"}
                              size={22}
                              fallbackText="💳"
                              backgroundColor="transparent"
                              borderColor="transparent"
                            />
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.friendName} numberOfLines={1}>
                              {tx.merchant || tx.rawDescription || "Purchase"}
                            </Text>
                            <Text style={styles.friendMeta} numberOfLines={1}>
                              {tx.dateStr || tx.date || "—"}{tx.alreadySplit ? " · split" : ""}
                            </Text>
                          </View>
                          <Text style={[styles.friendAmt, styles.balAmtOut]}>
                            ${Math.abs(Number(tx.amount)).toFixed(2)}
                          </Text>
                          {!tx.alreadySplit ? (
                            <View style={styles.bankSplitPill}>
                              <Text style={styles.bankSplitPillText}>Split</Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                        {i < filteredAllBankRows.length - 1 ? <View style={styles.rowSep} /> : null}
                      </View>
                    ))}
                  </View>
                )
              ) : (
                /* Ask mode: API search results */
                !askLoading && !askError && askResults ? (
                  askResults.transactions.length === 0 ? (
                    <View style={[styles.emptyBank, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <Text style={[styles.emptyBankText, { color: theme.textTertiary }]}>No transactions found. Try a different question.</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={searchStyles.resultCount}>
                        {askResults.count} transaction{askResults.count !== 1 ? "s" : ""}
                        {askResults.date_range ? ` · ${askResults.date_range.earliest} – ${askResults.date_range.latest}` : ""}
                      </Text>
                      <View style={styles.groupedCard}>
                        {askResults.transactions.map((tx: SearchTransaction, i: number) => {
                          const merchant = tx.merchant_name || tx.normalized_merchant || tx.raw_name || "Purchase";
                          const category = tx.detailed_category || tx.primary_category;
                          const location = [tx.city, tx.region].filter(Boolean).join(", ");
                          return (
                            <View key={tx.id}>
                              <View style={styles.friendRow}>
                                <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]}>
                                  <MerchantLogo merchantName={merchant} size={22} fallbackText="💳" backgroundColor="transparent" borderColor="transparent" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                  <Text style={styles.friendName} numberOfLines={1}>{merchant}</Text>
                                  <Text style={styles.friendMeta} numberOfLines={1}>
                                    {tx.date}{category ? ` · ${category}` : ""}{location ? ` · ${location}` : ""}
                                  </Text>
                                </View>
                                <Text style={[styles.friendAmt, tx.amount < 0 ? { color: "#4ade80" } : styles.balAmtOut]}>
                                  {tx.amount < 0 ? "+" : "-"}${Math.abs(tx.amount).toFixed(2)}
                                </Text>
                              </View>
                              {i < askResults.transactions.length - 1 ? <View style={styles.rowSep} /> : null}
                            </View>
                          );
                        })}
                      </View>
                    </>
                  )
                ) : !askLoading && !askError && !askResults && bankSearch.trim() === "" ? (
                  <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 24 }}>
                    <Ionicons name="sparkles-outline" size={36} color={darkUI.labelMuted} />
                    <Text style={[styles.emptyBankText, { color: darkUI.labelMuted, marginTop: 10, textAlign: "center" }]}>
                      Ask about your transactions
                    </Text>
                    <Text style={{ color: darkUI.labelMuted, fontSize: 12, fontFamily: font.regular, textAlign: "center", marginTop: 6 }}>
                      Try "how much on food this month" or "Uber rides last week"
                    </Text>
                  </View>
                ) : null
              )}
            </ScrollView>
            <TouchableOpacity style={styles.sheetClose} onPress={() => { setShowAllBank(false); setSearchMode("keyword"); askClear(); }}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F3F2" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 132 },
  header: { marginBottom: 16, paddingTop: 4, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { fontSize: 42, lineHeight: 44, fontFamily: font.black, color: "#1F2328", letterSpacing: -1.2 },
  titleSub: { fontSize: 13, fontFamily: font.medium, color: "#6B7280", marginTop: 2 },
  sLabel: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: "#9AA0A6",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  seeAll: { fontSize: 13, fontFamily: font.semibold, color: "#1F2328" },
  bankSyncHint: {
    fontSize: 12,
    fontFamily: font.regular,
    color: "#7A8088",
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 17,
  },
  bankCard: {
    width: 168,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 11,
    ...shadow.sm,
  },
  bankCardEmail: { borderColor: "#D9D7F0" },
  bankTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 9 },
  bankEmojiWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F6F2EF",
    alignItems: "center",
    justifyContent: "center",
  },
  mailDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: prototype.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  bankMerchant: { fontSize: 13, fontFamily: font.bold, color: "#1F2328", marginBottom: 2 },
  bankHint: { fontSize: 10, fontFamily: font.regular, color: "#81868D", marginBottom: 7 },
  bankEmailLine: { fontSize: 10, fontFamily: font.regular, color: prototype.blue, marginBottom: 7 },
  bankAmt: {
    fontSize: 20,
    fontFamily: font.black,
    color: "#1F2328",
    letterSpacing: -0.8,
    marginBottom: 9,
  },
  bankCta: {
    borderWidth: 1,
    borderColor: "#D8D0CB",
    backgroundColor: "#F6F2EF",
    borderRadius: 9,
    paddingVertical: 8,
    alignItems: "center",
  },
  bankCtaText: { fontSize: 13, fontFamily: font.extrabold, color: "#24292E" },
  emptyBank: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    padding: 16,
  },
  emptyBankText: { fontSize: 13, fontFamily: font.regular, color: "#6B7280", lineHeight: 18 },
  emptyBankLoading: { alignItems: "center", paddingVertical: 24 },
  groupedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    overflow: "hidden",
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  friendName: { fontSize: 15, fontFamily: font.bold, color: "#1F2328" },
  friendMeta: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 2 },
  friendAmt: { fontSize: 16, fontFamily: font.black, marginRight: 4, letterSpacing: -0.3 },
  rowSep: { height: 1, backgroundColor: "#EEE8E4", marginLeft: 70 },
  sectionDivider: { height: 1, backgroundColor: "#EEE8E4" },
  inlineSectionLabel: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  inlineSectionLabelAfterFriends: { paddingTop: 12 },
  inlineSectionLabelFirst: {
    paddingTop: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEE8E4",
  },
  inlineSectionLabelText: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: "#8A9098",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  groupRowName: { fontSize: 16, fontFamily: font.semibold, color: "#1F2328" },
  groupRowSub: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 1 },
  groupRowBal: { fontSize: 16, fontFamily: font.extrabold, letterSpacing: -0.3, marginRight: 4 },
  balAmtIn: { color: prototype.green },
  balAmtOut: { color: prototype.red },
  balMuted: { color: "#8A9098" },
  emptyFriend: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    backgroundColor: "#FFFFFF",
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  emptyFriendTitle: { fontSize: 16, fontFamily: font.bold, color: "#1F2328", marginTop: 10 },
  emptyFriendSub: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 4, textAlign: "center" },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 8,
    borderWidth: 1,
    borderColor: "#E3DBD8",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D8D4CF",
    marginBottom: 16,
  },
  allBankHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sheetSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    borderRadius: 16,
    backgroundColor: "#F7F3F0",
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  sheetSearchInput: {
    flex: 1,
    color: "#1F2328",
    fontSize: 14,
    fontFamily: font.regular,
    paddingVertical: 0,
  },
  sheetFilterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  sheetFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F7F3F0",
    borderWidth: 1,
    borderColor: "#E3DBD8",
  },
  sheetFilterChipActive: {
    backgroundColor: "#1F2328",
    borderColor: "#1F2328",
  },
  sheetFilterText: {
    fontSize: 13,
    fontFamily: font.semibold,
    color: "#7A8088",
  },
  sheetFilterTextActive: {
    color: "#fff",
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  sheetEmoji: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F7F3F0",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3DBD8",
  },
  sheetMerchant: { fontSize: 17, fontFamily: font.extrabold, color: "#1F2328" },
  sheetDate: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 2 },
  sheetAmt: { fontSize: 22, fontFamily: font.black, color: "#1F2328", letterSpacing: -1 },
  emailBox: {
    backgroundColor: "#F7F3F0",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    marginBottom: 14,
  },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  emailLbl: {
    fontSize: 10,
    fontFamily: font.bold,
    color: prototype.blue,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  emailSnippet: { fontSize: 13, fontFamily: font.regular, color: "#3F464F" },
  splitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginBottom: 12,
  },
  splitBtnText: { fontSize: 16, fontFamily: font.bold, color: "#fff" },
  bankSplitPill: {
    marginLeft: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: `${prototype.amber}22`,
    borderWidth: 1,
    borderColor: `${prototype.amber}50`,
  },
  bankSplitPillText: {
    fontSize: 11,
    fontFamily: font.bold,
    color: prototype.amber,
  },
  sheetScroll: { maxHeight: 520 },
  itemizedSectionTitle: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: "#8A9098",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  sheetClose: { alignItems: "center", paddingVertical: 10 },
  sheetCloseText: { fontSize: 15, fontFamily: font.semibold, color: "#3F464F" },
  homeLoadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  homeLoadingText: {
    fontSize: 14,
    fontFamily: font.medium,
    color: "#7A8088",
  },
});

const searchStyles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#2a2d2e",
    borderRadius: 14,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 11,
  },
  tabActive: {
    backgroundColor: "#3d4043",
  },
  tabText: {
    fontSize: 12,
    fontFamily: font.bold,
    fontWeight: "700",
    color: "#7a7d80",
  },
  tabTextActive: {
    color: "#fff",
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3d4043",
    backgroundColor: "#2a2d2e",
  },
  dateChipActive: {
    borderColor: "#ffffff40",
    backgroundColor: "#3d4043",
  },
  dateChipText: {
    fontSize: 11,
    fontFamily: font.bold,
    fontWeight: "700",
    color: "#7a7d80",
  },
  dateChipTextActive: {
    color: "#fff",
  },
  answerBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#A78BFA18",
    borderWidth: 1,
    borderColor: "#A78BFA30",
  },
  answerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: font.medium,
    color: "#e0d4fc",
    lineHeight: 19,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: font.medium,
    marginTop: 8,
  },
  resultCount: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: "#7a7d80",
    paddingHorizontal: 16,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
