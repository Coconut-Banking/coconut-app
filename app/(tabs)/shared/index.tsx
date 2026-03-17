import { useState, useRef, useCallback } from "react";
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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApiFetch } from "../../../lib/api";
import { useGroupsSummary, useRecentActivity } from "../../../hooks/useGroups";
import type { GroupsSummary, FriendBalance, GroupSummary as GroupSummaryType, RecentActivityItem } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { useDemoData } from "../../../lib/demo-context";
import { SnapPress, SharedSkeletonScreen, haptic } from "../../../components/ui";
import { useTheme } from "../../../lib/theme-context";

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

// -- Balance Card --

function BalanceCard({ s: summary }: { s: GroupsSummary }) {
  const { theme } = useTheme();
  const net = summary.netBalance ?? 0;
  return (
    <View style={[st.balCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }, net > 0 && { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }, net < 0 && { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
      <View style={st.balTop}>
        <Text style={[st.balLabel, { color: theme.textSecondary }]}>{net > 0 ? "You are owed" : net < 0 ? "You owe" : "All settled up"}</Text>
        {net !== 0 && <Text style={[st.balAmount, net > 0 ? { color: theme.positive } : { color: theme.negative }]}>${Math.abs(net).toFixed(2)}</Text>}
      </View>
      <View style={st.balBottom}>
        <View style={{ flex: 1 }}>
          <Text style={[st.balSmLabel, { color: theme.textQuaternary }]}>Owed to you</Text>
          <Text style={[st.balSmVal, { color: theme.positive }]}>${(summary.totalOwedToMe ?? 0).toFixed(2)}</Text>
        </View>
        <View style={[st.balDivider, { backgroundColor: theme.border }]} />
        <View style={{ flex: 1 }}>
          <Text style={[st.balSmLabel, { color: theme.textQuaternary }]}>You owe</Text>
          <Text style={[st.balSmVal, { color: theme.negative }]}>${(summary.totalIOwe ?? 0).toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
}

// -- Tab Indicator --

function TabBar({ active, scrollX, width, onPress }: { active: number; scrollX: Animated.Value; width: number; onPress: (i: number) => void }) {
  const { theme } = useTheme();
  const w = width / 3;
  const tx = scrollX.interpolate({ inputRange: [0, width, width * 2], outputRange: [0, w, w * 2], extrapolate: "clamp" });
  return (
    <View style={[st.tabBar, { backgroundColor: theme.surfaceTertiary }]}>
      <Animated.View style={[st.tabPill, { backgroundColor: theme.surface, width: w, transform: [{ translateX: tx }] }]} />
      {TABS.map((t, i) => (
        <TouchableOpacity key={t} style={st.tabItem} onPress={() => onPress(i)} activeOpacity={0.7}>
          <Text style={[st.tabText, { color: theme.textQuaternary }, i === active && { color: theme.text }]}>{t}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// -- Friends Page --

function FriendsPage({ friends, w }: { friends: FriendBalance[]; w: number }) {
  const { theme } = useTheme();
  return (
    <ScrollView style={{ width: w }} contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
      {!friends.length ? (
        <View style={st.empty}>
          <Ionicons name="person-add-outline" size={32} color={theme.textQuaternary} />
          <Text style={[st.emptyTitle, { color: theme.textQuaternary }]}>No friends yet</Text>
          <Text style={[st.emptySub, { color: theme.textQuaternary }]}>Add members to a group to start.</Text>
        </View>
      ) : friends.map((f, i) => (
        <SnapPress
          key={f.key}
          style={[st.row, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
          onPress={() => { haptic.light(); router.push({ pathname: "/(tabs)/shared/person", params: { key: f.key } }); }}
        >
          <Avatar name={f.displayName} color={C[i % C.length]} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[st.rowName, { color: theme.text }]}>{f.displayName}</Text>
            {f.balance !== 0 && <Text style={[st.rowSub, { color: theme.textQuaternary }]}>{f.balance > 0 ? "owes you" : "you owe"}</Text>}
          </View>
          <Text style={[st.rowBal, f.balance > 0 && { color: theme.positive }, f.balance < 0 && { color: "#B45309" }, f.balance === 0 && { color: theme.textQuaternary }]}>
            {f.balance === 0 ? "settled" : `$${Math.abs(f.balance).toFixed(2)}`}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.textQuaternary} style={{ marginLeft: 4 }} />
        </SnapPress>
      ))}
    </ScrollView>
  );
}

// -- Groups Page --

function GroupsPage({ groups, w, onCreate }: { groups: GroupSummaryType[]; w: number; onCreate: () => void }) {
  const { theme } = useTheme();
  return (
    <ScrollView style={{ width: w }} contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
      {!groups.length ? (
        <View style={st.empty}>
          <Ionicons name="people-outline" size={32} color={theme.textQuaternary} />
          <Text style={[st.emptyTitle, { color: theme.textQuaternary }]}>No groups yet</Text>
          <TouchableOpacity style={[st.emptyBtn, { backgroundColor: theme.primary }]} onPress={onCreate}><Ionicons name="add" size={16} color="#fff" /><Text style={st.emptyBtnText}>Create</Text></TouchableOpacity>
        </View>
      ) : (
        <>
            {groups.map(g => (
              <SnapPress
                key={g.id}
                style={[st.row, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
                onPress={() => { haptic.light(); router.push({ pathname: "/(tabs)/shared/group", params: { id: g.id } }); }}
              >
                <View style={[st.groupIcon, { backgroundColor: theme.primaryLight }]}><Ionicons name="people" size={18} color={theme.primary} /></View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[st.rowName, { color: theme.text }]}>{g.name}</Text>
                  <Text style={[st.rowSub, { color: theme.textQuaternary }]}>{g.memberCount} members · {timeAgo(g.lastActivityAt)}</Text>
                </View>
                {g.myBalance !== 0 ? (
                  <Text style={[st.rowBal, g.myBalance > 0 ? { color: theme.positive } : { color: "#B45309" }]}>${Math.abs(g.myBalance).toFixed(2)}</Text>
                ) : (
                  <Text style={[st.rowBal, { color: theme.textQuaternary }]}>settled</Text>
                )}
                <Ionicons name="chevron-forward" size={16} color={theme.textQuaternary} style={{ marginLeft: 4 }} />
              </SnapPress>
            ))}
          <TouchableOpacity style={st.addRow} onPress={onCreate} activeOpacity={0.7}>
            <View style={[st.addIcon, { borderColor: theme.border }]}><Ionicons name="add" size={16} color={theme.textQuaternary} /></View>
            <Text style={[st.addText, { color: theme.textQuaternary }]}>New group</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

// -- Activity Page --

function ActivityPage({ items, w }: { items: RecentActivityItem[]; w: number }) {
  const { theme } = useTheme();
  return (
    <ScrollView style={{ width: w }} contentContainerStyle={st.page} showsVerticalScrollIndicator={false}>
      {!items.length ? (
        <View style={st.empty}>
          <Ionicons name="time-outline" size={32} color={theme.textQuaternary} />
          <Text style={[st.emptyTitle, { color: theme.textQuaternary }]}>No activity</Text>
          <Text style={[st.emptySub, { color: theme.textQuaternary }]}>Expenses and settlements appear here.</Text>
        </View>
      ) : (
        <View style={[st.actCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          {items.map((it, i) => (
            <View key={it.id} style={[st.actRow, i < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}>
              <View style={[st.actDot, {
                backgroundColor: it.direction === "get_back" ? theme.successLight : it.direction === "owe" ? theme.errorLight : theme.surfaceTertiary
              }]}>
                <Ionicons
                  name={it.direction === "settled" ? "checkmark" : it.direction === "get_back" ? "arrow-down" : "arrow-up"}
                  size={14}
                  color={it.direction === "get_back" ? theme.positive : it.direction === "owe" ? theme.negative : theme.textTertiary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.actWho, { color: theme.textSecondary }]} numberOfLines={2}>
                  <Text style={{ fontWeight: "700" }}>{it.who}</Text> {it.action}{it.what ? ` "${it.what}"` : ""}
                </Text>
                {it.in ? <Text style={[st.actIn, { color: theme.textQuaternary }]}>{it.in}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {it.direction !== "settled" && (
                  <Text style={[st.actAmt, it.direction === "get_back" ? { color: theme.positive } : { color: theme.negative }]}>
                    {it.direction === "get_back" ? "+" : "-"}${it.amount.toFixed(2)}
                  </Text>
                )}
                <Text style={[st.actTime, { color: theme.textQuaternary }]}>{it.time}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ===================================
// Main
// ===================================

export default function SharedIndex() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const apiFetch = useApiFetch();
  const { isDemoOn, setIsDemoOn } = useDemoMode();
  const demo = useDemoData();

  const { summary: realSummary, loading, refetch } = useGroupsSummary();
  const { activity: realActivity } = useRecentActivity(!isDemoOn);

  const summary = isDemoOn ? demo.summary : realSummary;
  const activity = isDemoOn ? demo.activity : realActivity;

  const [tab, setTab] = useState(0);
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

  const renderPage = useCallback(({ item }: { item: number }) => {
    switch (item) {
      case 0: return <FriendsPage friends={summary?.friends ?? []} w={width} />;
      case 1: return <GroupsPage groups={summary?.groups ?? []} w={width} onCreate={() => setShowCreate(true)} />;
      case 2: return <ActivityPage items={activity} w={width} />;
      default: return null;
    }
  }, [summary, activity, width]);

  if (loading && !summary) {
    return <SharedSkeletonScreen />;
  }

  return (
    <SafeAreaView style={[st.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <View style={st.pad}>
        {/* Header */}
        <View style={st.header}>
          <Text style={[st.title, { color: theme.text }]}>Shared</Text>
          <View style={st.headerRight}>
            <View style={st.demoToggle}>
              <Text style={[st.demoLabel, { color: theme.textTertiary }]}>Demo</Text>
              <Switch
                value={isDemoOn}
                onValueChange={setIsDemoOn}
                trackColor={{ false: theme.border, true: theme.primaryLight }}
                thumbColor={isDemoOn ? theme.primary : theme.surfaceSecondary}
              />
            </View>
            <TouchableOpacity style={[st.addExpBtn, { backgroundColor: theme.primary }]} onPress={() => router.push("/(tabs)/add-expense")} activeOpacity={0.7}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={st.addExpText}>Expense</Text>
            </TouchableOpacity>
          </View>
        </View>

        {summary && <BalanceCard s={summary} />}

        {/* Create group inline */}
        {showCreate && (
          <View style={[st.createCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <TextInput
              style={[st.createInput, { color: theme.text, borderBottomColor: theme.borderLight }]}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              placeholderTextColor={theme.inputPlaceholder}
              autoFocus
              onSubmitEditing={createGroup}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={[st.createBtn, { backgroundColor: theme.primary }]} onPress={createGroup} disabled={!groupName.trim() || creating} activeOpacity={0.7}>
                <Text style={st.createBtnText}>{creating ? "…" : "Create"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowCreate(false); setGroupName(""); }} activeOpacity={0.7}>
                <Text style={[st.cancelText, { color: theme.textQuaternary }]}>Cancel</Text>
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
      <SnapPress style={[st.fab, { backgroundColor: theme.primary, shadowColor: theme.primary }]} onPress={() => { haptic.medium(); router.push("/(tabs)/add-expense"); }} scaleDown={0.9} haptic="none">
        <Ionicons name="add" size={26} color="#fff" />
      </SnapPress>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  pad: { paddingHorizontal: 20, paddingTop: 4 },
  page: { paddingHorizontal: 20, paddingBottom: 120, paddingTop: 8 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  demoToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  demoLabel: { fontSize: 12, fontWeight: "600" },
  addExpBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addExpText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  // Balance
  balCard: { borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1 },
  balTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  balLabel: { fontSize: 14, fontWeight: "600" },
  balAmount: { fontSize: 26, fontWeight: "900", letterSpacing: -1 },
  balBottom: { flexDirection: "row", alignItems: "center" },
  balSmLabel: { fontSize: 11, marginBottom: 2 },
  balSmVal: { fontSize: 16, fontWeight: "800" },
  balDivider: { width: 1, height: 28, marginHorizontal: 16 },

  // Tabs
  tabBar: { flexDirection: "row", borderRadius: 12, padding: 3, marginBottom: 4, position: "relative" },
  tabPill: { position: "absolute", top: 3, left: 3, bottom: 3, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  tabItem: { flex: 1, paddingVertical: 9, alignItems: "center", zIndex: 1 },
  tabText: { fontSize: 14, fontWeight: "700" },

  // Rows
  row: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, marginBottom: 6, borderWidth: 1 },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 12, marginTop: 1 },
  rowBal: { fontSize: 16, fontWeight: "800" },
  groupIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  addRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  addIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  addText: { fontSize: 14, fontWeight: "600" },

  // Activity
  actCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  actRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  actDot: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  actWho: { fontSize: 14, lineHeight: 18 },
  actIn: { fontSize: 12, marginTop: 2 },
  actAmt: { fontSize: 14, fontWeight: "800" },
  actTime: { fontSize: 11, marginTop: 2 },

  // Empty
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginTop: 12 },
  emptySub: { fontSize: 13, marginTop: 4 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginTop: 16 },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Create
  createCard: { borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1 },
  createInput: { fontSize: 16, borderBottomWidth: 1, paddingBottom: 12, marginBottom: 12 },
  createBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  cancelText: { fontWeight: "600", fontSize: 14, paddingVertical: 10 },

  // FAB
  fab: { position: "absolute", bottom: 28, right: 20, width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
});
