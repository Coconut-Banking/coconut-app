import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { useRecentActivity, type RecentActivityItem } from "../../hooks/useGroups";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";
import { font, radii, prototype, colors } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

function ActivityHeader() {
  const { theme } = useTheme();
  return (
    <View style={styles.headerRow}>
      <View>
        <Text style={[styles.title, { color: theme.text }]}>Activity</Text>
        <Text style={[styles.titleSub, { color: theme.textTertiary }]}>Splits & settlements</Text>
      </View>
      <TouchableOpacity
        onPress={() => router.push("/(tabs)/settings")}
        style={styles.settingsBtn}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <Ionicons name="settings-outline" size={22} color={theme.textSecondary} />
      </TouchableOpacity>
    </View>
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
  const [refreshing, setRefreshing] = useState(false);
  const isFocused = useIsFocused();
  const prevFocused = useRef(false);

  const filteredActivity = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activity;
    return activity.filter((it) => activitySearchHaystack(it).includes(q));
  }, [activity, search]);

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
    prevFocused.current = isFocused;
  }, [isFocused, isDemoOn, refetch]);

  if (!isDemoOn && loading && activity.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={styles.pad}>
          <ActivityHeader />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isDemoOn ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          )
        }
      >
        <View style={styles.pad}>
          <ActivityHeader />
        </View>

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
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="#8A9098" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.sectionLabelRow}>
          <Text style={styles.sLabel}>
            {search.trim() ? `Matches · ${filteredActivity.length}` : "Recent"}
          </Text>
          {search.trim() && activity.length > 0 ? (
            <Text style={styles.sLabelMeta}>{activity.length} total</Text>
          ) : null}
        </View>
        {!activity.length ? (
          <View style={[styles.groupedCard, styles.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="time-outline" size={32} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No activity</Text>
            <Text style={[styles.emptySub, { color: theme.textTertiary }]}>Expenses and settlements show up here as they happen.</Text>
          </View>
        ) : !filteredActivity.length ? (
          <View style={[styles.groupedCard, styles.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={32} color={theme.textTertiary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No matches</Text>
            <Text style={[styles.emptySub, { color: theme.textTertiary }]}>Try another name, merchant, or amount.</Text>
          </View>
        ) : (
          <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {filteredActivity.map((it, i) => (
              <ActivityRow key={it.id} it={it} showSep={i < filteredActivity.length - 1} />
            ))}
          </View>
        )}
      </ScrollView>
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

function ActivityRow({ it, showSep }: { it: RecentActivityItem; showSep: boolean }) {
  const { theme } = useTheme();
  const sym = currencySymbol(it.currency);
  const isSettlement = it.direction === "settled";
  return (
    <View>
      <View style={styles.groupedRow}>
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
      </View>
      {showSep ? <View style={[styles.rowSep, { backgroundColor: theme.borderLight }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3F2" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  page: { paddingHorizontal: 20, paddingBottom: 120, paddingTop: 8 },
  pad: { paddingHorizontal: 0, paddingTop: 4, marginBottom: 16 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  settingsBtn: { padding: 4, marginTop: 2 },
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
  actWho: { fontSize: 14, fontFamily: font.regular, color: "#1F2328", lineHeight: 20 },
  actIn: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 2 },
  actAmt: { fontSize: 14, fontFamily: font.extrabold },
  actTime: { fontSize: 11, fontFamily: font.regular, color: "#8A9098", marginTop: 2 },
  green: { color: "#3A7D44" },
  red: { color: "#C23934" },
});
