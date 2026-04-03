import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from "react";
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
  Animated,
  useWindowDimensions,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useAuth } from "@clerk/expo";
import { useApiFetch, invalidateApiCache } from "../../../lib/api";
import { useGroupsSummary } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { SharedSkeletonScreen } from "../../../components/ui";
import { useDemoData } from "../../../lib/demo-context";
import { colors, font, radii, prototype } from "../../../lib/theme";
import { useTheme } from "../../../lib/theme-context";
import { friendBalanceLines, formatSplitCurrencyAmount, groupBalanceLines } from "../../../lib/format-split-money";
import * as Clipboard from "expo-clipboard";
import { useToast } from "../../../components/Toast";
import { useDeviceContacts, type DeviceContact } from "../../../hooks/useDeviceContacts";

const AVATAR_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"] as const;

function SLabel({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <Text style={[st.sLabel, { color: theme.textTertiary }]}>{children}</Text>;
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
  const { theme } = useTheme();
  const { userId } = useAuth();
  const apiFetch = useApiFetch();
  const toast = useToast();
  const isFocused = useIsFocused();
  const { isDemoOn, setIsDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { summary: realSummary, loading, refetch } = useGroupsSummary();
  const summary = isDemoOn ? demo.summary : realSummary;

  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupType, setGroupType] = useState("trip");
  const [groupImage, setGroupImage] = useState<string | null>(null);
  const [groupImageBase64, setGroupImageBase64] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const { contacts: deviceContacts, permissionStatus: contactsPerm, requestAccess: requestContactsAccess } = useDeviceContacts();
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

  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<"recent" | "groups" | "friends">("recent");
  const pagerRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [tabsWidth, setTabsWidth] = useState(0);

  const handleTabPress = useCallback((tab: "recent" | "groups" | "friends") => {
    setActiveTab(tab);
    setShowAddFriend(false);
    setShowCreate(false);
    const idx = tab === "recent" ? 0 : tab === "groups" ? 1 : 2;
    pagerRef.current?.scrollTo({ x: idx * screenWidth, animated: true });
  }, [screenWidth]);

  const onPagerScrollEnd = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    setActiveTab(page === 0 ? "recent" : page === 1 ? "groups" : "friends");
  }, [screenWidth]);

  const handlePlusPress = useCallback(() => {
    if (activeTab === "groups") {
      setShowAddFriend(false);
      setGroupName("");
      setGroupType("trip");
      setGroupImage(null);
      setGroupImageBase64(null);
      setShowCreate(true);
    } else {
      setShowCreate(false);
      setShowAddFriend(v => !v);
    }
  }, [activeTab]);

  const pickGroupImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to set a group image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setGroupImage(result.assets[0].uri);
      setGroupImageBase64(result.assets[0].base64 ?? null);
    }
  }, []);

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
    // Shared tab should always use real data.
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
      if (!isDemoOn) {
        invalidateApiCache("/api/groups/summary");
        refetch(true);
      }
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
      setGroupType("trip");
      setShowCreate(false);
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch("/api/groups", {
        method: "POST",
        body: { name, ownerDisplayName: "You", groupType } as object,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        Alert.alert("Error", data?.error ?? "Could not create group");
        return;
      }
      setShowCreate(false);
      setGroupName("");
      setGroupType("trip");
      const capturedBase64 = groupImageBase64;
      setGroupImage(null);
      setGroupImageBase64(null);

      let imageDataUri: string | null = null;
      if (capturedBase64) {
        imageDataUri = `data:image/jpeg;base64,${capturedBase64}`;
        try {
          const uploadRes = await apiFetch(`/api/groups/${data.id}/image`, {
            method: "POST",
            body: { image: imageDataUri } as object,
          });
          if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}));
            console.warn("[createGroup] image upload failed:", (err as { error?: string }).error);
            toast.show("Group created but photo failed to save");
          }
        } catch (e) {
          console.warn("[createGroup] image upload error:", e);
          toast.show("Group created but photo failed to save");
        }
      }

      await refetch(true);
      await onRefresh();
      const nextGroups = [{ id: data.id, name, memberCount: 1, groupType }, ...optimisticGroups.filter((g) => g.id !== data.id)];
      setOptimisticGroups(nextGroups);
      await persistOptimistic(nextGroups, optimisticFriends);
      goToExpense("group", data.id, name);
    } finally {
      setCreating(false);
    }
  };

  const existingFriendNames = useMemo(() => {
    const names = new Set<string>();
    for (const f of summary?.friends ?? []) names.add(f.displayName.trim().toLowerCase());
    for (const f of optimisticFriends) names.add(f.displayName.trim().toLowerCase());
    return names;
  }, [summary, optimisticFriends]);

  const filteredContacts = useMemo(() => {
    if (contactsPerm !== "granted") return [];
    const q = contactSearch.toLowerCase().trim();
    return deviceContacts
      .filter((c) => {
        if (existingFriendNames.has(c.name.trim().toLowerCase())) return false;
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || (c.phone?.includes(q) ?? false) || (c.email?.toLowerCase().includes(q) ?? false);
      })
      .slice(0, 50);
  }, [deviceContacts, contactsPerm, contactSearch, existingFriendNames]);

  const addFriendFromContact = useCallback((contact: DeviceContact) => {
    setFriendName(contact.name);
    setFriendEmail(contact.email ?? "");
  }, []);

  const closeAddFriend = useCallback(() => {
    setShowAddFriend(false);
    setFriendName("");
    setFriendEmail("");
    setContactSearch("");
    setShowManualEntry(false);
  }, []);

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

      closeAddFriend();
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
      goToExpense("group", group.id, name);
    } catch {
      Alert.alert("Error", "Network error. Try again.");
    } finally {
      setAddingFriend(false);
    }
  };

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
          imageUrl: null as string | null | undefined,
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
      imageUrl: null as string | null | undefined,
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

  const goToExpense = useCallback((type: "friend" | "group", key: string, name: string) => {
    router.push({
      pathname: "/(tabs)/add-expense",
      params: {
        prefillNonce: String(Date.now()),
        prefillPersonKey: key,
        prefillPersonName: name,
        prefillPersonType: type,
        prefillDesc: "",
        prefillAmount: "",
      },
    });
  }, []);

  const recentItems = useMemo(() => {
    return [...groups].sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
  }, [groups]);

  if (loading && !summary) return <SharedSkeletonScreen />;

  return (
    <SafeAreaView style={[st.container, { backgroundColor: theme.background }]} edges={["top"]}>
      {/* Tab bar */}
      <View style={[st.tabBar, { borderBottomColor: theme.border }]}>
        <View
          style={st.tabsInner}
          onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
        >
          <TouchableOpacity style={st.tab} onPress={() => handleTabPress("recent")} activeOpacity={0.8}>
            <Text style={[st.tabText, { color: activeTab === "recent" ? theme.text : theme.textTertiary }]}>Recent</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.tab} onPress={() => handleTabPress("groups")} activeOpacity={0.8}>
            <Text style={[st.tabText, { color: activeTab === "groups" ? theme.text : theme.textTertiary }]}>Groups</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.tab} onPress={() => handleTabPress("friends")} activeOpacity={0.8}>
            <Text style={[st.tabText, { color: activeTab === "friends" ? theme.text : theme.textTertiary }]}>Friends</Text>
          </TouchableOpacity>
          {tabsWidth > 0 && (
            <Animated.View
              style={[st.tabIndicator, {
                width: tabsWidth / 3,
                backgroundColor: theme.text,
                transform: [{
                  translateX: scrollX.interpolate({
                    inputRange: [0, screenWidth, screenWidth * 2],
                    outputRange: [0, tabsWidth / 3, (tabsWidth / 3) * 2],
                    extrapolate: "clamp",
                  }),
                }],
              }]}
            />
          )}
        </View>
        <TouchableOpacity style={[st.addPill, { backgroundColor: theme.text }]} onPress={handlePlusPress} activeOpacity={0.75}>
          <Ionicons name="add" size={16} color={theme.background} />
          <Text style={[st.addPillText, { color: theme.background }]}>
            {activeTab === "groups" ? "Group" : "Friend"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Add friend — full-screen contacts picker */}
      <Modal
        visible={showAddFriend}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeAddFriend}
      >
        <SafeAreaView style={[st.afContainer, { backgroundColor: theme.background }]} edges={["top"]}>
          {/* Header */}
          <View style={[st.afHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={closeAddFriend} hitSlop={12}>
              <Text style={[st.afCancel, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[st.afTitle, { color: theme.text }]}>Add friends</Text>
            <View style={{ width: 50 }} />
          </View>

          {/* Search */}
          <View style={st.afSearchWrap}>
            <Ionicons name="search" size={18} color={theme.textTertiary} style={{ marginLeft: 12 }} />
            <TextInput
              style={[st.afSearchInput, { color: theme.text }]}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search contacts"
              placeholderTextColor={theme.textTertiary}
              autoFocus
              autoCorrect={false}
              maxLength={100}
            />
            {contactSearch.length > 0 && (
              <TouchableOpacity onPress={() => setContactSearch("")} hitSlop={8} style={{ marginRight: 12 }}>
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Manual entry option */}
          {!showManualEntry ? (
            <TouchableOpacity
              style={[st.afManualRow, { borderBottomColor: theme.border }]}
              onPress={() => setShowManualEntry(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={22} color={theme.text} />
              <Text style={[st.afManualText, { color: theme.text }]}>Add a new contact manually</Text>
            </TouchableOpacity>
          ) : (
            <View style={[st.afManualForm, { borderBottomColor: theme.border }]}>
              <TextInput
                style={[st.afManualInput, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary, color: theme.text }]}
                value={friendName}
                onChangeText={setFriendName}
                placeholder="Name"
                placeholderTextColor={theme.textTertiary}
                autoFocus
                maxLength={100}
              />
              <TextInput
                style={[st.afManualInput, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary, color: theme.text }]}
                value={friendEmail}
                onChangeText={setFriendEmail}
                placeholder="Email (optional)"
                placeholderTextColor={theme.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                maxLength={254}
              />
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={[st.afAddBtn, { backgroundColor: theme.text, opacity: friendName.trim() ? 1 : 0.4 }]}
                  onPress={addFriend}
                  disabled={!friendName.trim() || addingFriend}
                >
                  <Text style={[st.afAddBtnText, { color: theme.background }]}>
                    {addingFriend ? "Adding…" : "Add friend"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowManualEntry(false); setFriendName(""); setFriendEmail(""); }}>
                  <Text style={[st.afCancelSmall, { color: theme.textTertiary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Contacts list */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {contactsPerm !== "granted" ? (
              <View style={st.afPermission}>
                <Text style={[st.afPermTitle, { color: theme.text }]}>Connect your contacts</Text>
                <Text style={[st.afPermSub, { color: theme.textTertiary }]}>
                  Quickly add friends from your phone contacts.
                </Text>
                <TouchableOpacity
                  style={[st.afPermBtn, { backgroundColor: theme.text }]}
                  onPress={requestContactsAccess}
                  activeOpacity={0.8}
                >
                  <Text style={[st.afPermBtnText, { color: theme.background }]}>Allow access</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[st.afSectionLabel, { color: theme.textTertiary }]}>From your contacts</Text>
                {filteredContacts.length === 0 ? (
                  <Text style={[st.afEmpty, { color: theme.textTertiary }]}>
                    {contactSearch ? "No contacts match your search" : "No contacts to show"}
                  </Text>
                ) : (
                  filteredContacts.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[st.afContactRow, { borderBottomColor: theme.borderLight }]}
                      onPress={() => {
                        addFriendFromContact(c);
                        setShowManualEntry(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[st.afContactName, { color: theme.text }]}>{c.name}</Text>
                        <Text style={[st.afContactPhone, { color: theme.textTertiary }]}>
                          {c.phone ?? c.email ?? ""}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </>
            )}
          </ScrollView>

          {/* Bottom add button — shows when contact selected */}
          {friendName.trim() && !showManualEntry ? (
            <View style={[st.afBottom, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
              <View style={st.afSelectedPill}>
                <Avatar name={friendName} size={28} />
                <Text style={[st.afSelectedName, { color: theme.text }]} numberOfLines={1}>{friendName}</Text>
                <TouchableOpacity onPress={() => { setFriendName(""); setFriendEmail(""); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[st.afBottomBtn, { backgroundColor: theme.text }]}
                onPress={addFriend}
                disabled={addingFriend}
                activeOpacity={0.8}
              >
                {addingFriend ? (
                  <ActivityIndicator color={theme.background} size="small" />
                ) : (
                  <Text style={[st.afBottomBtnText, { color: theme.background }]}>Add friend</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showCreate}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowCreate(false); setGroupName(""); setGroupType("trip"); setGroupImage(null); setGroupImageBase64(null); }}
      >
        <Pressable style={st.sheetOverlay} onPress={() => { setShowCreate(false); setGroupName(""); setGroupType("trip"); setGroupImage(null); setGroupImageBase64(null); }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable style={[st.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
              <View style={st.sheetHandle} />
              <View style={st.sheetHeader}>
                <Text style={[st.sheetTitle, { color: theme.text }]}>New Group</Text>
                <TouchableOpacity onPress={() => { setShowCreate(false); setGroupName(""); setGroupType("trip"); setGroupImage(null); setGroupImageBase64(null); }} hitSlop={8}>
                  <Ionicons name="close" size={22} color={theme.textTertiary} />
                </TouchableOpacity>
              </View>

              {/* Image picker */}
              <TouchableOpacity style={st.imagePicker} onPress={pickGroupImage} activeOpacity={0.8}>
                {groupImage ? (
                  <Image source={{ uri: groupImage }} style={st.imagePickerImg} />
                ) : (
                  <View style={[st.imagePickerPlaceholder, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                    <Ionicons name="camera-outline" size={26} color={theme.textTertiary} />
                    <Text style={[st.imagePickerLabel, { color: theme.textTertiary }]}>Add photo</Text>
                  </View>
                )}
                <View style={[st.imagePickerBadge, { backgroundColor: theme.text }]}>
                  <Ionicons name="camera" size={12} color={theme.surface} />
                </View>
              </TouchableOpacity>

              {/* Group type picker */}
              <View style={st.typeGrid}>
                {([
                  { id: "trip", label: "Trip", icon: "✈️" },
                  { id: "home", label: "Home", icon: "🏠" },
                  { id: "couple", label: "Couple", icon: "❤️" },
                  { id: "event", label: "Event", icon: "🎉" },
                  { id: "other", label: "Other", icon: "👥" },
                ] as const).map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setGroupType(t.id)}
                    activeOpacity={0.75}
                    style={[
                      st.typeBtn,
                      { borderColor: groupType === t.id ? theme.text : theme.border,
                        backgroundColor: groupType === t.id ? theme.text + "10" : theme.surfaceSecondary }
                    ]}
                  >
                    <Text style={st.typeEmoji}>{t.icon}</Text>
                    <Text style={[st.typeLabel, { color: groupType === t.id ? theme.text : theme.textTertiary }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Name input */}
              <TextInput
                style={[st.sheetInput, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary, color: theme.text }]}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Group name"
                placeholderTextColor={theme.textTertiary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={createGroup}
                maxLength={100}
              />

              {/* Create button */}
              <TouchableOpacity
                style={[st.sheetCreateBtn, { backgroundColor: groupName.trim() ? theme.text : theme.border, opacity: groupName.trim() ? 1 : 0.5 }]}
                onPress={createGroup}
                disabled={!groupName.trim() || creating}
                activeOpacity={0.8}
              >
                {creating ? (
                  <ActivityIndicator color={theme.surface} size="small" />
                ) : (
                  <Text style={[st.sheetCreateBtnText, { color: theme.surface }]}>Create Group</Text>
                )}
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Swipeable pages */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={onPagerScrollEnd}
        scrollEventThrottle={1}
        style={{ flex: 1 }}
      >
        {/* Recent page */}
        <ScrollView
          style={{ width: screenWidth }}
          contentContainerStyle={st.page}
          showsVerticalScrollIndicator={false}
          refreshControl={!isDemoOn ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {!recentItems.length ? (
            <View style={[st.groupedCard, st.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="time-outline" size={30} color={theme.textTertiary} />
              <Text style={[st.emptyTitle, { color: theme.text }]}>No activity yet</Text>
              <Text style={[st.emptySub, { color: theme.textTertiary }]}>Add a friend or group to start.</Text>
            </View>
          ) : (
            <View style={[st.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {recentItems.map((g, i) => (
                <View key={g.id}>
                  <TouchableOpacity
                    style={st.groupedRow}
                    onPress={() => goToExpense("group", g.id, g.name)}
                    activeOpacity={0.75}
                  >
                    {g.memberCount <= 2 ? (
                      <Avatar name={g.name} size={42} />
                    ) : g.imageUrl ? (
                      <Image source={{ uri: g.imageUrl }} style={st.groupIconImg} />
                    ) : (
                      <View style={[st.groupIcon, { backgroundColor: theme.surfaceSecondary }]}>
                        <Ionicons name="people" size={18} color={theme.text} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[st.rowName, { color: theme.text }]}>{g.name}</Text>
                      <Text style={[st.rowSub, { color: theme.textTertiary }]}>
                        {g.memberCount <= 2 ? "" : `${g.memberCount} members · `}{timeAgo(g.lastActivityAt)}
                      </Text>
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
                  {i < recentItems.length - 1 ? <View style={[st.rowSep, { backgroundColor: theme.borderLight }]} /> : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Groups page */}
        <ScrollView
          style={{ width: screenWidth }}
          contentContainerStyle={st.page}
          showsVerticalScrollIndicator={false}
          refreshControl={!isDemoOn ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {!visibleGroups.length ? (
            <View style={[st.groupedCard, st.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="people-outline" size={30} color={theme.textTertiary} />
              <Text style={[st.emptyTitle, { color: theme.text }]}>No groups yet</Text>
              <Text style={[st.emptySub, { color: theme.textTertiary }]}>Create a group for trips, roommates, or dinners.</Text>
            </View>
          ) : (
            <View style={[st.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {visibleGroups.map((g, i) => (
                <View key={g.id}>
                  <TouchableOpacity
                    style={st.groupedRow}
                    onPress={() => goToExpense("group", g.id, g.name)}
                    activeOpacity={0.75}
                  >
                    {g.imageUrl ? (
                      <Image source={{ uri: g.imageUrl }} style={st.groupIconImg} />
                    ) : (
                      <View style={[st.groupIcon, { backgroundColor: theme.surfaceSecondary }]}>
                        <Ionicons name="people" size={18} color={theme.text} />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[st.rowName, { color: theme.text }]}>{g.name}</Text>
                      <Text style={[st.rowSub, { color: theme.textTertiary }]}>{g.memberCount} members · {timeAgo(g.lastActivityAt)}</Text>
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
                  {i < visibleGroups.length - 1 ? <View style={[st.rowSep, { backgroundColor: theme.borderLight }]} /> : null}
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
                          onPress={() => goToExpense("group", g.id, g.name)}
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

        {/* Friends page */}
        <ScrollView
          style={{ width: screenWidth }}
          contentContainerStyle={st.page}
          showsVerticalScrollIndicator={false}
          refreshControl={!isDemoOn ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {!friends.length ? (
            <View style={[st.groupedCard, st.emptyInner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="person-add-outline" size={30} color={theme.textTertiary} />
              <Text style={[st.emptyTitle, { color: theme.text }]}>No friends yet</Text>
              <Text style={[st.emptySub, { color: theme.textTertiary }]}>Add a friend to start splitting expenses.</Text>
            </View>
          ) : (
            <View style={[st.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {friends.map((f, i) => {
                const isGroupBacked = f.key.startsWith("opt-") || f.key.startsWith("fb-");
                const targetKey = isGroupBacked ? (f.key.startsWith("opt-") ? f.key.slice(4) : f.key.slice(3)) : f.key;
                const targetType = isGroupBacked ? "group" as const : "friend" as const;
                return (
                  <View key={f.key}>
                    <TouchableOpacity
                      style={st.groupedRow}
                      onPress={() => goToExpense(targetType, targetKey, f.displayName)}
                      activeOpacity={0.75}
                    >
                      <Avatar name={f.displayName} size={42} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[st.rowName, { color: theme.text }]}>{f.displayName}</Text>
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
                    {i < friends.length - 1 ? <View style={[st.rowSep, { backgroundColor: theme.borderLight }]} /> : null}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3F2" },
  page: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },

  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingRight: 16,
  },
  tabsInner: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
  },
  tabText: {
    fontSize: 15,
    fontFamily: font.bold,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2.5,
    borderRadius: 2,
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1F2328",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  addPillText: {
    fontSize: 13,
    fontFamily: font.bold,
    color: "#fff",
  },

  // bottom sheet modal
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1C9C4",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: font.bold,
  },
  imagePicker: {
    alignSelf: "center",
    marginBottom: 20,
    position: "relative",
  },
  imagePickerImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  imagePickerPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  imagePickerLabel: {
    fontSize: 10,
    fontFamily: font.semibold,
  },
  imagePickerBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  typeGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  typeBtn: {
    flex: 1,
    minWidth: 60,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 4,
  },
  typeEmoji: {
    fontSize: 22,
  },
  typeLabel: {
    fontSize: 11,
    fontFamily: font.bold,
  },
  sheetInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: font.semibold,
    marginBottom: 16,
  },
  sheetCreateBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCreateBtnText: {
    fontSize: 16,
    fontFamily: font.bold,
  },

  // Add friend modal
  afContainer: { flex: 1 },
  afHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  afCancel: { fontSize: 16, fontFamily: font.medium },
  afTitle: { fontSize: 17, fontFamily: font.bold },
  afSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  afSearchInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: font.regular,
  },
  afManualRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  afManualText: { fontSize: 16, fontFamily: font.medium },
  afManualForm: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  afManualInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: font.regular,
  },
  afAddBtn: {
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  afAddBtnText: { fontFamily: font.bold, fontSize: 14 },
  afCancelSmall: { fontFamily: font.semibold, fontSize: 14, paddingVertical: 10 },
  afSectionLabel: {
    fontSize: 12,
    fontFamily: font.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  afEmpty: {
    fontSize: 14,
    fontFamily: font.regular,
    paddingHorizontal: 20,
    paddingVertical: 20,
    textAlign: "center",
  },
  afContactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  afContactName: { fontSize: 16, fontFamily: font.medium },
  afContactPhone: { fontSize: 13, fontFamily: font.regular, marginTop: 1 },
  afPermission: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 30,
    gap: 8,
  },
  afPermTitle: { fontSize: 17, fontFamily: font.bold },
  afPermSub: { fontSize: 14, fontFamily: font.regular, textAlign: "center" },
  afPermBtn: {
    marginTop: 12,
    borderRadius: radii.lg,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  afPermBtnText: { fontSize: 15, fontFamily: font.bold },
  afBottom: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  afSelectedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  afSelectedName: { fontSize: 15, fontFamily: font.semibold, flex: 1 },
  afBottomBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  afBottomBtnText: { fontSize: 16, fontFamily: font.bold },

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
  groupIconImg: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
  },
  emptyInner: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontFamily: font.bold, color: "#1F2328", marginTop: 10 },
  emptySub: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 4, textAlign: "center" },
});

