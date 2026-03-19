import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Animated,
  Alert,
  TextInput,
  Switch,
  RefreshControl,
  RefreshControlProps,
  AppState,
  DeviceEventEmitter,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useApiFetch } from "../../../lib/api";
import { useGroupsSummary, useRecentActivity } from "../../../hooks/useGroups";
import type { GroupsSummary, FriendBalance, GroupSummary as GroupSummaryType, RecentActivityItem } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { useDemoData } from "../../../lib/demo-context";
import { SnapPress, SharedSkeletonScreen, haptic } from "../../../components/ui";
import { colors, font, fontSize, shadow, radii, space, card, type as T } from "../../../lib/theme";

const TABS = ["Friends", "Groups", "Activity"] as const;
const C = ["#3D8E62", "#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#8B5CF6"];

function Avatar({ name, size = 40, color }: { name: string; size?: number; color?: string }) {
  const bg = color ?? C[name.charCodeAt(0) % C.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.35 }}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Balance Card ──

function BalanceCard({ s }: { s: GroupsSummary }) {
  const net = s.netBalance ?? 0;
  return (
    <View style={[st.balCard, net > 0 && st.balCardGreen, net < 0 && st.balCardRed]}>
      <View style={st.balTop}>
        <Text style={st.balLabel}>{net > 0 ? "You are owed" : net < 0 ? "You owe" : "All settled up"}</Text>
        {net !== 0 && <Text style={[st.balAmount, net > 0 ? st.green : st.red]}>${Math.abs(net).toFixed(2)}</Text>}
      </View>
      <View style={st.balBottom}>
        <View style={{ flex: 1 }}>
          <Text style={st.balSmLabel}>Owed to you</Text>
          <Text style={[st.balSmVal, st.green]}>${(s.totalOwedToMe ?? 0).toFixed(2)}</Text>
        </View>
        <View style={st.balDivider} />
        <View style={{ flex: 1 }}>
          <Text style={st.balSmLabel}>You owe</Text>
          <Text style={[st.balSmVal, st.red]}>${(s.totalIOwe ?? 0).toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Tab Indicator ──

function TabBar({ active, scrollX, width, onPress }: { active: number; scrollX: Animated.Value; width: number; onPress: (i: number) => void }) {
  const w = width / 3;
  const tx = scrollX.interpolate({ inputRange: [0, width, width * 2], outputRange: [0, w, w * 2], extrapolate: "clamp" });
  return (
    <View style={st.tabBar}>
      <Animated.View style={[st.tabPill, { width: w, transform: [{ translateX: tx }] }]} />
      {TABS.map((t, i) => (
        <TouchableOpacity key={t} style={st.tabItem} onPress={() => onPress(i)} activeOpacity={0.7}>
          <Text style={[st.tabText, i === active && st.tabTextActive]}>{t}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Friends Page ──

function FriendsPage({ friends, w, refreshControl }: { friends: FriendBalance[]; w: number; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  return (
    <ScrollView style={{ width: w }} contentContainerStyle={st.page} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
      {!friends.length ? (
        <View style={st.empty}>
          <Ionicons name="person-add-outline" size={32} color="#D1D5DB" />
          <Text style={st.emptyTitle}>No friends yet</Text>
          <Text style={st.emptySub}>Add members to a group to start.</Text>
        </View>
      ) : friends.map((f, i) => (
        <SnapPress
          key={f.key}
          style={st.row}
          onPress={() => { haptic.light(); router.push({ pathname: "/(tabs)/shared/person", params: { key: f.key } }); }}
        >
          <Avatar name={f.displayName} color={C[i % C.length]} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={st.rowName}>{f.displayName}</Text>
            {f.balance !== 0 && <Text style={st.rowSub}>{f.balance > 0 ? "owes you" : "you owe"}</Text>}
          </View>
          <Text style={[st.rowBal, f.balance > 0 && st.green, f.balance < 0 && st.amber, f.balance === 0 && st.muted]}>
            {f.balance === 0 ? "settled" : `$${Math.abs(f.balance).toFixed(2)}`}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 4 }} />
        </SnapPress>
      ))}
    </ScrollView>
  );
}

// ── Groups Page ──

function GroupsPage({ groups, w, onCreate, refreshControl }: { groups: GroupSummaryType[]; w: number; onCreate: () => void; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  return (
    <ScrollView style={{ width: w }} contentContainerStyle={st.page} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
      {!groups.length ? (
        <View style={st.empty}>
          <Ionicons name="people-outline" size={32} color="#D1D5DB" />
          <Text style={st.emptyTitle}>No groups yet</Text>
          <TouchableOpacity style={st.emptyBtn} onPress={onCreate}><Ionicons name="add" size={16} color="#fff" /><Text style={st.emptyBtnText}>Create</Text></TouchableOpacity>
        </View>
      ) : (
        <>
            {groups.map(g => (
              <SnapPress
                key={g.id}
                style={st.row}
                onPress={() => { haptic.light(); router.push({ pathname: "/(tabs)/shared/group", params: { id: g.id } }); }}
              >
                <View style={st.groupIcon}><Ionicons name="people" size={18} color="#3D8E62" /></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={st.rowName}>{g.name}</Text>
                  <Text style={st.rowSub}>{g.memberCount} members · {timeAgo(g.lastActivityAt)}</Text>
                </View>
                {g.myBalance !== 0 ? (
                  <Text style={[st.rowBal, g.myBalance > 0 ? st.green : st.amber]}>${Math.abs(g.myBalance).toFixed(2)}</Text>
                ) : (
                  <Text style={[st.rowBal, st.muted]}>settled</Text>
                )}
                <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 4 }} />
              </SnapPress>
            ))}
          <TouchableOpacity style={st.addRow} onPress={onCreate} activeOpacity={0.7}>
            <View style={st.addIcon}><Ionicons name="add" size={16} color="#9CA3AF" /></View>
            <Text style={st.addText}>New group</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// ── Activity Page ──

function ActivityPage({ items, w, refreshControl }: { items: RecentActivityItem[]; w: number; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  return (
    <ScrollView style={{ width: w }} contentContainerStyle={st.page} showsVerticalScrollIndicator={false} refreshControl={refreshControl}>
      {!items.length ? (
        <View style={st.empty}>
          <Ionicons name="time-outline" size={32} color="#D1D5DB" />
          <Text style={st.emptyTitle}>No activity</Text>
          <Text style={st.emptySub}>Expenses and settlements appear here.</Text>
        </View>
      ) : (
        <View style={st.actCard}>
          {items.map((it, i) => (
            <View key={it.id} style={[st.actRow, i < items.length - 1 && st.actBorder]}>
              <View style={[st.actDot, {
                backgroundColor: it.direction === "get_back" ? "#D1FAE5" : it.direction === "owe" ? "#FEE2E2" : "#F3F4F6"
              }]}>
                <Ionicons
                  name={it.direction === "settled" ? "checkmark" : it.direction === "get_back" ? "arrow-down" : "arrow-up"}
                  size={14}
                  color={it.direction === "get_back" ? "#059669" : it.direction === "owe" ? "#DC2626" : "#6B7280"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.actWho} numberOfLines={2}>
                  <Text style={{ fontWeight: "700" }}>{it.who}</Text> {it.action}{it.what ? ` "${it.what}"` : ""}
                </Text>
                {it.in ? <Text style={st.actIn}>{it.in}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {it.direction !== "settled" && (
                  <Text style={[st.actAmt, it.direction === "get_back" ? st.green : st.red]}>
                    {it.direction === "get_back" ? "+" : "-"}${it.amount.toFixed(2)}
                  </Text>
                )}
                <Text style={st.actTime}>{it.time}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ═══════════════════════════════════
// Main
// ═══════════════════════════════════

export default function SharedIndex() {
  const { width } = useWindowDimensions();
  const apiFetch = useApiFetch();
  const { isDemoOn, setIsDemoOn } = useDemoMode();
  const demo = useDemoData();

  const { summary: realSummary, loading, refetch } = useGroupsSummary();
  const { activity: realActivity, refetch: refetchActivity } = useRecentActivity(!isDemoOn);
  const isFocused = useIsFocused();

  const summary = isDemoOn ? demo.summary : realSummary;
  const activity = isDemoOn ? demo.activity : realActivity;

  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState(0);
  const prevFocused = useRef(false);

  const onRefresh = useCallback(async () => {
    if (isDemoOn) return;
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchActivity()]);
    } finally {
      setRefreshing(false);
    }
  }, [isDemoOn, refetch, refetchActivity]);

  useEffect(() => {
    if (isFocused && !prevFocused.current && !isDemoOn) {
      refetch();
      refetchActivity();
    }
    prevFocused.current = isFocused;
  }, [isFocused, isDemoOn, refetch, refetchActivity]);

  useEffect(() => {
    if (isDemoOn) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refetch();
        refetchActivity();
      }
    });
    return () => sub.remove();
  }, [isDemoOn, refetch, refetchActivity]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("expense-added", () => {
      refetch();
      refetchActivity();
    });
    return () => sub.remove();
  }, [refetch, refetchActivity]);

  const prevDemoOn = useRef(isDemoOn);
  useEffect(() => {
    if (prevDemoOn.current && !isDemoOn) {
      refetch();
      refetchActivity();
    }
    prevDemoOn.current = isDemoOn;
  }, [isDemoOn, refetch, refetchActivity]);

  const scrollX = useRef(new Animated.Value(0)).current;
  const pagerRef = useRef<FlatList>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const tabW = width - 40;

  const goTab = useCallback((i: number) => {
    haptic.selection();
    setTab(i);
    pagerRef.current?.scrollToIndex({ index: i, animated: true });
  }, []);

  const createGroup = async () => {
    if (!groupName.trim()) return;
    if (isDemoOn) { Alert.alert("Demo", `"${groupName}" created`); setShowCreate(false); setGroupName(""); return; }
    setCreating(true);
    try {
      const res = await apiFetch("/api/groups", { method: "POST", body: { name: groupName.trim(), ownerDisplayName: "You" } as object });
      const data = await res.json();
      if (res.ok) { refetch(); setShowCreate(false); setGroupName(""); router.push({ pathname: "/(tabs)/shared/group", params: { id: data.id } }); }
    } finally { setCreating(false); }
  };

  const refreshControl = !isDemoOn ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3D8E62" />
  ) : undefined;

  const renderPage = useCallback(({ item }: { item: number }) => {
    switch (item) {
      case 0: return <FriendsPage friends={summary?.friends ?? []} w={width} refreshControl={refreshControl} />;
      case 1: return <GroupsPage groups={summary?.groups ?? []} w={width} onCreate={() => setShowCreate(true)} refreshControl={refreshControl} />;
      case 2: return <ActivityPage items={activity} w={width} refreshControl={refreshControl} />;
      default: return null;
    }
  }, [summary, activity, width, refreshControl]);

  if (loading && !summary) {
    return <SharedSkeletonScreen />;
  }

  return (
    <SafeAreaView style={st.container} edges={["top"]}>
      <View style={st.pad}>
        {/* Header */}
        <View style={st.header}>
          <Text style={st.title}>Shared</Text>
          <View style={st.headerRight}>
            <View style={st.demoToggle}>
              <Text style={st.demoLabel}>Demo</Text>
              <Switch
                value={isDemoOn}
                onValueChange={setIsDemoOn}
                trackColor={{ false: "#E5E7EB", true: "#C3E0D3" }}
                thumbColor={isDemoOn ? "#3D8E62" : "#F9FAFB"}
              />
            </View>
            <TouchableOpacity style={st.addExpBtn} onPress={() => router.push("/(tabs)/add-expense")} activeOpacity={0.7}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={st.addExpText}>Expense</Text>
            </TouchableOpacity>
          </View>
        </View>

        {summary && <BalanceCard s={summary} />}

        {/* Create group inline */}
        {showCreate && (
          <View style={st.createCard}>
            <TextInput
              style={st.createInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              placeholderTextColor="#C4C4C4"
              autoFocus
              onSubmitEditing={createGroup}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={st.createBtn} onPress={createGroup} disabled={!groupName.trim() || creating} activeOpacity={0.7}>
                <Text style={st.createBtnText}>{creating ? "…" : "Create"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowCreate(false); setGroupName(""); }} activeOpacity={0.7}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TabBar active={tab} scrollX={scrollX} width={tabW} onPress={goTab} />
      </View>

      {/* Pager */}
      <FlatList
        ref={pagerRef}
        data={[0, 1, 2]}
        renderItem={renderPage}
        keyExtractor={String}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: (e: any) => { const p = Math.round(e.nativeEvent.contentOffset.x / width); if (p >= 0 && p < 3) setTab(p); } }
        )}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        style={{ flex: 1 }}
      />

      {/* FAB */}
      <SnapPress style={st.fab} onPress={() => { haptic.medium(); router.push("/(tabs)/add-expense"); }} scaleDown={0.9} haptic="none">
        <Ionicons name="add" size={26} color="#fff" />
      </SnapPress>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  pad: { paddingHorizontal: 20, paddingTop: 4 },
  page: { paddingHorizontal: 20, paddingBottom: 120, paddingTop: 8 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 28, fontFamily: font.black, color: colors.text, letterSpacing: -0.8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  demoToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  demoLabel: { fontSize: 12, fontFamily: font.semibold, color: colors.textTertiary },
  addExpBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii["2xl"] },
  addExpText: { color: "#fff", fontFamily: font.bold, fontSize: 13 },

  // Balance
  balCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 18, marginBottom: 14, ...shadow.md },
  balCardGreen: { backgroundColor: colors.greenSurface, borderColor: colors.greenBorder },
  balCardRed: { backgroundColor: colors.redSurface, borderColor: colors.redBorder },
  balTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  balLabel: { fontSize: 14, fontFamily: font.semibold, color: colors.textSecondary },
  balAmount: { fontSize: 26, fontFamily: font.black, letterSpacing: -1 },
  balBottom: { flexDirection: "row", alignItems: "center" },
  balSmLabel: { fontSize: 11, fontFamily: font.regular, color: colors.textMuted, marginBottom: 2 },
  balSmVal: { fontSize: 16, fontFamily: font.extrabold },
  balDivider: { width: 1, height: 28, backgroundColor: colors.border, marginHorizontal: 16 },

  // Tabs
  tabBar: { flexDirection: "row", backgroundColor: colors.border, borderRadius: radii.md, padding: 3, marginBottom: 4, position: "relative" as const },
  tabPill: { position: "absolute" as const, top: 3, left: 3, bottom: 3, backgroundColor: colors.surface, borderRadius: radii.sm, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  tabItem: { flex: 1, paddingVertical: 9, alignItems: "center" as const, zIndex: 1 },
  tabText: { fontSize: 14, fontFamily: font.bold, color: colors.textMuted },
  tabTextActive: { color: colors.text },

  // Rows
  row: { flexDirection: "row" as const, alignItems: "center" as const, backgroundColor: colors.surface, padding: 14, borderRadius: radii.lg, marginBottom: 6, ...shadow.sm },
  rowName: { fontSize: 16, fontFamily: font.semibold, color: colors.text },
  rowSub: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 1 },
  rowBal: { fontSize: 16, fontFamily: font.extrabold },
  groupIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.primaryLight, alignItems: "center" as const, justifyContent: "center" as const },
  addRow: { flexDirection: "row" as const, alignItems: "center" as const, padding: 14, gap: 12 },
  addIcon: { width: 40, height: 40, borderRadius: radii["2xl"], borderWidth: 2, borderColor: colors.border, borderStyle: "dashed" as const, alignItems: "center" as const, justifyContent: "center" as const },
  addText: { fontSize: 14, fontFamily: font.semibold, color: colors.textMuted },

  // Activity
  actCard: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: "hidden" as const, ...shadow.md },
  actRow: { flexDirection: "row" as const, alignItems: "center" as const, padding: 14, gap: 10 },
  actBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  actDot: { width: 32, height: 32, borderRadius: radii.xl, alignItems: "center" as const, justifyContent: "center" as const },
  actWho: { fontSize: 14, fontFamily: font.regular, color: colors.textSecondary, lineHeight: 18 },
  actIn: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 2 },
  actAmt: { fontSize: 14, fontFamily: font.extrabold },
  actTime: { fontSize: 11, fontFamily: font.regular, color: colors.textFaint, marginTop: 2 },

  // Empty
  empty: { alignItems: "center" as const, paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontFamily: font.bold, color: colors.textMuted, marginTop: 12 },
  emptySub: { fontSize: 13, fontFamily: font.regular, color: colors.textFaint, marginTop: 4 },
  emptyBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii["2xl"], marginTop: 16 },
  emptyBtnText: { color: "#fff", fontFamily: font.bold, fontSize: 14 },

  // Create
  createCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, marginBottom: 12, ...shadow.md },
  createInput: { fontSize: 16, fontFamily: font.regular, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, paddingBottom: 12, marginBottom: 12 },
  createBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radii["2xl"] },
  createBtnText: { color: "#fff", fontFamily: font.bold, fontSize: 14 },
  cancelText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 14, paddingVertical: 10 },

  // Colors
  green: { color: colors.green },
  red: { color: colors.red },
  amber: { color: colors.amber },
  muted: { color: colors.textFaint },

  // FAB
  fab: { position: "absolute" as const, bottom: 28, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: "center" as const, justifyContent: "center" as const, ...shadow.colored(colors.primary) },
});
