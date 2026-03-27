import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  AppState,
  DeviceEventEmitter,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useAuth } from "@clerk/expo";
import { useApiFetch } from "../../../lib/api";
import { useGroupsSummary } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { SharedSkeletonScreen } from "../../../components/ui";
import { useDemoData } from "../../../lib/demo-context";
import { colors, font, radii, prototype } from "../../../lib/theme";
import { friendBalanceLines, formatSplitCurrencyAmount, groupBalanceLines } from "../../../lib/format-split-money";

const AVATAR_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"] as const;

function SLabel({ children }: { children: ReactNode }) {
  return <Text style={st.sLabel}>{children}</Text>;
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
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
      <Text style={{ color: hue, fontFamily: font.bold, fontSize: size * 0.32 }}>
        {name.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SharedIndex() {
  const { userId } = useAuth();
  const apiFetch = useApiFetch();
  const isFocused = useIsFocused();
  const { isDemoOn, setIsDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { summary: realSummary, loading, refetch } = useGroupsSummary();
  const summary = isDemoOn ? demo.summary : realSummary;

  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [fallbackGroups, setFallbackGroups] = useState<Array<{ id: string; name: string; memberCount: number; groupType?: string | null }>>([]);
  const [optimisticGroups, setOptimisticGroups] = useState<Array<{ id: string; name: string; memberCount: number; groupType?: string | null }>>([]);
  const [optimisticFriends, setOptimisticFriends] = useState<
    Array<{ key: string; displayName: string; balance: number; balances?: { currency: string; amount: number }[] }>
  >([]);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedGroups, setArchivedGroups] = useState<Array<{ id: string; name: string; memberCount: number }>>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const prevFocused = useRef(false);
  const prevDemoOn = useRef(isDemoOn);
  const optimisticStoreKey = `coconut.optimistic.friends.${userId ?? "anon"}`;

  const persistOptimistic = useCallback(
    async (
      groups: Array<{ id: string; name: string; memberCount: number; groupType?: string | null }>,
      friends: Array<{ key: string; displayName: string; balance: number }>
    ) => {
      try {
        await AsyncStorage.setItem(
          optimisticStoreKey,
          JSON.stringify({ groups, friends })
        );
      } catch {
        // best effort cache
      }
    },
    [optimisticStoreKey]
  );

  const onRefresh = useCallback(async () => {
    if (isDemoOn) return;
    setRefreshing(true);
    try {
      await refetch(true);
      const res = await apiFetch("/api/groups");
      if (res.ok) {
        const data = await res.json().catch(() => []);
        if (Array.isArray(data)) {
          setFallbackGroups(
            data.map((g) => ({
              id: String(g.id),
              name: String(g.name ?? "Group"),
              memberCount: Number(g.memberCount ?? 0),
              groupType: typeof g.groupType === "string" ? g.groupType : null,
            }))
          );
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, [isDemoOn, refetch, apiFetch]);

  useEffect(() => {
    // Friends tab should always use real data.
    if (isDemoOn) setIsDemoOn(false);
  }, [isDemoOn, setIsDemoOn]);

  useEffect(() => {
    if (isFocused && !prevFocused.current && !isDemoOn) refetch(true);
    prevFocused.current = isFocused;
  }, [isFocused, isDemoOn, refetch]);

  useEffect(() => {
    if (isDemoOn) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refetch(true);
    });
    return () => sub.remove();
  }, [isDemoOn, refetch]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("expense-added", () => {
      if (!isDemoOn) refetch(true);
    });
    return () => sub.remove();
  }, [isDemoOn, refetch]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("groups-updated", () => {
      if (!isDemoOn) refetch(true);
    });
    return () => sub.remove();
  }, [isDemoOn, refetch]);

  useEffect(() => {
    if (prevDemoOn.current && !isDemoOn) refetch(true);
    prevDemoOn.current = isDemoOn;
  }, [isDemoOn, refetch]);

  useEffect(() => {
    if (!isDemoOn) void onRefresh();
  }, [isDemoOn, onRefresh]);

  useEffect(() => {
    if (!showArchived || isDemoOn) return;
    let cancelled = false;
    (async () => {
      setArchivedLoading(true);
      try {
        const res = await apiFetch("/api/groups?archived=1");
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => []);
        if (!Array.isArray(data) || cancelled) return;
        setArchivedGroups(
          data.map((g: { id: unknown; name?: string; memberCount?: number }) => ({
            id: String(g.id),
            name: String(g.name ?? "Group"),
            memberCount: Number(g.memberCount ?? 0),
          }))
        );
      } finally {
        if (!cancelled) setArchivedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showArchived, isDemoOn, apiFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(optimisticStoreKey);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as {
          groups?: Array<{ id: string; name: string; memberCount: number; groupType?: string | null }>;
          friends?: Array<{
            key: string;
            displayName: string;
            balance: number;
            balances?: { currency: string; amount: number }[];
          }>;
        };
        if (Array.isArray(parsed.groups)) setOptimisticGroups(parsed.groups);
        if (Array.isArray(parsed.friends)) {
          setOptimisticFriends(
            parsed.friends.map((f) => ({
              ...f,
              balances: f.balances ?? [],
            }))
          );
        }
      } catch {
        // ignore cache parse errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optimisticStoreKey]);

  const createGroup = async () => {
    const name = groupName.trim();
    if (!name) return;
    if (isDemoOn) {
      Alert.alert("Demo", `"${name}" created`);
      setGroupName("");
      setShowCreate(false);
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch("/api/groups", {
        method: "POST",
        body: { name, ownerDisplayName: "You" } as object,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        Alert.alert("Error", data?.error ?? "Could not create group");
        return;
      }
      setShowCreate(false);
      setGroupName("");
      await refetch(true);
      await onRefresh();
      const nextGroups = [{ id: data.id, name, memberCount: 1, groupType: "other" }, ...optimisticGroups.filter((g) => g.id !== data.id)];
      setOptimisticGroups(nextGroups);
      await persistOptimistic(nextGroups, optimisticFriends);
      router.push({ pathname: "/(tabs)/shared/group", params: { id: data.id } });
    } finally {
      setCreating(false);
    }
  };

  const addFriend = async () => {
    const name = friendName.trim();
    const email = friendEmail.trim() || null;
    if (!name) return;

    if (isDemoOn) {
      Alert.alert("Demo", `Added ${name}`);
      setFriendName("");
      setFriendEmail("");
      setShowAddFriend(false);
      return;
    }

    setAddingFriend(true);
    try {
      const groupRes = await apiFetch("/api/groups", {
        method: "POST",
        body: { name, ownerDisplayName: "You" } as object,
      });
      const group = await groupRes.json().catch(() => null);
      if (!groupRes.ok || !group?.id) {
        Alert.alert("Error", group?.error ?? "Failed to add friend");
        return;
      }

      const memberRes = await apiFetch(`/api/groups/${group.id}/members`, {
        method: "POST",
        body: { displayName: name, ...(email ? { email } : {}) } as object,
      });
      const memberData = await memberRes.json().catch(() => null);
      if (!memberRes.ok) {
        void apiFetch(`/api/groups/${group.id}`, { method: "DELETE" });
        Alert.alert("Error", memberData?.error ?? "Failed to add friend");
        return;
      }

      setShowAddFriend(false);
      setFriendName("");
      setFriendEmail("");
      await refetch(true);
      await onRefresh();
      const nextGroups = [{ id: group.id, name, memberCount: 2, groupType: "other" }, ...optimisticGroups.filter((g) => g.id !== group.id)];
      const nextFriends = [
        { key: `opt-${group.id}`, displayName: name, balance: 0, balances: [] as { currency: string; amount: number }[] },
        ...optimisticFriends.filter((f) => f.displayName !== name),
      ];
      setOptimisticGroups(nextGroups);
      setOptimisticFriends(nextFriends);
      await persistOptimistic(nextGroups, nextFriends);
      router.push({ pathname: "/(tabs)/shared/group", params: { id: group.id } });
    } catch {
      Alert.alert("Error", "Network error. Try again.");
    } finally {
      setAddingFriend(false);
    }
  };

  if (loading && !summary) return <SharedSkeletonScreen />;

  const summaryFriends = summary?.friends ?? [];
  const summaryGroups = summary?.groups ?? [];
  const mergedFallbackGroups = [...optimisticGroups, ...fallbackGroups.filter((g) => !optimisticGroups.some((o) => o.id === g.id))];
  const fallbackFriendRows = fallbackGroups
    .filter((g) => (g.groupType ?? "other") !== "home")
    .map((g) => ({
      key: `fb-${g.id}`,
      displayName: g.name,
      balance: 0,
      balances: [] as { currency: string; amount: number }[],
    }));
  const mergedFallbackFriends = [
    ...optimisticFriends,
    ...fallbackFriendRows.filter((f) => !optimisticFriends.some((o) => o.displayName === f.displayName)),
  ];
  // When the API returns successfully, trust it — including empty lists (all settled). Do not fall back
  // to “everyone from /api/groups” or we’d show people with $0 net like Splitwise hides.
  const friends =
    !isDemoOn && realSummary != null
      ? [
          ...optimisticFriends.filter((o) => !summaryFriends.some((s) => s.displayName === o.displayName)),
          ...summaryFriends,
        ]
      : isDemoOn
        ? summaryFriends
        : mergedFallbackFriends;
  const groupsFromApi =
    !isDemoOn && realSummary != null
      ? summaryGroups
      : mergedFallbackGroups.map((g) => ({
          id: g.id,
          name: g.name,
          memberCount: g.memberCount,
          myBalance: 0,
          myBalances: [] as { currency: string; amount: number }[],
          lastActivityAt: new Date().toISOString(),
        }));
  const optimisticAsGroups = optimisticGroups
    .filter((o) => !groupsFromApi.some((s) => s.id === o.id))
    .map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      myBalance: 0,
      myBalances: [] as { currency: string; amount: number }[],
      lastActivityAt: new Date().toISOString(),
    }));
  const groups = !isDemoOn && realSummary != null ? [...optimisticAsGroups, ...groupsFromApi] : isDemoOn ? summaryGroups : groupsFromApi;
  const friendNameSet = new Set(friends.map((f) => f.displayName.trim().toLowerCase()));
  const visibleGroups = groups.filter((g) => {
    const groupName = g.name.trim().toLowerCase();
    // "Add friend" currently creates a 2-member group under the hood.
    // Keep the data model, but don't show duplicate rows in Groups UI.
    if (g.memberCount <= 2 && friendNameSet.has(groupName)) return false;
    return true;
  });

  return (
    <SafeAreaView style={st.container} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.page}
        showsVerticalScrollIndicator={false}
        refreshControl={!isDemoOn ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      >
        <View style={st.header}>
          <View>
            <Text style={st.title}>People & groups</Text>
            <Text style={st.titleSub}>Manage everyone you split with</Text>
          </View>
        </View>

        <View style={st.actionsRow}>
          <TouchableOpacity
            style={st.actionBtn}
            onPress={() => {
              setShowAddFriend((v) => !v);
              setShowCreate(false);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={st.actionBtnText}>Add friend</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={st.actionBtnAlt}
            onPress={() => {
              setShowCreate((v) => !v);
              setShowAddFriend(false);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="people" size={16} color={colors.primary} />
            <Text style={st.actionBtnAltText}>New group</Text>
          </TouchableOpacity>
        </View>

        {showAddFriend ? (
          <View style={st.formCard}>
            <TextInput
              style={st.formInput}
              value={friendName}
              onChangeText={setFriendName}
              placeholder="Friend name"
              placeholderTextColor="#8A9098"
              autoFocus
            />
            <TextInput
              style={[st.formInput, { marginTop: 8 }]}
              value={friendEmail}
              onChangeText={setFriendEmail}
              placeholder="Email (optional)"
              placeholderTextColor="#8A9098"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={st.formActions}>
              <TouchableOpacity style={st.formPrimaryBtn} onPress={addFriend} disabled={!friendName.trim() || addingFriend}>
                <Text style={st.formPrimaryBtnText}>{addingFriend ? "Adding…" : "Add"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAddFriend(false); setFriendName(""); setFriendEmail(""); }}>
                <Text style={st.formCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {showCreate ? (
          <View style={st.formCard}>
            <TextInput
              style={st.formInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              placeholderTextColor="#8A9098"
              autoFocus
            />
            <View style={st.formActions}>
              <TouchableOpacity style={st.formPrimaryBtn} onPress={createGroup} disabled={!groupName.trim() || creating}>
                <Text style={st.formPrimaryBtnText}>{creating ? "Creating…" : "Create"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowCreate(false); setGroupName(""); }}>
                <Text style={st.formCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <SLabel>Friends</SLabel>
        {!friends.length ? (
          <View style={[st.groupedCard, st.emptyInner]}>
            <Ionicons name="person-add-outline" size={30} color="#8A9098" />
            <Text style={st.emptyTitle}>No friends yet</Text>
            <Text style={st.emptySub}>Add a friend to start splitting expenses.</Text>
          </View>
        ) : (
          <View style={st.groupedCard}>
            {friends.map((f, i) => (
              <View key={f.key}>
                <TouchableOpacity
                  style={st.groupedRow}
                  onPress={() => {
                    // Synthetic fallback/optimistic friend keys map to group IDs.
                    if (f.key.startsWith("opt-")) {
                      router.push({ pathname: "/(tabs)/shared/group", params: { id: f.key.slice(4) } });
                      return;
                    }
                    if (f.key.startsWith("fb-")) {
                      router.push({ pathname: "/(tabs)/shared/group", params: { id: f.key.slice(3) } });
                      return;
                    }
                    router.push({ pathname: "/(tabs)/shared/person", params: { key: f.key } });
                  }}
                  activeOpacity={0.75}
                >
                  <Avatar name={f.displayName} size={42} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={st.rowName}>{f.displayName}</Text>
                    <Text style={st.rowSub}>
                      {(() => {
                        const lines = friendBalanceLines(f);
                        if (lines.length === 0) return "settled up";
                        const pos =
                          lines.some((l) => l.amount > 0.005) && lines.every((l) => l.amount >= -0.005);
                        const neg =
                          lines.some((l) => l.amount < -0.005) && lines.every((l) => l.amount <= 0.005);
                        if (!pos && !neg) return "balances";
                        return pos ? "owes you" : "you owe";
                      })()}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {friendBalanceLines(f).length === 0 ? (
                      <Text style={[st.rowBal, st.muted]}>—</Text>
                    ) : (
                      friendBalanceLines(f).map((b) => {
                        const p = b.amount > 0.005;
                        const n = b.amount < -0.005;
                        return (
                          <Text key={b.currency} style={[st.rowBal, p ? st.balIn : n ? st.balOut : st.muted]}>
                            {p ? "+" : n ? "−" : ""}
                            {formatSplitCurrencyAmount(b.amount, b.currency)}
                          </Text>
                        );
                      })
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#8A9098" style={{ marginLeft: 6, opacity: 0.5 }} />
                </TouchableOpacity>
                {i < friends.length - 1 ? <View style={st.rowSep} /> : null}
              </View>
            ))}
          </View>
        )}

        <SLabel>Groups</SLabel>
        {!visibleGroups.length ? (
          <View style={[st.groupedCard, st.emptyInner]}>
            <Ionicons name="people-outline" size={30} color="#8A9098" />
            <Text style={st.emptyTitle}>No groups yet</Text>
            <Text style={st.emptySub}>Create a group for trips, roommates, or dinners.</Text>
          </View>
        ) : (
          <View style={st.groupedCard}>
            {visibleGroups.map((g, i) => (
              <View key={g.id}>
                <TouchableOpacity
                  style={st.groupedRow}
                  onPress={() => router.push({ pathname: "/(tabs)/shared/group", params: { id: g.id } })}
                  activeOpacity={0.75}
                >
                  <View style={st.groupIcon}>
                  <Ionicons name="people" size={18} color="#1F2328" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={st.rowName}>{g.name}</Text>
                    <Text style={st.rowSub}>{g.memberCount} members · {timeAgo(g.lastActivityAt)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    {groupBalanceLines(g).length === 0 ? (
                      <Text style={[st.rowBal, st.muted]}>—</Text>
                    ) : (
                      groupBalanceLines(g).map((b) => (
                        <Text key={b.currency} style={[st.rowBal, b.amount > 0 ? st.balIn : st.balOut]}>
                          {b.amount > 0 ? "+" : "−"}
                          {formatSplitCurrencyAmount(b.amount, b.currency)}
                        </Text>
                      ))
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#8A9098" style={{ marginLeft: 6, opacity: 0.5 }} />
                </TouchableOpacity>
                {i < visibleGroups.length - 1 ? <View style={st.rowSep} /> : null}
              </View>
            ))}
          </View>
        )}

        {!isDemoOn ? (
          <View style={{ marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setShowArchived((v) => !v)}
              style={{ paddingVertical: 14 }}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 14, fontFamily: font.semibold, color: colors.primary }}>
                {showArchived ? "Hide archived groups" : "Show archived groups"}
              </Text>
            </TouchableOpacity>
            {showArchived ? (
              archivedLoading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
              ) : archivedGroups.length === 0 ? (
                <Text style={[st.emptySub, { marginBottom: 16 }]}>No archived groups.</Text>
              ) : (
                <View style={st.groupedCard}>
                  {archivedGroups.map((g, i) => (
                    <View key={g.id}>
                      <TouchableOpacity
                        style={st.groupedRow}
                        onPress={() =>
                          router.push({ pathname: "/(tabs)/shared/group", params: { id: g.id } })
                        }
                        activeOpacity={0.75}
                      >
                        <View style={st.groupIcon}>
                          <Ionicons name="archive-outline" size={18} color="#1F2328" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={st.rowName}>{g.name}</Text>
                          <Text style={st.rowSub}>{g.memberCount} members · archived</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color="#8A9098" style={{ marginLeft: 6, opacity: 0.5 }} />
                      </TouchableOpacity>
                      {i < archivedGroups.length - 1 ? <View style={st.rowSep} /> : null}
                    </View>
                  ))}
                </View>
              )
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3F2" },
  page: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 32, fontFamily: font.black, color: "#1F2328", letterSpacing: -0.9 },
  titleSub: { fontSize: 13, fontFamily: font.medium, color: "#7A8088", marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1F2328",
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionBtnText: { color: "#fff", fontFamily: font.bold, fontSize: 13 },
  actionBtnAlt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3EEEA",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionBtnAltText: { color: "#1F2328", fontFamily: font.bold, fontSize: 13 },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    padding: 14,
    marginBottom: 12,
  },
  formInput: {
    borderWidth: 1,
    borderColor: "#E3DBD8",
    backgroundColor: "#F7F3F0",
    borderRadius: 10,
    color: "#1F2328",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: font.regular,
    fontSize: 15,
  },
  formActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  formPrimaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  formPrimaryBtnText: { color: "#fff", fontFamily: font.bold, fontSize: 14 },
  formCancelText: { color: "#4B5563", fontFamily: font.semibold, fontSize: 14 },

  sLabel: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: "#9AA0A6",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
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
  rowName: { fontSize: 16, fontFamily: font.semibold, color: "#1F2328" },
  rowSub: { fontSize: 12, fontFamily: font.regular, color: "#7A8088", marginTop: 1 },
  rowBal: { fontSize: 16, fontFamily: font.extrabold, letterSpacing: -0.3 },
  balIn: { color: prototype.green },
  balOut: { color: prototype.red },
  muted: { color: "#8A9098" },
  rowSep: { height: 1, backgroundColor: "#EEE8E4", marginLeft: 70 },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyInner: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontFamily: font.bold, color: "#1F2328", marginTop: 10 },
  emptySub: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 4, textAlign: "center" },
});

