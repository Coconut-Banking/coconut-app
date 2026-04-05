/**
 * Home tab — UI matches `Create design prototype (1)/src/app/pages/MobileAppPage.tsx` HomeScreen.
 * No legacy transaction list / NL search on this screen (Insights is linked from here).
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useAuth } from "@clerk/expo";
import { useApiFetch } from "../../lib/api";
import { fetchReceiptDetailForTransaction } from "../../lib/fetch-receipt-detail";
import { getDemoItemizedReceipt } from "../../lib/demo-receipt-itemized";
import { ItemizedReceiptPreview } from "../../components/ItemizedReceiptPreview";
import { MerchantEnrichmentCard, MerchantItemsList } from "../../components/MerchantEnrichmentCard";
import type { ReceiptItem } from "../../lib/receipt-split";
import { useGroupsSummary, usePrefetchContactsSummary, usePrefetchActivity } from "../../hooks/useGroups";
import { MemberAvatar } from "../../components/MemberAvatar";
import { useTransactions, type Transaction } from "../../hooks/useTransactions";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";
import { useTheme } from "../../lib/theme-context";
import { BalanceHero } from "../../components/split/BalanceHero";
import { colors, font, radii, shadow, darkUI, prototype } from "../../lib/theme";
import { MerchantLogo } from "../../components/merchant/MerchantLogo";
import { HomeSkeletonScreen } from "../../components/ui";
import { PROTOTYPE_DEMO_BANK_CHARGES } from "../../lib/prototype-bank-demo";
import {
  buildLiveMatchedStrip,
  demoChargeToStripRow,
  merchantEmoji,
  type HomeBankStripRow,
} from "../../lib/home-bank-strip";
import { useSearch, type SearchTransaction } from "../../hooks/useSearch";
import { CalendarPicker } from "../../components/CalendarPicker";
import { friendBalanceLines, formatSplitCurrencyAmount, groupBalanceLines } from "../../lib/format-split-money";
import { sfx } from "../../lib/sounds";
import { TapToPayButtonIcon } from "../../components/TapToPayButtonIcon";
import { useDeviceContacts } from "../../hooks/useDeviceContacts";

/** Convert a raw bank Transaction into a sheet-compatible row (no receipt match). */
function txToSheetRow(tx: { id: string; merchant?: string; rawDescription?: string; amount: number; dateStr?: string; date?: string; alreadySplit?: boolean; receiptId?: string | null; hasReceipt?: boolean; logoUrl?: string | null; category?: string }): HomeBankStripRow {
  const merchant = tx.merchant || tx.rawDescription || "Purchase";
  const hasReceipt = Boolean(tx.receiptId || tx.hasReceipt);
  return {
    stripId: tx.id,
    merchant,
    emoji: merchantEmoji(merchant),
    amount: Math.abs(Number(tx.amount)),
    cardDetailLine: tx.dateStr || tx.date || "",
    cardDetailIsReceipt: hasReceipt,
    hasMailBadge: hasReceipt,
    sheetDateLine: tx.dateStr || tx.date || "",
    showReceiptBox: hasReceipt,
    receiptId: tx.receiptId ?? null,
    logoUrl: tx.logoUrl ?? null,
    category: tx.category ?? null,
  };
}


