import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTransactions, type Transaction } from "../../hooks/useTransactions";
import { useSearch, type SearchTransaction } from "../../hooks/useSearch";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useTheme } from "../../lib/theme-context";
import { font, colors, prototype, radii } from "../../lib/theme";
import { MerchantLogo } from "../../components/merchant/MerchantLogo";
import { CalendarPicker } from "../../components/CalendarPicker";
import { PROTOTYPE_DEMO_BANK_CHARGES } from "../../lib/prototype-bank-demo";
import { sfx } from "../../lib/sounds";
import { type HomeBankStripRow, txToSheetRow } from "../../lib/home-bank-strip";
import { fetchReceiptDetailForTransaction } from "../../lib/fetch-receipt-detail";
import { ItemizedReceiptPreview } from "../../components/ItemizedReceiptPreview";
import { useApiFetch } from "../../lib/api";
import type { ReceiptItem } from "../../lib/receipt-split";

const EMPTY_TX_LIST: Transaction[] = [];

function normalizeMerchant(tx: Transaction) {
  return (tx.merchant || tx.rawDescription || "purchase").trim().toLowerCase();
}

function txTimeMs(tx: Transaction) {
  const d = new Date(tx.dateStr || tx.date || "").getTime();
  return Number.isNaN(d) ? 0 : d;
}

/** Same as home “See all bank” — hide debit/credit pairs that net to zero within 7 days. */
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

function demoChargesToTransactions(): Transaction[] {
  const year = new Date().getFullYear();
  return PROTOTYPE_DEMO_BANK_CHARGES.map((c) => {
    const parsed = new Date(`${c.date} ${year}`);
    const iso = Number.isNaN(parsed.getTime())
      ? new Date().toISOString().slice(0, 10)
      : parsed.toISOString().slice(0, 10);
    return {
      id: c.id,
      merchant: c.merchant,
      rawDescription: c.merchant,
      amount: -Math.abs(c.amount),
      category: "",
      categoryColor: "#888888",
      date: iso,
      dateStr: c.date,
      merchantColor: "#888888",
      hasReceipt: Boolean(c.hasEmail),
      receiptId: c.receiptId ?? null,
      alreadySplit: !c.unsplit,
      logoUrl: null,
      accountName: c.accountName ?? null,
      accountMask: c.accountMask ?? null,
    };
  });
}

function pushPrefillFromKeywordRow(tx: Transaction) {
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
}

function pushPrefillFromSearchTx(tx: SearchTransaction) {
  const merchant = tx.merchant_name || tx.normalized_merchant || tx.raw_name || "Purchase";
  router.push({
    pathname: "/(tabs)/add-expense",
    params: {
      prefillDesc: merchant,
      prefillAmount: Math.abs(Number(tx.amount)).toFixed(2),
      prefillNonce: String(Date.now()),
      prefillPersonKey: "",
      prefillPersonName: "",
      prefillPersonType: "",
    },
  });
}

