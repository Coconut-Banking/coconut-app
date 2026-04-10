import React, { useCallback, useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  DeviceEventEmitter,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import type { Href } from "expo-router";
import { useRecentActivity, markActivitySeen, type RecentActivityItem } from "../../hooks/useGroups";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";
import { font, radii, prototype, colors } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

type ActivityFilter = "all" | "get_back" | "owe" | "settled";

const FILTER_OPTIONS: { value: ActivityFilter; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string }[] = [
  { value: "all",       label: "All",         icon: "list-outline",       color: "#6B7280" },
  { value: "get_back",  label: "You're owed",  icon: "arrow-down-outline", color: "#3A7D44" },
  { value: "owe",       label: "You owe",      icon: "arrow-up-outline",   color: "#C23934" },
  { value: "settled",   label: "Settled",      icon: "checkmark-outline",  color: "#6B7280" },
];

function ActivityHeader({
  filter,
  showMenu,
  onToggleMenu,
}: {
  filter: ActivityFilter;
  showMenu: boolean;
  onToggleMenu: () => void;
}) {
  const { theme } = useTheme();
  const isFiltered = filter !== "all";
  const activeOption = FILTER_OPTIONS.find((o) => o.value === filter)!;

  return (
    <View style={styles.headerRow}>
      <View>
        <Text style={[styles.title, { color: theme.text }]}>Activity</Text>
        <Text style={[styles.titleSub, { color: theme.textTertiary }]}>Splits & settlements</Text>
      </View>
      <TouchableOpacity
        onPress={onToggleMenu}
        style={[styles.filterBtn, showMenu && { backgroundColor: theme.surfaceSecondary }]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Filter activity"
        activeOpacity={0.7}
      >
        <Ionicons
          name="options-outline"
          size={20}
          color={isFiltered ? activeOption.color : theme.textSecondary}
        />
        {isFiltered ? (
          <View style={[styles.filterDot, { backgroundColor: activeOption.color }]} />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function FilterMenu({
  filter,
  onSelect,
  onClose,
}: {
  filter: ActivityFilter;
  onSelect: (f: ActivityFilter) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  return (
    <>
      {/* Tap-outside dismissal overlay */}
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        activeOpacity={1}
        accessible={false}
      />
      <View style={[styles.filterMenu, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {FILTER_OPTIONS.map((opt, i) => {
          const isActive = filter === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.filterMenuItem,
                isActive && { backgroundColor: theme.surfaceSecondary },
                i < FILTER_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
              ]}
              onPress={() => { onSelect(opt.value); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.filterMenuIcon, { backgroundColor: isActive ? opt.color + "22" : theme.surfaceSecondary }]}>
                <Ionicons name={opt.icon} size={14} color={isActive ? opt.color : theme.textTertiary} />
              </View>
              <Text style={[styles.filterMenuLabel, { color: isActive ? theme.text : theme.textSecondary, fontFamily: isActive ? font.semibold : font.regular }]}>
                {opt.label}
              </Text>
              {isActive ? <Ionicons name="checkmark" size={16} color={opt.color} style={{ marginLeft: "auto" }} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

function activitySearchHaystack(it: RecentActivityItem): string {
  return [it.who, it.action, it.what, it.in, it.time, it.amount.toFixed(2), String(Math.round(it.amount * 100) / 100)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ActivityTabScreen() {
  const { theme } = useTheme();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { activity: realActivity, loading, refetch } = useRecentActivity(!isDemoOn);
  const activity = isDemoOn ? demo.activity : realActivity;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);

  const filteredActivity = useMemo(() => {
    let items = activity;
    if (filter !== "all") {
      items = items.filter((it) => it.direction === filter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => activitySearchHaystack(it).includes(q));
  }, [activity, search, filter]);

  const onRefresh = useCallback(async () => {
    if (isDemoOn) return;
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [isDemoOn, refetch]);

  useEffect(() => {
    if (isFocused && !prevFocused.current && !isDemoOn) refetch();
    if (isFocused) markActivitySeen();
    prevFocused.current = isFocused;
  }, [isFocused, isDemoOn, refetch]);

  useEffect(() => {
    if (isFocused && activity.length > 0) markActivitySeen();
  }, [isFocused, activity]);

  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;
  useEffect(() => {
    if (isDemoOn) return;
    const subs = [
      DeviceEventEmitter.addListener("groups-updated", () => { if (focusedRef.current) refetch(); }),
      DeviceEventEmitter.addListener("expense-added", () => { refetch(true); }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [isDemoOn, refetch]);

  useEffect(() => {
    if (isDemoOn) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && focusedRef.current) refetch();
    });
    return () => sub.remove();
  }, [isDemoOn, refetch]);

  const showInitialLoading = !isDemoOn && loading && activity.length === 0;

  const onToggleFilterMenu = useCallback(() => setShowFilterMenu((v) => !v), []);
  const onCloseFilterMenu = useCallback(() => setShowFilterMenu(false), []);

  const activeFilterOption = useMemo(
    () => FILTER_OPTIONS.find((o) => o.value === filter)!,
    [filter]
  );
  const sectionLabel = useMemo(
    () =>
      filter === "all"
        ? (search.trim() ? `Matches · ${filteredActivity.length}` : "Recent")
        : (search.trim() ? `Matches · ${filteredActivity.length}` : activeFilterOption.label),
    [filter, search, filteredActivity.length, activeFilterOption.label]
  );

  const keyExtractor = useCallback((item: RecentActivityItem) => item.id, []);

  const activityCount = filteredActivity.length;
  const renderActivityItem = useCallback(
    ({ item, index }: { item: RecentActivityItem; index: number }) => {
      const isFirst = index === 0;
      const isLast = index === activityCount - 1;
      return (
        <View
          style={[
            styles.cardItem,
            { backgroundColor: theme.surface, borderColor: theme.border },
            isFirst && styles.cardItemFirst,
            isLast && styles.cardItemLast,
          ]}
        >
          <ActivityRow it={item} showSep={!isLast} />
        </View>
      );
    },
    [activityCount, theme.surface, theme.border]
  );

  const listEmptyComponent = useMemo(() => {
    if (showInitialLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (!activity.length) {
      return (
        <View style={[styles.groupedCard, styles.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="time-outline" size={32} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No activity</Text>
          <Text style={[styles.emptySub, { color: theme.textTertiary }]}>Expenses and settlements show up here as they happen.</Text>
        </View>
      );
    }
    return (
      <View style={[styles.groupedCard, styles.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search-outline" size={32} color={theme.textTertiary} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No matches</Text>
        <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
          {filter !== "all" ? `No "${activeFilterOption.label.toLowerCase()}" items yet.` : "Try another name, merchant, or amount."}
        </Text>
      </View>
    );
  }, [showInitialLoading, activity.length, theme.surface, theme.border, theme.textTertiary, theme.text, filter, activeFilterOption.label]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <FlatList
        data={filteredActivity}
        keyExtractor={keyExtractor}
        renderItem={renderActivityItem}
        style={styles.scroll}
        contentContainerStyle={[styles.page, showInitialLoading && styles.pageLoading]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          isDemoOn ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          )
        }
        ListHeaderComponent={
          <>
            <View style={styles.pad}>
              <ActivityHeader
                filter={filter}
                showMenu={showFilterMenu}
                onToggleMenu={onToggleFilterMenu}
              />
              {showFilterMenu ? (
                <FilterMenu
                  filter={filter}
                  onSelect={setFilter}
                  onClose={onCloseFilterMenu}
                />
              ) : null}
            </View>
            {!showInitialLoading && (
              <>
                <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="search" size={18} color={theme.textTertiary} />
                  <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search people, merchants, amounts…"
                    placeholderTextColor={theme.textTertiary}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={200}
                  />
                  {search.length > 0 ? (
                    <TouchableOpacity onPress={() => setSearch("")} hitSlop={10} accessibilityLabel="Clear search">
                      <Ionicons name="close-circle" size={18} color="#8A9098" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sLabel}>{sectionLabel}</Text>
                  {(search.trim() || filter !== "all") && activity.length > 0 ? (
                    <Text style={styles.sLabelMeta}>{activity.length} total</Text>
                  ) : null}
                </View>
              </>
            )}
          </>
        }
        ListEmptyComponent={listEmptyComponent}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function currencySymbol(code?: string): string {
  switch (code) {
    case "CAD": return "CA$";
    case "EUR": return "€";
    case "GBP": return "£";
    default: return "$";
  }
}

const ActivityRow = React.memo(function ActivityRow({ it, showSep }: { it: RecentActivityItem; showSep: boolean }) {
  const { theme } = useTheme();
  const sym = currencySymbol(it.currency);
  const isSettlement = it.direction === "settled";

  const handlePress = useCallback(() => {
    if (!isSettlement) {
      router.push({ pathname: "/(tabs)/shared/transaction", params: { id: it.id } } as Href);
    }
  }, [isSettlement, it.id]);

  return (
    <View>
      <TouchableOpacity
        style={styles.groupedRow}
        activeOpacity={isSettlement ? 1 : 0.7}
        onPress={handlePress}
        disabled={isSettlement}
      >
        {it.receiptUrl ? (
          <Image source={{ uri: it.receiptUrl }} style={styles.actThumb} />
        ) : (
          <View
            style={[
              styles.actDot,
              {
                backgroundColor:
                  it.direction === "get_back"
                    ? prototype.greenBg
                    : it.direction === "owe"
                      ? prototype.redBg
                      : theme.surfaceSecondary,
              },
            ]}
          >
            <Ionicons
              name={isSettlement ? "checkmark" : it.direction === "get_back" ? "arrow-down" : "arrow-up"}
              size={14}
              color={
                it.direction === "get_back"
                  ? prototype.green
                  : it.direction === "owe"
                    ? prototype.red
                    : "#8A9098"
              }
            />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.actWho, { color: theme.text }]} numberOfLines={2}>
            <Text style={{ fontFamily: font.bold }}>{it.who}</Text> {it.action}
            {it.what ? (isSettlement ? ` ${it.what}` : ` "${it.what}"`) : ""}
          </Text>
          {it.in ? <Text style={[styles.actIn, { color: theme.textTertiary }]}>{it.in}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {isSettlement ? (
            <Text style={[styles.actAmt, { color: "#8A9098" }]}>
              {sym}{it.amount.toFixed(2)}
            </Text>
          ) : (
            <Text style={[styles.actAmt, it.direction === "get_back" ? styles.green : styles.red]}>
              {it.direction === "get_back" ? "+" : "−"}{sym}{it.amount.toFixed(2)}
            </Text>
          )}
          <Text style={styles.actTime}>{it.time}</Text>
        </View>
      </TouchableOpacity>
      {showSep ? <View style={[styles.rowSep, { backgroundColor: theme.borderLight }]} /> : null}
    </View>
  );
});

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
    width: 200,
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
    height: 46,
    borderWidth: 1,
    borderColor: "#E3DBD8",
  },
  searchInput: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 16,
    color: "#1F2328",
    paddingVertical: 0,
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
  cardItem: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  cardItemFirst: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    overflow: "hidden",
  },
  cardItemLast: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
  },
  groupedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowSep: { height: 1, backgroundColor: "#EEE8E4", marginLeft: 66 },
  emptyInner: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontFamily: font.bold, color: "#1F2328", marginTop: 12 },
  emptySub: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 4, textAlign: "center" },
  actDot: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  actThumb: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#F7F3F0" },
  actWho: { fontSize: 14, fontFamily: font.regular, color: "#1F2328", lineHeight: 20 },
  actIn: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 2 },
  actAmt: { fontSize: 14, fontFamily: font.extrabold },
  actTime: { fontSize: 11, fontFamily: font.regular, color: "#8A9098", marginTop: 2 },
  green: { color: "#3A7D44" },
  red: { color: "#C23934" },
});