const SLabel = React.memo(function SLabel({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[styles.sLabel, { color: theme.textTertiary }]}>{children}</Text>;
});

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
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { summary: apiSummary, loading: summaryLoading, refetch } = useGroupsSummary();
  usePrefetchContactsSummary();
  usePrefetchActivity();

  const summary = isDemoOn ? demo.summary : apiSummary;
  const [dismissedBank, setDismissedBank] = useState<string[]>([]);
  const [selectedStrip, setSelectedStrip] = useState<HomeBankStripRow | null>(null);
  const openedFromListRef = useRef(false);
  const [showAllBank, setShowAllBank] = useState(false);
  const dismissAllBankRef = useRef(() => {});
  dismissAllBankRef.current = () => { setShowAllBank(false); setSearchMode("keyword"); askClear(); };
  const allBankPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderRelease: (_, g) => { if (g.dy > 40) dismissAllBankRef.current(); },
    })
  ).current;
  const [bankSearch, setBankSearch] = useState("");
  const [bankFilter, setBankFilter] = useState<"all" | "unsplit">("all");
  const [searchMode, setSearchMode] = useState<"keyword" | "natural">("keyword");
  const [datePreset, setDatePreset] = useState<"all" | "week" | "month" | "custom" | "receipts">("all");
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
    rideshare?: import("../../lib/fetch-receipt-detail").ReceiptDetailPayload["rideshare"];
    subtotal: number;
    tax: number;
    tip: number;
    total: number;
    extras: Array<{ name: string; amount: number }>;
  } | null>(null);
  const [itemizedLoading, setItemizedLoading] = useState(false);
  const [itemizedError, setItemizedError] = useState<string | null>(null);

  // Contacts banner (one-time dismissable)
  const { permissionStatus: contactsPerm, requestAccess: requestContactsAccess } = useDeviceContacts();
  const [contactsBannerDismissed, setContactsBannerDismissed] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem("coconut.contacts.banner.dismissed").then((v) => {
      if (v !== "true") setContactsBannerDismissed(false);
    });
  }, []);
  const dismissContactsBanner = useCallback(() => {
    setContactsBannerDismissed(true);
    AsyncStorage.setItem("coconut.contacts.banner.dismissed", "true");
  }, []);
  const handleConnectContacts = useCallback(async () => {
    try {
      const granted = await requestContactsAccess();
      if (granted) dismissContactsBanner();
    } catch {
      dismissContactsBanner();
    }
  }, [requestContactsAccess, dismissContactsBanner]);
  const showContactsBanner =
    !contactsBannerDismissed &&
    contactsPerm !== "granted" &&
    isSignedIn &&
    !isDemoOn;

  // Avoid treating Clerk's initial isSignedIn=false/undefined as "guest" — that flashed demo bank while session loads.
  const useDemoBankUi = isDemoOn || (authLoaded && !isSignedIn);
  const { transactions, linked, loading: txLoading, runFullSync } = useTransactions();
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

  const closeDetail = useCallback(() => {
    setSelectedStrip(null);
  }, []);

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
        const da = new Date(a.date || "").getTime();
        const db = new Date(b.date || "").getTime();
        return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
      })
      .slice(0, 500);
  }, [bankVisibleTransactions, linked]);

  const dateFilterRange = useMemo((): { start: Date; end: Date } | null => {
    if (datePreset === "all" || datePreset === "receipts") return null;
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
      if (datePreset === "receipts" && !tx.hasReceipt && !tx.receiptId) return false;
      if (dateFilterRange) {
        // Use tx.date (ISO "2026-03-31") — tx.dateStr is a human label ("Mar 31") that new Date() can't parse
        const txDate = new Date(tx.date || "");
        if (!Number.isNaN(txDate.getTime())) {
          const txDay = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
          const startDay = new Date(dateFilterRange.start.getFullYear(), dateFilterRange.start.getMonth(), dateFilterRange.start.getDate());
          const endDay = new Date(dateFilterRange.end.getFullYear(), dateFilterRange.end.getMonth(), dateFilterRange.end.getDate());
          if (txDay < startDay || txDay > endDay) return false;
        }
      }
      if (!q) return true;
      const merchant = (tx.merchant || tx.rawDescription || "").toLowerCase();
      return merchant.includes(q) || String(Math.abs(Number(tx.amount)).toFixed(2)).includes(q);
    });
  }, [allLinkedBankRows, bankFilter, bankSearch, dateFilterRange, datePreset]);

  const onRefresh = useCallback(async () => {
    if (isDemoOn) return;
    setRefreshing(true);
    try {
      await Promise.all([refetch(), runFullSync(false)]);
    } finally {
      setRefreshing(false);
    }
  }, [isDemoOn, refetch, runFullSync]);

  const isFocused = useIsFocused();
  const prevFocused = useRef(false);
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;

  useEffect(() => {
    if (isFocused && !prevFocused.current && !isDemoOn) void refetch();
    prevFocused.current = isFocused;
  }, [isFocused, isDemoOn, refetch]);

  useEffect(() => {
    if (isDemoOn) return;
    const subs = [
      DeviceEventEmitter.addListener("groups-updated", () => { if (focusedRef.current) void refetch(); }),
      DeviceEventEmitter.addListener("expense-added", () => { if (focusedRef.current) void refetch(); }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [isDemoOn, refetch]);

  useEffect(() => {
    if (isDemoOn) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
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

  /**
   * Transitive date filter: when the AI parses a date range from the query
   * (e.g. "last two weeks"), reflect it in the date chips so keyword search
   * also respects that window. Only applies if the user hasn't manually set a filter.
   */
  useEffect(() => {
    if (!askResults?.applied_filters) return;
    const { date_start, date_end } = askResults.applied_filters;
    if (!date_start || !date_end) return;
    if (datePreset !== "all") return; // user already has a manual filter, don't override
    setDatePreset("custom");
    setCustomDateStart(new Date(date_start + "T12:00:00"));
    setCustomDateEnd(new Date(date_end + "T12:00:00"));
    setShowCalendar(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askResults]);

  const friends = summary?.friends ?? [];
  const groups = summary?.groups ?? [];
  const hasFriendsOrGroups = friends.length > 0 || groups.length > 0;
  const friendExpenseCount = (key: string) =>
    isDemoOn ? (demo.personDetails[key]?.activity.length ?? 0) : undefined;

  if (initialHomeLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top"]}>
        <HomeSkeletonScreen />
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
        <BalanceHero summary={summary} />

        {showContactsBanner ? (
          <View style={[styles.contactsBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}>
              <View style={[styles.contactsIconWrap, { backgroundColor: "#F5F3F2" }]}>
                <Ionicons name="people-circle" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactsBannerTitle, { color: theme.text }]}>Connect your contacts</Text>
                <Text style={[styles.contactsBannerSub, { color: theme.textTertiary }]}>
                  Quickly find friends when splitting expenses
                </Text>
              </View>
              <TouchableOpacity onPress={dismissContactsBanner} hitSlop={10} style={{ padding: 4 }}>
                <Ionicons name="close" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.contactsBannerBtn, { backgroundColor: colors.primary }]}
              onPress={handleConnectContacts}
              activeOpacity={0.85}
            >
              <Text style={styles.contactsBannerBtnTxt}>Allow access</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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
                        logoUrl={item.logoUrl}
                        category={item.category}
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
        ) : !useDemoBankUi && !txLoading && linked && stripRows.length > 0 ? (
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
                  onPress={() => { sfx.pop(); setSelectedStrip(item); }}
                >
                  <View style={styles.bankTop}>
                    <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]}>
                      <MerchantLogo
                        merchantName={item.merchant}
                        size={22}
                        logoUrl={item.logoUrl}
                        category={item.category}
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
                      <MemberAvatar name={f.displayName} size={42} imageUrl={null} variant="soft" />
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
                        {g.imageUrl ? (
                          <Image source={{ uri: g.imageUrl }} style={styles.groupIconImg} />
                        ) : (
                          <View style={styles.groupIcon}>
                            <Ionicons name="people" size={18} color="#1F2937" />
                          </View>
                        )}
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

      <Modal visible={!!selectedStrip && !showAllBank} transparent animationType="slide" onRequestClose={closeDetail}>
        <Pressable style={styles.sheetOverlay} onPress={closeDetail}>
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
                      logoUrl={selectedStrip.logoUrl}
                      category={selectedStrip.category}
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
                {selectedStrip.receiptId ? (
                  itemizedReceipt?.merchantType === "rideshare" ? (
                    <>
                      <Text style={styles.itemizedSectionTitle}>Trip details</Text>
                      {itemizedReceipt.rideshare?.map_url ? (
                        <Image
                          source={{ uri: itemizedReceipt.rideshare.map_url }}
                          style={styles.rideshareMap}
                          resizeMode="cover"
                        />
                      ) : null}
                      <View style={styles.rideshareRoute}>
                        <View style={styles.rideshareRouteDots}>
                          <View style={[styles.routeDot, { backgroundColor: "#22c55e" }]} />
                          <View style={styles.routeLine} />
                          <View style={[styles.routeDot, { backgroundColor: "#ef4444" }]} />
                        </View>
                        <View style={{ flex: 1, gap: 12 }}>
                          <View>
                            <Text style={styles.rideshareLabel}>Pickup</Text>
                            <Text style={styles.rideshareAddr}>{itemizedReceipt.rideshare?.pickup ?? "—"}</Text>
                          </View>
                          <View>
                            <Text style={styles.rideshareLabel}>Dropoff</Text>
                            <Text style={styles.rideshareAddr}>{itemizedReceipt.rideshare?.dropoff ?? "—"}</Text>
                          </View>
                        </View>
                      </View>
                      {(itemizedReceipt.rideshare?.distance || itemizedReceipt.rideshare?.duration || itemizedReceipt.rideshare?.driver_name || itemizedReceipt.rideshare?.vehicle) ? (
                        <Text style={styles.rideshareMeta}>
                          {[
                            itemizedReceipt.rideshare?.distance,
                            itemizedReceipt.rideshare?.duration,
                            itemizedReceipt.rideshare?.driver_name ? `Driver: ${itemizedReceipt.rideshare.driver_name}` : undefined,
                            itemizedReceipt.rideshare?.vehicle,
                          ].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                      {itemizedReceipt.rideshare?.fare_breakdown ? (
                        <View style={styles.rideshareBreakdown}>
                          {Object.entries(itemizedReceipt.rideshare.fare_breakdown).map(([key, val]) => (
                            <View key={key} style={styles.rideshareBreakdownRow}>
                              <Text style={styles.rideshareBreakdownLabel}>
                                {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                              </Text>
                              <Text style={styles.rideshareBreakdownAmt}>${Number(val).toFixed(2)}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <View style={styles.rideshareTotals}>
                        {itemizedReceipt.subtotal > 0 ? (
                          <View style={styles.rideshareBreakdownRow}>
                            <Text style={styles.rideshareBreakdownLabel}>Subtotal</Text>
                            <Text style={styles.rideshareBreakdownAmt}>${itemizedReceipt.subtotal.toFixed(2)}</Text>
                          </View>
                        ) : null}
                        {itemizedReceipt.tax > 0 ? (
                          <View style={styles.rideshareBreakdownRow}>
                            <Text style={styles.rideshareBreakdownLabel}>Tax</Text>
                            <Text style={styles.rideshareBreakdownAmt}>${itemizedReceipt.tax.toFixed(2)}</Text>
                          </View>
                        ) : null}
                        {itemizedReceipt.tip > 0 ? (
                          <View style={styles.rideshareBreakdownRow}>
                            <Text style={styles.rideshareBreakdownLabel}>Tip</Text>
                            <Text style={styles.rideshareBreakdownAmt}>${itemizedReceipt.tip.toFixed(2)}</Text>
                          </View>
                        ) : null}
                        <View style={[styles.rideshareBreakdownRow, styles.rideshareTotalRow]}>
                          <Text style={styles.rideshareTotalLabel}>Total</Text>
                          <Text style={styles.rideshareTotalAmt}>${itemizedReceipt.total.toFixed(2)}</Text>
                        </View>
                      </View>
                    </>
                  ) : itemizedReceipt?.merchantType === "food_delivery" ? (
                    <>
                      <Text style={styles.itemizedSectionTitle}>
                        {(itemizedReceipt.merchantDetails as Record<string, unknown>)?.restaurant_name
                          ? String((itemizedReceipt.merchantDetails as Record<string, unknown>).restaurant_name)
                          : "Order details"}
                      </Text>
                      {itemizedReceipt.merchantDetails ? (
                        <MerchantEnrichmentCard merchantType="food_delivery" merchantDetails={itemizedReceipt.merchantDetails} />
                      ) : null}
                      <ItemizedReceiptPreview
                        loading={itemizedLoading}
                        error={itemizedError}
                        merchantName={itemizedReceipt.merchantName}
                        items={itemizedReceipt.items}
                        subtotal={itemizedReceipt.subtotal}
                        tax={itemizedReceipt.tax}
                        tip={itemizedReceipt.tip}
                        extras={itemizedReceipt.extras}
                        total={itemizedReceipt.total}
                      />
                    </>
                  ) : itemizedReceipt?.merchantType === "saas" ? (
                    <>
                      <Text style={styles.itemizedSectionTitle}>Subscription</Text>
                      {itemizedReceipt.merchantDetails ? (
                        <MerchantEnrichmentCard merchantType="saas" merchantDetails={itemizedReceipt.merchantDetails} />
                      ) : null}
                      {itemizedReceipt.items.length > 0 ? (
                        <ItemizedReceiptPreview
                          loading={itemizedLoading}
                          error={itemizedError}
                          merchantName={itemizedReceipt.merchantName}
                          items={itemizedReceipt.items}
                          subtotal={itemizedReceipt.subtotal}
                          tax={itemizedReceipt.tax}
                          tip={itemizedReceipt.tip}
                          extras={itemizedReceipt.extras}
                          total={itemizedReceipt.total}
                        />
                      ) : (
                        <View style={styles.saasTotal}>
                          {itemizedReceipt.tax > 0 ? (
                            <View style={styles.saasTotalRow}>
                              <Text style={styles.saasTotalLabel}>Tax</Text>
                              <Text style={styles.saasTotalAmt}>${itemizedReceipt.tax.toFixed(2)}</Text>
                            </View>
                          ) : null}
                          <View style={[styles.saasTotalRow, styles.saasTotalFinal]}>
                            <Text style={styles.saasTotalLabelBold}>Total</Text>
                            <Text style={styles.saasTotalAmtBold}>${itemizedReceipt.total.toFixed(2)}</Text>
                          </View>
                        </View>
                      )}
                    </>
                  ) : itemizedReceipt?.merchantType === "retail" ? (
                    <>
                      <Text style={styles.itemizedSectionTitle}>Receipt</Text>
                      {itemizedReceipt.merchantDetails ? (
                        <MerchantEnrichmentCard merchantType="retail" merchantDetails={itemizedReceipt.merchantDetails} />
                      ) : null}
                      <ItemizedReceiptPreview
                        loading={itemizedLoading}
                        error={itemizedError}
                        merchantName={itemizedReceipt.merchantName}
                        items={itemizedReceipt.items}
                        subtotal={itemizedReceipt.subtotal}
                        tax={itemizedReceipt.tax}
                        tip={itemizedReceipt.tip}
                        extras={itemizedReceipt.extras}
                        total={itemizedReceipt.total}
                      />
                    </>
                  ) : itemizedReceipt?.merchantType === "ecommerce" && itemizedReceipt.merchantDetails ? (
                    <>
                      <Text style={styles.itemizedSectionTitle}>Order details</Text>
                      <MerchantEnrichmentCard
                        merchantType="ecommerce"
                        merchantDetails={itemizedReceipt.merchantDetails}
                      />
                      <ItemizedReceiptPreview
                        loading={itemizedLoading}
                        error={itemizedError}
                        merchantName={itemizedReceipt.merchantName}
                        items={itemizedReceipt.items}
                        subtotal={itemizedReceipt.subtotal}
                        tax={itemizedReceipt.tax}
                        tip={itemizedReceipt.tip}
                        extras={itemizedReceipt.extras}
                        total={itemizedReceipt.total}
                      />
                    </>
                  ) : (
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
                  )
                ) : selectedStrip.showReceiptBox && !selectedStrip.receiptId ? (
                  <Text style={styles.receiptIdHint}>
                    Line items appear when each transaction includes a receipt id from your backend (same id as web
                    receipt split).
                  </Text>
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
                        prefillPersonKey: "",
                        prefillPersonName: "",
                        prefillPersonType: "",
                      },
                    });
                  }}
                >
                  <Ionicons name="git-branch-outline" size={18} color="#fff" />
                  <Text style={styles.splitBtnText}>Split this charge</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetClose} onPress={closeDetail}>
                  <Text style={styles.sheetCloseText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={showAllBank} transparent animationType="slide" onRequestClose={() => { setShowAllBank(false); setSearchMode("keyword"); askClear(); }}>
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setShowAllBank(false); setSearchMode("keyword"); askClear(); }} />
          <Pressable style={[styles.sheet, { maxHeight: "92%", flex: 1 }]} onPress={(e) => e.stopPropagation()}>
            <View {...allBankPan.panHandlers} style={{ paddingVertical: 10, alignItems: "center" }}>
              <View style={[styles.sheetHandle, { marginTop: 0, marginBottom: 0 }]} />
            </View>
            {selectedStrip && showAllBank ? (
              <>
                <View style={styles.allBankHead}>
                  <TouchableOpacity onPress={closeDetail} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="chevron-back" size={18} color="#8A9098" />
                    <Text style={[styles.sheetMerchant, { fontSize: 15, color: "#8A9098" }]}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setSelectedStrip(null); dismissAllBankRef.current(); }} hitSlop={8}>
                    <Ionicons name="close" size={20} color="#8A9098" />
                  </TouchableOpacity>
                </View>
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
                        logoUrl={selectedStrip.logoUrl}
                        category={selectedStrip.category}
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
                  {selectedStrip.receiptId && itemizedReceipt ? (
                    <>
                      <Text style={styles.itemizedSectionTitle}>Details</Text>
                      <ItemizedReceiptPreview
                        loading={itemizedLoading}
                        error={itemizedError}
                        merchantName={itemizedReceipt.merchantName}
                        items={itemizedReceipt.items}
                        subtotal={itemizedReceipt.subtotal}
                        tax={itemizedReceipt.tax}
                        tip={itemizedReceipt.tip}
                        extras={itemizedReceipt.extras}
                        total={itemizedReceipt.total}
                      />
                    </>
                  ) : itemizedLoading ? (
                    <View style={{ alignItems: "center", paddingVertical: 24 }}>
                      <ActivityIndicator size="small" color="#8A9098" />
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.splitBtn}
                    onPress={() => {
                      const row = selectedStrip;
                      setSelectedStrip(null);
                      dismissAllBankRef.current();
                      router.push({
                        pathname: "/(tabs)/add-expense",
                        params: {
                          prefillDesc: row.merchant,
                          prefillAmount: row.amount.toFixed(2),
                          prefillNonce: String(Date.now()),
                          prefillPersonKey: "",
                          prefillPersonName: "",
                          prefillPersonType: "",
                        },
                      });
                    }}
                  >
                    <Ionicons name="git-branch-outline" size={18} color="#fff" />
                    <Text style={styles.splitBtnText}>Split this charge</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            ) : (
            <>
            <View style={styles.allBankHead}>
              <Text style={styles.sheetMerchant}>Transactions</Text>
              <TouchableOpacity onPress={() => { dismissAllBankRef.current(); }} hitSlop={8}>
                <Ionicons name="close" size={20} color="#8A9098" />
              </TouchableOpacity>
            </View>

            {/* Search / Ask tab toggle */}
            <View style={searchStyles.tabRow}>
              {([["keyword", "Search", "search"] as const, ["natural", "Ask", "sparkles"] as const]).map(([mode, label, icon]) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => {
                    setSearchMode(mode);
                    setBankSearch("");
                    askClear();
                    setDatePreset("all");
                    setCustomDateStart(null);
                    setCustomDateEnd(null);
                    setShowCalendar(false);
                  }}
                  style={[searchStyles.tab, searchMode === mode && searchStyles.tabActive]}
                >
                  <Ionicons name={icon as any} size={13} color={searchMode === mode ? "#fff" : "#8A9098"} />
                  <Text style={[searchStyles.tabText, searchMode === mode && searchStyles.tabTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search input */}
            <View style={[styles.sheetSearchWrap, searchMode === "natural" && bankSearch.trim() ? { borderColor: "#7C3AED40" } : {}]}>
              <Ionicons
                name={searchMode === "natural" ? "sparkles" : "search"}
                size={16}
                color={searchMode === "natural" && bankSearch.trim() ? "#7C3AED" : "#B0B5BC"}
              />
              <TextInput
                value={bankSearch}
                onChangeText={(text) => {
                  setBankSearch(text);
                  if (searchMode === "natural" && !text.trim()) {
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
                placeholderTextColor="#B0B5BC"
                style={styles.sheetSearchInput}
                returnKeyType={searchMode === "natural" ? "search" : "done"}
              />
              {bankSearch.length > 0 && (
                <TouchableOpacity onPress={() => { setBankSearch(""); askClear(); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color="#B0B5BC" />
                </TouchableOpacity>
              )}
            </View>

            {/* Date filter presets */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
              {([["all", "All time"], ["week", "Last 7 days"], ["month", "Last 30 days"], ["receipts", "Email Receipts"]] as const).map(([preset, label]) => (
                <TouchableOpacity
                  key={preset}
                  onPress={() => {
                    setDatePreset(preset);
                    setShowCalendar(false);
                    setCustomDateStart(null);
                    setCustomDateEnd(null);
                  }}
                  style={[searchStyles.dateChip, datePreset === preset && searchStyles.dateChipActive]}
                >
                  {preset === "receipts" ? <Ionicons name="mail-outline" size={13} color={datePreset === "receipts" ? "#fff" : "#8A9098"} style={{ marginRight: 4 }} /> : null}
                  <Text style={[searchStyles.dateChipText, datePreset === preset && searchStyles.dateChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => {
                  setDatePreset("custom");
                  setShowCalendar(true);
                }}
                style={[searchStyles.dateChip, datePreset === "custom" && searchStyles.dateChipActive]}
              >
                <Text style={[searchStyles.dateChipText, datePreset === "custom" && searchStyles.dateChipTextActive]}>
                  {datePreset === "custom" && customDateStart && customDateEnd
                    ? `${customDateStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${customDateEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : "Custom"}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Calendar picker for Custom */}
            {datePreset === "custom" && showCalendar ? (
              <View style={{ marginBottom: 12 }}>
                <CalendarPicker
                  startDate={customDateStart}
                  endDate={customDateEnd}
                  onSelect={(start, end) => { setCustomDateStart(start); setCustomDateEnd(end); }}
                />
                <TouchableOpacity
                  style={[searchStyles.applyBtn, (!customDateStart || !customDateEnd) && searchStyles.applyBtnDisabled]}
                  onPress={() => {
                    if (customDateStart && customDateEnd) setShowCalendar(false);
                  }}
                  disabled={!customDateStart || !customDateEnd}
                >
                  <Text style={searchStyles.applyBtnText}>
                    {customDateStart && customDateEnd ? "Apply range" : "Select start & end date"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Ask mode: AI answer banner */}
            {searchMode === "natural" && askResults?.answer && !askLoading ? (
              <View style={searchStyles.answerBanner}>
                <Ionicons name="sparkles" size={18} color="#7C3AED" />
                <Text style={searchStyles.answerText}>{askResults.answer}</Text>
              </View>
            ) : null}

            {/* Ask mode: loading */}
            {searchMode === "natural" && askLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <ActivityIndicator size="small" color="#7C3AED" />
                <Text style={[searchStyles.loadingText, { color: "#8A9098" }]}>Searching...</Text>
              </View>
            ) : null}

            {/* Ask mode: error */}
            {searchMode === "natural" && askError && !askLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <Text style={{ color: "#DC2626", fontSize: 13, fontFamily: font.medium }}>{askError}</Text>
              </View>
            ) : null}

            {searchMode === "natural" && (askLoading || askResults || askError) ? (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {!askLoading && !askError && askResults ? (
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
                                  <MerchantLogo merchantName={merchant} size={22} category={category} backgroundColor="transparent" borderColor="transparent" />
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
                ) : null}
              </ScrollView>
            ) : (
              filteredAllBankRows.length === 0 ? (
                <View style={[styles.emptyBank, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 16 }]}>
                  <Text style={[styles.emptyBankText, { color: theme.textTertiary }]}>No charges found.</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredAllBankRows}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                  initialNumToRender={15}
                  maxToRenderPerBatch={20}
                  windowSize={7}
                  ItemSeparatorComponent={() => <View style={styles.rowSep} />}
                  renderItem={({ item: tx }) => (
                    <TouchableOpacity
                      style={styles.friendRow}
                      activeOpacity={0.75}
                      onPress={() => {
                        sfx.pop();
                        setSelectedStrip(txToSheetRow(tx));
                      }}
                    >
                      <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]}>
                        <MerchantLogo
                          merchantName={tx.merchant || tx.rawDescription || "Purchase"}
                          size={22}
                          logoUrl={tx.logoUrl}
                          category={tx.category}
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
                        <TouchableOpacity
                          style={styles.bankSplitPill}
                          hitSlop={8}
                          onPress={(e) => {
                            e.stopPropagation();
                            sfx.toggle();
                            setShowAllBank(false);
                            router.push({
                              pathname: "/(tabs)/add-expense",
                              params: {
                                prefillDesc: tx.merchant || tx.rawDescription || "",
                                prefillAmount: Math.abs(Number(tx.amount)).toFixed(2),
                                prefillNonce: String(Date.now()),
                                prefillPersonKey: "",
                                prefillPersonName: "",
                                prefillPersonType: "",
                              },
                            });
                          }}
                        >
                          <Text style={styles.bankSplitPillText}>Split</Text>
                        </TouchableOpacity>
                      ) : null}
                    </TouchableOpacity>
                  )}
                />
              )
            )}
            </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F3F2" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 132 },
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
  groupIconImg: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
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
  saasTotal: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    marginTop: 4,
    paddingTop: 8,
    gap: 4,
  },
  saasTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  saasTotalFinal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  saasTotalLabel: { fontSize: 13, fontFamily: font.regular, color: "#6b7280" },
  saasTotalAmt: { fontSize: 13, fontFamily: font.regular, color: "#6b7280" },
  saasTotalLabelBold: { fontSize: 15, fontFamily: font.semibold, color: "#1f2937" },
  saasTotalAmtBold: { fontSize: 15, fontFamily: font.bold, color: "#1f2937" },
  receiptIdHint: {
    fontSize: 13,
    fontFamily: font.regular,
    color: "#7A8088",
    lineHeight: 18,
    marginBottom: 14,
  },
  rideshareMap: {
    width: "100%",
    height: 160,
    borderRadius: radii.md,
    marginBottom: 12,
    backgroundColor: "#f0f0f0",
  },
  rideshareRoute: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  rideshareRouteDots: {
    alignItems: "center",
    paddingTop: 4,
    gap: 0,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 1,
    height: 32,
    backgroundColor: "#d1d5db",
  },
  rideshareLabel: {
    fontSize: 11,
    fontFamily: font.medium,
    color: "#9ca3af",
    marginBottom: 2,
  },
  rideshareAddr: {
    fontSize: 13,
    fontFamily: font.regular,
    color: "#1f2937",
    lineHeight: 18,
  },
  rideshareMeta: {
    fontSize: 12,
    fontFamily: font.regular,
    color: "#6b7280",
    marginTop: 4,
    marginBottom: 8,
  },
  rideshareBreakdown: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    marginTop: 8,
    paddingTop: 8,
    gap: 4,
  },
  rideshareBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rideshareBreakdownLabel: {
    fontSize: 12,
    fontFamily: font.regular,
    color: "#6b7280",
  },
  rideshareBreakdownAmt: {
    fontSize: 12,
    fontFamily: font.regular,
    color: "#6b7280",
  },
  rideshareTotals: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    marginTop: 8,
    paddingTop: 8,
    gap: 4,
  },
  rideshareTotalRow: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  rideshareTotalLabel: {
    fontSize: 14,
    fontFamily: font.semibold,
    color: "#1f2937",
  },
  rideshareTotalAmt: {
    fontSize: 14,
    fontFamily: font.semibold,
    color: "#1f2937",
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
  contactsBanner: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: 16,
    marginBottom: 18,
    gap: 12,
  },
  contactsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  contactsBannerTitle: {
    fontSize: 15,
    fontFamily: font.semibold,
  },
  contactsBannerSub: {
    fontSize: 13,
    fontFamily: font.regular,
    marginTop: 2,
  },
  contactsBannerBtn: {
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  contactsBannerBtnTxt: {
    color: "#fff",
    fontSize: 15,
    fontFamily: font.semibold,
  },
});

const searchStyles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    marginBottom: 10,
    backgroundColor: "#F0EDEA",
    borderRadius: 12,
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
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "#1F2328",
  },
  tabText: {
    fontSize: 12,
    fontFamily: font.bold,
    fontWeight: "700",
    color: "#8A9098",
  },
  tabTextActive: {
    color: "#fff",
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    backgroundColor: "#FFFFFF",
  },
  dateChipActive: {
    borderColor: "#1F2328",
    backgroundColor: "#1F2328",
  },
  dateChipText: {
    fontSize: 11,
    fontFamily: font.bold,
    fontWeight: "700",
    color: "#8A9098",
  },
  dateChipTextActive: {
    color: "#fff",
  },
  answerBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F3F0FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  answerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: font.semibold,
    color: "#4C1D95",
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: font.medium,
    marginTop: 8,
  },
  resultCount: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: "#8A9098",
    paddingHorizontal: 16,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  applyBtn: {
    marginTop: 10,
    backgroundColor: "#1e2021",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  applyBtnDisabled: {
    backgroundColor: "#D8D4CF",
  },
  applyBtnText: {
    fontSize: 14,
    fontFamily: font.semibold,
    color: "#fff",
  },
});

const ttpStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radii.xl,
    borderWidth: 1,
    marginBottom: 18,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  sub: {
    fontSize: 13,
    fontFamily: font.regular,
    marginTop: 2,
  },
});