function BankHeader({
  accounts,
  activeFilter,
  showMenu,
  onToggleMenu,
}: {
  accounts: { mask: string; name: string }[];
  activeFilter: string | null;
  showMenu: boolean;
  onToggleMenu: () => void;
}) {
  const { theme } = useTheme();
  const showFilterIcon = accounts.length > 1;
  const isFiltered = activeFilter !== null;

  return (
    <View style={styles.headerRow}>
      <View>
        <Text style={[styles.title, { color: theme.text }]}>Bank</Text>
        <Text style={[styles.titleSub, { color: theme.textTertiary }]}>Your linked transactions</Text>
      </View>
      {showFilterIcon ? (
        <TouchableOpacity
          onPress={onToggleMenu}
          style={[styles.filterBtn, showMenu && { backgroundColor: theme.surfaceSecondary }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Filter by account"
          activeOpacity={0.7}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={isFiltered ? colors.primary : theme.textSecondary}
          />
          {isFiltered ? (
            <View style={[styles.filterDot, { backgroundColor: colors.primary }]} />
          ) : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function AccountFilterMenu({
  accounts,
  activeFilter,
  onSelect,
  onClose,
}: {
  accounts: { mask: string; name: string }[];
  activeFilter: string | null;
  onSelect: (mask: string | null) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const options = [{ mask: null as string | null, name: "All accounts" }, ...accounts];
  return (
    <>
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        activeOpacity={1}
        accessible={false}
      />
      <View style={[styles.filterMenu, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {options.map((opt, i) => {
          const isActive = opt.mask === activeFilter;
          return (
            <TouchableOpacity
              key={opt.mask ?? "__all"}
              style={[
                styles.filterMenuItem,
                isActive && { backgroundColor: theme.surfaceSecondary },
                i < options.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
              ]}
              onPress={() => { onSelect(opt.mask); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.filterMenuIcon, { backgroundColor: isActive ? colors.primary + "22" : theme.surfaceSecondary }]}>
                <Ionicons
                  name={opt.mask ? "card-outline" : "layers-outline"}
                  size={14}
                  color={isActive ? colors.primary : theme.textTertiary}
                />
              </View>
              <Text
                style={[
                  styles.filterMenuLabel,
                  { color: isActive ? theme.text : theme.textSecondary, fontFamily: isActive ? font.semibold : font.regular },
                ]}
              >
                {opt.name}
              </Text>
              {isActive ? <Ionicons name="checkmark" size={16} color={colors.primary} style={{ marginLeft: "auto" }} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

export default function BankTabScreen() {
  const { theme } = useTheme();
  const { isDemoOn } = useDemoMode();
  const { transactions, linked, loading, refetch, runFullSync } = useTransactions();
  const { results: askResults, loading: askLoading, error: askError, search: askSearch, clear: askClear } =
    useSearch();
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);

  useEffect(() => {
    const wasFocused = prevFocused.current;
    prevFocused.current = isFocused;
    if (isFocused && !wasFocused && !isDemoOn) {
      refetch();
    }
  }, [isFocused, isDemoOn, refetch]);

  const bankVisibleTransactions = useMemo(() => filterOffsettingBankPairs(transactions), [transactions]);
  const demoTransactions = useMemo(() => (isDemoOn ? demoChargesToTransactions() : []), [isDemoOn]);
  const effectiveLinked = isDemoOn || linked;

  const [bankSearch, setBankSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"keyword" | "natural">("keyword");
  const [datePreset, setDatePreset] = useState<"all" | "week" | "month" | "custom" | "receipts">("all");
  const [customDateStart, setCustomDateStart] = useState<Date | null>(null);
  const [customDateEnd, setCustomDateEnd] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [selectedStrip, setSelectedStrip] = useState<HomeBankStripRow | null>(null);
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
  const apiFetch = useApiFetch();

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
    if (!selectedStrip.receiptId) {
      setItemizedLoading(false);
      return;
    }
    setItemizedLoading(true);
    fetchReceiptDetailForTransaction(apiFetch, selectedStrip.receiptId)
      .then((d) => {
        if (cancelled) return;
        if (d) setItemizedReceipt(d);
      })
      .catch(() => {
        if (!cancelled) setItemizedError("Could not load receipt details.");
      })
      .finally(() => {
        if (!cancelled) setItemizedLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedStrip, apiFetch]);

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

  const allLinkedBankRows = useMemo(() => {
    if (!effectiveLinked) return [];
    const source = isDemoOn ? demoTransactions : bankVisibleTransactions;
    return source
      .filter((tx) => Number(tx.amount) < 0)
      .sort((a, b) => {
        const da = new Date(a.date || "").getTime();
        const db = new Date(b.date || "").getTime();
        return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
      })
      .slice(0, 500);
  }, [bankVisibleTransactions, demoTransactions, effectiveLinked, isDemoOn]);

  const uniqueAccounts = useMemo(() => {
    const seen = new Map<string, { mask: string; name: string }>();
    for (const tx of allLinkedBankRows) {
      const mask = tx.accountMask;
      if (mask && !seen.has(mask)) {
        seen.set(mask, { mask, name: tx.accountName || `••••${mask}` });
      }
    }
    return Array.from(seen.values());
  }, [allLinkedBankRows]);

  const filteredAllBankRows = useMemo(() => {
    const q = committedSearch.trim().toLowerCase();
    return allLinkedBankRows.filter((tx) => {
      if (accountFilter && tx.accountMask !== accountFilter) return false;
      if (datePreset === "receipts" && !tx.hasReceipt && !tx.receiptId) return false;
      if (dateFilterRange) {
        const txDate = new Date(tx.date || "");
        if (!Number.isNaN(txDate.getTime())) {
          const txDay = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
          const startDay = new Date(
            dateFilterRange.start.getFullYear(),
            dateFilterRange.start.getMonth(),
            dateFilterRange.start.getDate(),
          );
          const endDay = new Date(
            dateFilterRange.end.getFullYear(),
            dateFilterRange.end.getMonth(),
            dateFilterRange.end.getDate(),
          );
          if (txDay < startDay || txDay > endDay) return false;
        }
      }
      if (!q) return true;
      const merchant = (tx.merchant || tx.rawDescription || "").toLowerCase();
      return merchant.includes(q) || String(Math.abs(Number(tx.amount)).toFixed(2)).includes(q);
    });
  }, [allLinkedBankRows, committedSearch, dateFilterRange, datePreset, accountFilter]);

  const resetFiltersForModeSwitch = useCallback(() => {
    setBankSearch("");
    setCommittedSearch("");
    askClear();
    setDatePreset("all");
    setCustomDateStart(null);
    setCustomDateEnd(null);
    setShowCalendar(false);
    setAccountFilter(null);
    setShowAccountMenu(false);
  }, [askClear]);

  const onRefresh = useCallback(async () => {
    if (isDemoOn) return;
    setRefreshing(true);
    try {
      await runFullSync(false);
    } finally {
      setRefreshing(false);
    }
  }, [isDemoOn, runFullSync]);

  useEffect(() => {
    if (!askResults?.applied_filters) return;
    const { date_start, date_end } = askResults.applied_filters;
    if (!date_start || !date_end) return;
    if (datePreset !== "all") return;
    setDatePreset("custom");
    setCustomDateStart(new Date(`${date_start}T12:00:00`));
    setCustomDateEnd(new Date(`${date_end}T12:00:00`));
    setShowCalendar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askResults]);

  const hasNoData = allLinkedBankRows.length === 0;
  const showInitialLoading = !isDemoOn && loading && hasNoData;
  const showConnectBank = !isDemoOn && !loading && !linked;

  const flatListData = useMemo(() => {
    if (showInitialLoading || showConnectBank || searchMode !== "keyword") return EMPTY_TX_LIST;
    return filteredAllBankRows;
  }, [showInitialLoading, showConnectBank, searchMode, filteredAllBankRows]);

  const bankRowKeyExtractor = useCallback(
    (item: Transaction, index: number) => item.id || String(index),
    [],
  );

  const renderBankRow = useCallback(
    ({ item: tx, index }: { item: Transaction; index: number }) => {
      const isFirst = index === 0;
      const isLast = index === flatListData.length - 1;
      return (
        <View
          style={[
            flatListCardStyles.row,
            { backgroundColor: theme.surface, borderColor: theme.border },
            isFirst && flatListCardStyles.firstRow,
            isLast && flatListCardStyles.lastRow,
          ]}
        >
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
              <Text style={[styles.friendName, { color: theme.text }]} numberOfLines={1}>
                {tx.merchant || tx.rawDescription || "Purchase"}
              </Text>
              <Text style={[styles.friendMeta, { color: theme.textTertiary }]} numberOfLines={1}>
                {tx.dateStr || tx.date || "—"}
                {tx.alreadySplit ? " · split" : ""}
              </Text>
            </View>
            <Text style={[styles.friendAmt, styles.balAmtOut]}>
              ${Math.abs(Number(tx.amount)).toFixed(2)}
            </Text>
            {!tx.alreadySplit ? (
              <TouchableOpacity
                style={styles.bankSplitPill}
                hitSlop={8}
                onPress={() => {
                  sfx.toggle();
                  pushPrefillFromKeywordRow(tx);
                }}
              >
                <Text style={styles.bankSplitPillText}>Split</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
          {!isLast ? (
            <View style={[styles.rowSep, { backgroundColor: theme.borderLight }]} />
          ) : null}
        </View>
      );
    },
    [flatListData.length, theme],
  );

  const renderAskSection = () => (
    <>
      {askResults?.answer && !askLoading ? (
        <View style={searchStyles.answerBanner}>
          <Ionicons name="sparkles" size={18} color="#7C3AED" />
          <Text style={searchStyles.answerText}>{askResults.answer}</Text>
        </View>
      ) : null}
      {askLoading ? (
        <View style={{ alignItems: "center", paddingVertical: 32 }}>
          <ActivityIndicator size="small" color="#7C3AED" />
          <Text style={[searchStyles.loadingText, { color: theme.textTertiary }]}>Searching...</Text>
        </View>
      ) : null}
      {askError && !askLoading ? (
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Text style={{ color: "#DC2626", fontSize: 13, fontFamily: font.medium }}>{askError}</Text>
        </View>
      ) : null}
      {!askLoading && !askError && askResults ? (
        askResults.transactions.length === 0 ? (
          <View style={[styles.groupedCard, styles.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
              No transactions found. Try a different question.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[searchStyles.resultCount, { color: theme.textTertiary }]}>
              {askResults.count} transaction{askResults.count !== 1 ? "s" : ""}
              {askResults.date_range ? ` · ${askResults.date_range.earliest} – ${askResults.date_range.latest}` : ""}
            </Text>
            <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {askResults.transactions.map((tx: SearchTransaction, i: number) => {
                const merchant = tx.merchant_name || tx.normalized_merchant || tx.raw_name || "Purchase";
                const category = tx.detailed_category || tx.primary_category || undefined;
                const location = [tx.city, tx.region].filter(Boolean).join(", ");
                return (
                  <View key={tx.id}>
                    <TouchableOpacity
                      style={styles.friendRow}
                      activeOpacity={0.75}
                      onPress={() => {
                        sfx.pop();
                        const merchant = tx.merchant_name || tx.normalized_merchant || tx.raw_name || "Purchase";
                        setSelectedStrip({
                          stripId: tx.id,
                          merchant,
                          emoji: merchant[0] ?? "•",
                          amount: Math.abs(tx.amount),
                          cardDetailLine: tx.date,
                          cardDetailIsReceipt: false,
                          hasMailBadge: false,
                          sheetDateLine: tx.date,
                          showReceiptBox: false,
                          receiptId: null,
                        });
                      }}
                    >
                      <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]}>
                        <MerchantLogo
                          merchantName={merchant}
                          size={22}
                          category={category}
                          backgroundColor="transparent"
                          borderColor="transparent"
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.friendName, { color: theme.text }]} numberOfLines={1}>
                          {merchant}
                        </Text>
                        <Text style={[styles.friendMeta, { color: theme.textTertiary }]} numberOfLines={1}>
                          {tx.date}
                          {category ? ` · ${category}` : ""}
                          {location ? ` · ${location}` : ""}
                        </Text>
                      </View>
                      <Text style={[styles.friendAmt, tx.amount > 0 ? { color: "#4ade80" } : styles.balAmtOut]}>
                        {tx.amount > 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                      </Text>
                      <TouchableOpacity
                        style={styles.bankSplitPill}
                        hitSlop={8}
                        onPress={() => {
                          sfx.toggle();
                          pushPrefillFromSearchTx(tx);
                        }}
                      >
                        <Text style={styles.bankSplitPillText}>Split</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {i < askResults.transactions.length - 1 ? (
                      <View style={[styles.rowSep, { backgroundColor: theme.borderLight }]} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <FlatList
          data={flatListData}
          keyExtractor={bankRowKeyExtractor}
          renderItem={renderBankRow}
          style={styles.scroll}
          contentContainerStyle={[styles.page, showConnectBank && styles.pageLoading]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          extraData={flatListData.length}
          refreshControl={
            isDemoOn ? undefined : (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            )
          }
          ListEmptyComponent={
            searchMode === "keyword" && !showInitialLoading && !showConnectBank ? (
              <View style={[styles.groupedCard, styles.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="card-outline" size={32} color={theme.textTertiary} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No charges found</Text>
                <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
                  Try another search or date filter.
                </Text>
              </View>
            ) : undefined
          }
          ListHeaderComponent={
            <>
          <View style={[styles.pad, { zIndex: 10 }]}>
            <BankHeader
              accounts={uniqueAccounts}
              activeFilter={accountFilter}
              showMenu={showAccountMenu}
              onToggleMenu={() => setShowAccountMenu((v) => !v)}
            />
            {showAccountMenu ? (
              <AccountFilterMenu
                accounts={uniqueAccounts}
                activeFilter={accountFilter}
                onSelect={setAccountFilter}
                onClose={() => setShowAccountMenu(false)}
              />
            ) : null}
          </View>

          {showInitialLoading ? (
            <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i}>
                  <View style={styles.friendRow}>
                    <View style={[styles.bankEmojiWrap, { backgroundColor: theme.surfaceSecondary }]} />
                    <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                      <View style={[styles.skeletonLine, { width: "55%", backgroundColor: theme.surfaceSecondary }]} />
                      <View style={[styles.skeletonLine, { width: "30%", backgroundColor: theme.surfaceSecondary }]} />
                    </View>
                    <View style={[styles.skeletonLine, { width: 50, backgroundColor: theme.surfaceSecondary }]} />
                  </View>
                  {i < 4 ? <View style={[styles.rowSep, { backgroundColor: theme.borderLight }]} /> : null}
                </View>
              ))}
            </View>
          ) : showConnectBank ? (
            <View style={[styles.groupedCard, styles.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="link-outline" size={36} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Connect your bank</Text>
              <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
                Link an account in Settings to see transactions here.
              </Text>
              <TouchableOpacity
                style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/(tabs)/settings")}
              >
                <Text style={styles.ctaBtnText}>Open Settings</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[searchStyles.tabRow, { backgroundColor: theme.surfaceSecondary }]}>
                {(
                  [
                    ["keyword", "Search", "search"],
                    ["natural", "Ask", "sparkles"],
                  ] as const
                ).map(([mode, label, icon]) => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => {
                      setSearchMode(mode);
                      resetFiltersForModeSwitch();
                    }}
                    style={[searchStyles.tab, searchMode === mode && searchStyles.tabActive]}
                  >
                    <Ionicons name={icon} size={13} color={searchMode === mode ? "#fff" : theme.textTertiary} />
                    <Text style={[searchStyles.tabText, searchMode === mode && searchStyles.tabTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View
                style={[
                  styles.searchBox,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  searchMode === "natural" && bankSearch.trim() ? { borderColor: "#7C3AED40" } : {},
                ]}
              >
                <Ionicons
                  name={searchMode === "natural" ? "sparkles" : "search"}
                  size={18}
                  color={searchMode === "natural" && bankSearch.trim() ? "#7C3AED" : theme.textTertiary}
                />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  value={bankSearch}
                  onChangeText={(text) => {
                    setBankSearch(text);
                    if (!text.trim()) {
                      setCommittedSearch("");
                      if (searchMode === "natural") askClear();
                    }
                  }}
                  onSubmitEditing={() => {
                    if (searchMode === "natural" && bankSearch.trim()) {
                      const dateOpts = dateFilterRange
                        ? {
                            dateStart: dateFilterRange.start.toISOString().slice(0, 10),
                            dateEnd: dateFilterRange.end.toISOString().slice(0, 10),
                          }
                        : undefined;
                      void askSearch(bankSearch, dateOpts);
                    } else if (searchMode === "keyword") {
                      setCommittedSearch(bankSearch);
                    }
                  }}
                  placeholder={searchMode === "natural" ? "Ask in plain English…" : "Search by name, amount, etc."}
                  placeholderTextColor={theme.textTertiary}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={200}
                />
                {bankSearch.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      setBankSearch("");
                      setCommittedSearch("");
                      askClear();
                    }}
                    hitSlop={10}
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0, marginBottom: 12 }}
                contentContainerStyle={{ gap: 6 }}
              >
                {(
                  [
                    ["all", "All time"],
                    ["week", "Last 7 days"],
                    ["month", "Last 30 days"],
                    ["receipts", "Email Receipts"],
                  ] as const
                ).map(([preset, label]) => (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => {
                      setDatePreset(preset);
                      setShowCalendar(false);
                      setCustomDateStart(null);
                      setCustomDateEnd(null);
                    }}
                    style={[
                      searchStyles.dateChip,
                      { borderColor: theme.border, backgroundColor: theme.surface },
                      datePreset === preset && searchStyles.dateChipActive,
                    ]}
                  >
                    {preset === "receipts" ? (
                      <Ionicons
                        name="mail-outline"
                        size={13}
                        color={datePreset === "receipts" ? "#fff" : theme.textTertiary}
                        style={{ marginRight: 4 }}
                      />
                    ) : null}
                    <Text
                      style={[
                        searchStyles.dateChipText,
                        { color: theme.textTertiary },
                        datePreset === preset && searchStyles.dateChipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => {
                    setDatePreset("custom");
                    setShowCalendar(true);
                  }}
                  style={[
                    searchStyles.dateChip,
                    { borderColor: theme.border, backgroundColor: theme.surface },
                    datePreset === "custom" && searchStyles.dateChipActive,
                  ]}
                >
                  <Text
                    style={[
                      searchStyles.dateChipText,
                      { color: theme.textTertiary },
                      datePreset === "custom" && searchStyles.dateChipTextActive,
                    ]}
                  >
                    {datePreset === "custom" && customDateStart && customDateEnd
                      ? `${customDateStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${customDateEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : "Custom"}
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {datePreset === "custom" && showCalendar ? (
                <View style={{ marginBottom: 12 }}>
                  <CalendarPicker
                    startDate={customDateStart}
                    endDate={customDateEnd}
                    onSelect={(start, end) => {
                      setCustomDateStart(start);
                      setCustomDateEnd(end);
                    }}
                    onApply={() => setShowCalendar(false)}
                  />
                </View>
              ) : null}

              <View style={styles.sectionLabelRow}>
                <Text style={[styles.sLabel, { color: theme.textTertiary }]}>
                  {searchMode === "natural"
                    ? "Ask Coconut"
                    : committedSearch.trim()
                      ? `Matches · ${filteredAllBankRows.length}`
                      : "Transactions"}
                </Text>
                {searchMode === "keyword" && committedSearch.trim() && allLinkedBankRows.length > 0 ? (
                  <Text style={[styles.sLabelMeta, { color: theme.textTertiary }]}>
                    {allLinkedBankRows.length} total
                  </Text>
                ) : null}
              </View>

              {searchMode === "natural" ? renderAskSection() : null}
            </>
          )}
            </>
          }
        />
      </KeyboardAvoidingView>

      {selectedStrip ? <Modal visible={true} transparent animationType="slide" onRequestClose={() => setSelectedStrip(null)}>
        <Pressable style={sheetStyles.overlay} onPress={() => setSelectedStrip(null)}>
          <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={sheetStyles.handle} />
            <ScrollView style={sheetStyles.scroll} showsVerticalScrollIndicator={false}>
              <View style={sheetStyles.head}>
                <View style={sheetStyles.logoWrap}>
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
                  <Text style={sheetStyles.merchant}>{selectedStrip.merchant}</Text>
                  <Text style={sheetStyles.date}>{selectedStrip.sheetDateLine}</Text>
                </View>
                <Text style={sheetStyles.amt}>${selectedStrip.amount.toFixed(2)}</Text>
              </View>

              {selectedStrip.isPending ? (
                <View style={sheetStyles.metaBadgeRow}>
                  <View style={[sheetStyles.metaBadge, { backgroundColor: "#FFF3E0" }]}>
                    <Ionicons name="time-outline" size={12} color="#E65100" />
                    <Text style={[sheetStyles.metaBadgeText, { color: "#E65100" }]}>Pending</Text>
                  </View>
                </View>
              ) : null}

              {(selectedStrip.isRecurring || selectedStrip.accountIndicator || selectedStrip.category) ? (
                <View style={sheetStyles.metaBadgeRow}>
                  {selectedStrip.isRecurring ? (
                    <View style={[sheetStyles.metaBadge, { backgroundColor: "#EDE7F6" }]}>
                      <Ionicons name="refresh-outline" size={12} color="#5E35B1" />
                      <Text style={[sheetStyles.metaBadgeText, { color: "#5E35B1" }]}>Recurring</Text>
                    </View>
                  ) : null}
                  {selectedStrip.category ? (
                    <View style={[sheetStyles.metaBadge, { backgroundColor: "#F3F4F6" }]}>
                      <Text style={[sheetStyles.metaBadgeText, { color: "#4B5563" }]}>
                        {selectedStrip.category.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Text>
                    </View>
                  ) : null}
                  {selectedStrip.accountIndicator ? (
                    <View style={[sheetStyles.metaBadge, { backgroundColor: "#F3F4F6" }]}>
                      <Ionicons name="card-outline" size={12} color="#4B5563" />
                      <Text style={[sheetStyles.metaBadgeText, { color: "#4B5563" }]}>{selectedStrip.accountIndicator}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {selectedStrip.showReceiptBox ? (
                <View style={sheetStyles.emailBox}>
                  <Ionicons name="mail-outline" size={12} color={prototype.blue} />
                  <Text style={sheetStyles.emailLbl}>MATCHED FROM EMAIL RECEIPT</Text>
                </View>
              ) : null}

              {selectedStrip.receiptId ? (
                <>
                  <Text style={sheetStyles.sectionTitle}>Details</Text>
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
              ) : itemizedLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <ActivityIndicator size="small" color="#8A9098" />
                </View>
              ) : null}

              {!selectedStrip.alreadySplit ? (
                <TouchableOpacity
                  style={sheetStyles.splitBtn}
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
                  <Text style={sheetStyles.splitBtnText}>Split this charge</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={sheetStyles.closeBtn} onPress={() => setSelectedStrip(null)}>
                <Text style={sheetStyles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3F2" },
  center: { justifyContent: "center", alignItems: "center", paddingTop: 60 },
  pageLoading: { flexGrow: 1 },
  scroll: { flex: 1 },
  page: { paddingHorizontal: 20, paddingBottom: 120, paddingTop: 8 },
  pad: { paddingHorizontal: 0, paddingTop: 4, marginBottom: 16 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  filterBtn: {
    padding: 8,
    marginTop: 2,
    borderRadius: 10,
  },
  filterDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: "#F5F3F2",
  },
  filterMenu: {
    position: "absolute",
    top: 52,
    right: 0,
    width: 220,
    borderRadius: 14,
    borderWidth: 1,
    zIndex: 100,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  filterMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  filterMenuIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  filterMenuLabel: {
    fontSize: 14,
  },
  title: { fontSize: 32, fontFamily: font.black, color: "#1F2328", letterSpacing: -0.9 },
  titleSub: { fontSize: 13, fontFamily: font.medium, color: "#7A8088", marginTop: 2 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#E3DBD8",
  },
  searchInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 16,
    color: "#1F2328",
    paddingVertical: 8,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sLabel: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: "#9AA0A6",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  sLabelMeta: {
    fontSize: 11,
    fontFamily: font.medium,
    color: "#9AA0A6",
  },
  groupedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    overflow: "hidden",
    marginBottom: 8,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  friendName: { fontSize: 15, fontFamily: font.bold },
  friendMeta: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  friendAmt: { fontSize: 16, fontFamily: font.black, marginRight: 4, letterSpacing: -0.3 },
  balAmtOut: { color: prototype.red },
  rowSep: { height: 1, marginLeft: 70 },
  bankEmojiWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
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
  emptyInner: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontFamily: font.bold, color: "#1F2328", marginTop: 12 },
  emptySub: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 4, textAlign: "center" },
  ctaBtn: {
    marginTop: 16,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  ctaBtnText: { fontSize: 15, fontFamily: font.semibold, color: "#fff" },
  skeletonLine: { height: 10, borderRadius: 5 },
});

const searchStyles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    marginBottom: 10,
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
    paddingHorizontal: 2,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F5F3F2",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  merchant: {
    fontSize: 16,
    fontFamily: font.semibold,
    color: "#1F2328",
  },
  date: {
    fontSize: 13,
    fontFamily: font.regular,
    color: "#8A9098",
    marginTop: 2,
  },
  amt: {
    fontSize: 18,
    fontFamily: font.bold,
    color: "#1F2328",
  },
  emailBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  emailLbl: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: prototype.blue,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.semibold,
    color: "#8A9098",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  splitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1F2328",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 16,
    marginBottom: 8,
  },
  splitBtnText: {
    fontSize: 15,
    fontFamily: font.semibold,
    color: "#fff",
  },
  closeBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  closeBtnText: {
    fontSize: 15,
    fontFamily: font.medium,
    color: "#8A9098",
  },
  metaBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  metaBadgeText: {
    fontSize: 12,
    fontFamily: font.medium,
  },
});

const flatListCardStyles = StyleSheet.create({
  row: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  firstRow: {
    borderTopWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
  },
  lastRow: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: "hidden",
    marginBottom: 8,
  },
});
