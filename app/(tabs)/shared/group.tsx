import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  DeviceEventEmitter,
  Image,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  FlatList,
  ActionSheetIOS,
  AppState,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import * as ImagePicker from "expo-image-picker";
import { useApiFetch, invalidateApiCache } from "../../../lib/api";
import { clearMemSummaryCache } from "../../../hooks/useGroups";
import { useGroupDetail, useGroupsSummary, type FriendBalance, type GroupMember } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { useDemoData } from "../../../lib/demo-context";
import { useTheme } from "../../../lib/theme-context";
import { colors, font, fontSize, shadow, radii, space } from "../../../lib/theme";
import { formatSplitCurrencyAmount } from "../../../lib/format-split-money";
import { MerchantLogo } from "../../../components/merchant/MerchantLogo";
import { MemberAvatar } from "../../../components/MemberAvatar";
import { setExpensePrefillTarget } from "../../../lib/add-expense-prefill";
import * as Clipboard from "expo-clipboard";
import { useToast } from "../../../components/Toast";
import { sfx } from "../../../lib/sounds";
import { BASE_URL } from "../../../lib/invite";
import { openVenmo, openPayPal, openCashApp } from "../../../lib/p2p-deeplinks";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/heic"];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MEMBER_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#10B981", "#F97316", "#06B6D4", "#EC4899", "#6366F1", "#14B8A6"];

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Extracted FlatList renderItem for the friend picker */
const FriendPickerItem = React.memo(function FriendPickerItem({
  item,
  isSelected,
  onToggle,
  theme,
}: {
  item: FriendBalance;
  isSelected: boolean;
  onToggle: (friend: FriendBalance) => void;
  theme: any;
}) {
  return (
    <TouchableOpacity
      style={s.pickerFriendRow}
      onPress={() => onToggle(item)}
      activeOpacity={0.7}
    >
      <MemberAvatar name={item.displayName} size={36} imageUrl={item.image_url ?? null} variant="soft" />
      <Text style={[s.pickerFriendName, { color: theme.text }]}>{item.displayName}</Text>
      <View style={[
        s.pickerCheckbox,
        {
          borderColor: isSelected ? theme.primary : theme.border,
          backgroundColor: isSelected ? theme.primary : "transparent",
        },
      ]}>
        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
    </TouchableOpacity>
  );
});

export default function GroupScreen() {
  const { theme } = useTheme();
  const { id, localImage, source } = useLocalSearchParams<{ id: string; localImage?: string; source?: string }>();
  const { userId } = useAuth();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { detail: realDetail, loading, refetch } = useGroupDetail(isDemoOn ? null : (id ?? null));
  const { refetch: refetchSummary } = useGroupsSummary({ contacts: true });
  const detail = isDemoOn && id ? demo.groupDetails[id] ?? null : realDetail;
  const toast = useToast();

  const [recordingSettlement, setRecordingSettlement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const swipeableRefs = useRef(new Map<string, Swipeable>()).current;
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [localIconUrl, setLocalIconUrl] = useState<string | null>(localImage ?? null);

  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<FriendBalance[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [addingMembers, setAddingMembers] = useState(false);
  const [manualName, setManualName] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [showRenameGroupModal, setShowRenameGroupModal] = useState(false);
  const [renameGroupDraft, setRenameGroupDraft] = useState("");
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [handlesMember, setHandlesMember] = useState<GroupMember | null>(null);
  const [handlesVenmo, setHandlesVenmo] = useState("");
  const [handlesCashapp, setHandlesCashapp] = useState("");
  const [handlesPaypal, setHandlesPaypal] = useState("");
  const [savingHandles, setSavingHandles] = useState(false);
  const [pendingP2PPlatform, setPendingP2PPlatform] = useState<string | null>(null);
  const [pendingP2PSuggestion, setPendingP2PSuggestion] = useState<{ fromMemberId: string; toMemberId: string; amount: number; currency: string } | null>(null);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const [membersExpanded, setMembersExpanded] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!detail || detail.group_type !== "friend") return;
    const otherMember = detail.members.find((m) => m.user_id !== userId);
    if (otherMember) {
      const personKey = otherMember.user_id ?? otherMember.email ?? otherMember.id;
      router.replace({ pathname: "/(tabs)/shared/person", params: { key: personKey } });
    }
  }, [detail, userId]);

  const goBack = useCallback(() => {
    if (source === "home") {
      router.replace("/(tabs)");
    } else {
      router.back();
    }
  }, [source]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active" && pendingP2PPlatform) {
        setConfirmPaymentOpen(true);
        setPendingP2PPlatform(null);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [pendingP2PPlatform]);

  const { summary } = useGroupsSummary({ contacts: true });
  const existingMemberNames = useMemo(
    () => new Set((detail?.members ?? []).map((m) => m.display_name.toLowerCase())),
    [detail?.members],
  );
  const availableFriends = useMemo(() => {
    const all = summary?.friends ?? [];
    return all.filter((f) => !existingMemberNames.has(f.displayName.toLowerCase()));
  }, [summary?.friends, existingMemberNames]);

  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return availableFriends;
    const q = searchQuery.toLowerCase();
    return availableFriends.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [availableFriends, searchQuery]);

  const toggleFriend = useCallback((friend: FriendBalance) => {
    sfx.pop();
    setSelectedFriends((prev) => {
      const exists = prev.some((f) => f.key === friend.key);
      return exists ? prev.filter((f) => f.key !== friend.key) : [...prev, friend];
    });
  }, []);

  const renderFriendPickerItem = useCallback(({ item }: { item: FriendBalance }) => {
    const isSelected = selectedFriends.some((f) => f.key === item.key);
    return (
      <FriendPickerItem item={item} isSelected={isSelected} onToggle={toggleFriend} theme={theme} />
    );
  }, [selectedFriends, toggleFriend, theme]);

  const removeFriend = (key: string) => {
    sfx.pop();
    setSelectedFriends((prev) => prev.filter((f) => f.key !== key));
  };

  const addManualContact = () => {
    const name = manualName.trim();
    if (!name) return;
    sfx.pop();
    const fake: FriendBalance = { key: `manual_${Date.now()}`, displayName: name, balance: null, balances: [] };
    setSelectedFriends((prev) => [...prev, fake]);
    setManualName("");
    setShowManualInput(false);
  };

  const openAddMembers = () => {
    sfx.sheetOpen();
    setSelectedFriends([]);
    setSearchQuery("");
    setShowManualInput(false);
    setManualName("");
    setShowAddMember(true);
  };

  const addSelectedMembers = async () => {
    if (selectedFriends.length === 0 || !id) return;
    setAddingMembers(true);
    sfx.pop();
    try {
      let added = 0;
      for (const friend of selectedFriends) {
        const res = await apiFetch(`/api/groups/${id}/members`, {
          method: "POST",
          body: { displayName: friend.displayName } as object,
        });
        if (res.ok) added++;
      }
      setShowAddMember(false);
      setSelectedFriends([]);
      await refetch(true);
      sfx.success();
      toast.show(`${added} member${added !== 1 ? "s" : ""} added`);
    } catch {
      Alert.alert("Error", "Could not add members");
    } finally {
      setAddingMembers(false);
    }
  };

  const handleDeleteExpense = useCallback((txId: string, merchant: string) => {
    Alert.alert(
      "Delete expense",
      `Remove "${merchant}" from this group? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => swipeableRefs.get(txId)?.close() },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(txId);
            try {
              const res = await apiFetch(`/api/split-transactions/${txId}`, { method: "DELETE" });
              if (res.ok) {
                DeviceEventEmitter.emit("groups-updated");
                await refetch(true);
                await refetchSummary();
              } else {
                Alert.alert("Error", "Couldn't delete expense. Try again.");
              }
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  }, [apiFetch, refetch, refetchSummary, swipeableRefs]);

  const renderRightActions = useCallback(
    (txId: string, merchant: string) =>
      (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
        const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.5], extrapolate: "clamp" });
        return (
          <View style={s.swipeActions}>
            <TouchableOpacity
              style={s.swipeEdit}
              onPress={() => {
                swipeableRefs.get(txId)?.close();
                router.push({ pathname: "/(tabs)/shared/transaction", params: { id: txId, edit: "1" } });
              }}
              activeOpacity={0.7}
            >
              <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
                <Ionicons name="pencil" size={18} color="#fff" />
                <Text style={s.swipeActionText}>Edit</Text>
              </Animated.View>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.swipeDelete}
              onPress={() => handleDeleteExpense(txId, merchant)}
              activeOpacity={0.7}
            >
              <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={s.swipeActionText}>Delete</Text>
              </Animated.View>
            </TouchableOpacity>
          </View>
        );
      },
    [handleDeleteExpense, swipeableRefs]
  );

  const pickAndUploadIcon = useCallback(async (source: "library" | "camera") => {
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow camera access in Settings to take a photo.");
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow photo library access in Settings.");
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: "images" as ImagePicker.MediaType,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      exif: false,
      base64: true,
    };
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? (asset.uri.endsWith(".png") ? "image/png" : "image/jpeg");
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      Alert.alert("Invalid file type", "Only PNG, JPEG, and HEIC images are allowed.");
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE) {
      Alert.alert("File too large", "Image must be under 2MB.");
      return;
    }
    if (!asset.base64) {
      Alert.alert("Upload failed", "Could not read image data. Try again.");
      return;
    }

    setUploadingIcon(true);
    setLocalIconUrl(asset.uri);
    try {
      const ext = mimeType === "image/png" ? "png" : "jpg";
      const formData = new FormData();
      formData.append("image", { uri: asset.uri, type: mimeType, name: `group-icon.${ext}` } as unknown as Blob);
      if (__DEV__) console.log(`[group-icon] uploading to /api/groups/${id}/icon, mimeType:`, mimeType);
      const res = await apiFetch(`/api/groups/${id}/icon`, { method: "POST", body: formData });
      if (__DEV__) console.log("[group-icon] response status:", res.status);
      if (res.ok) {
        if (__DEV__) console.log("[group-icon] success");
        const data = await res.json().catch(() => ({}));
        if ((data as { imageUrl?: string }).imageUrl) setLocalIconUrl((data as { imageUrl: string }).imageUrl);
        toast.show("Group icon updated");
        invalidateApiCache("/api/groups/summary");
        clearMemSummaryCache();
        refetch(true);
        refetchSummary();
        DeviceEventEmitter.emit("groups-updated");
      } else {
        setLocalIconUrl(null);
        const err = await res.json().catch(() => ({}));
        if (__DEV__) console.warn("[group-icon] upload failed:", res.status, JSON.stringify(err));
        Alert.alert("Upload failed", (err as { error?: string }).error ?? "Try again.");
      }
    } finally {
      setUploadingIcon(false);
    }
  }, [id, apiFetch, toast, refetch]);

  const handleIconPress = useCallback(() => {
    if (isDemoOn || !id) return;
    const hasIcon = Boolean(localIconUrl || detail?.image_url);
    const options = hasIcon
      ? ["Choose Photo", "Take Photo", "Remove Photo", "Cancel"]
      : ["Choose Photo", "Take Photo", "Cancel"];
    const cancelIndex = options.length - 1;
    const destructiveIndex = hasIcon ? 2 : undefined;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
        async (idx) => {
          if (idx === 0) pickAndUploadIcon("library");
          else if (idx === 1) pickAndUploadIcon("camera");
          else if (idx === 2 && hasIcon) {
            setUploadingIcon(true);
            try {
              const res = await apiFetch(`/api/groups/${id}/icon`, { method: "DELETE" });
              if (res.ok) { setLocalIconUrl(null); toast.show("Group icon removed"); invalidateApiCache("/api/groups/summary"); clearMemSummaryCache(); refetch(true); refetchSummary(); DeviceEventEmitter.emit("groups-updated"); }            } finally { setUploadingIcon(false); }
          }
        }
      );
    } else {
      Alert.alert("Group Photo", undefined, [
        { text: "Choose Photo", onPress: () => pickAndUploadIcon("library") },
        { text: "Take Photo", onPress: () => pickAndUploadIcon("camera") },
        ...(hasIcon ? [{ text: "Remove Photo", style: "destructive" as const, onPress: async () => {
          setUploadingIcon(true);
          try {
            const res = await apiFetch(`/api/groups/${id}/icon`, { method: "DELETE" });
            if (res.ok) { setLocalIconUrl(null); toast.show("Group icon removed"); invalidateApiCache("/api/groups/summary"); clearMemSummaryCache(); refetch(true); refetchSummary(); DeviceEventEmitter.emit("groups-updated"); }
          } finally { setUploadingIcon(false); }
        }}] : []),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }, [isDemoOn, id, localIconUrl, detail?.image_url, pickAndUploadIcon, apiFetch, toast, refetch]);

  useEffect(() => {
    if (detail && id) {
      setExpensePrefillTarget({ key: id, name: detail.name, type: "group" });
    }
    return () => setExpensePrefillTarget(null);
  }, [id, detail?.name]);

  useEffect(() => {
    if (isDemoOn) return;
    const subs = [
      DeviceEventEmitter.addListener("groups-updated", () => refetch(true)),
      DeviceEventEmitter.addListener("expense-added", () => refetch(true)),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [isDemoOn, refetch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(true); } finally { setRefreshing(false); }
  }, [refetch]);

  const patchArchive = async (archived: boolean) => {
    if (!id || isDemoOn) return;
    const res = await apiFetch(`/api/groups/${id}`, {
      method: "PATCH",
      body: { archived } as object,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      Alert.alert("Couldn't update group", (err as { error?: string }).error ?? "Try again.");
      return;
    }
    DeviceEventEmitter.emit("groups-updated");
    await refetch(true);
    await refetchSummary();
    if (archived) goBack();
  };

  const applyGroupRename = useCallback(
    async (raw: string) => {
      if (!id || isDemoOn) return;
      const name = raw.trim();
      if (!name) return;
      setRenamingGroup(true);
      try {
        const res = await apiFetch(`/api/groups/${id}`, {
          method: "PATCH",
          body: { name } as object,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          Alert.alert("Couldn't rename group", (err as { error?: string }).error ?? "Try again.");
          return;
        }
        DeviceEventEmitter.emit("groups-updated");
        await refetch(true);
        await refetchSummary();
        toast.show("Group renamed");
        setShowRenameGroupModal(false);
      } catch {
        Alert.alert("Error", "Could not rename group.");
      } finally {
        setRenamingGroup(false);
      }
    },
    [id, isDemoOn, apiFetch, refetch, refetchSummary, toast]
  );

  const openRenameGroup = useCallback(() => {
    if (!detail?.isOwner || isDemoOn || detail.archivedAt) return;
    sfx.pop();
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Rename group",
        "Enter a new name for this group.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: (value?: string) => void applyGroupRename(value ?? "") },
        ],
        "plain-text",
        detail.name
      );
    } else {
      setRenameGroupDraft(detail.name);
      setShowRenameGroupModal(true);
    }
  }, [detail?.isOwner, detail?.name, detail?.archivedAt, isDemoOn, applyGroupRename]);

  const leaveGroup = useCallback(() => {
    if (!id || isDemoOn) return;
    Alert.alert(
      "Leave group?",
      "You will lose access to this group's expenses and balances.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await apiFetch(`/api/groups/${id}/members`, { method: "DELETE" });
              if (res.ok) {
                DeviceEventEmitter.emit("groups-updated");
                await refetchSummary();
                goBack();
              } else {
                const err = await res.json().catch(() => ({}));
                Alert.alert("Couldn't leave", (err as { error?: string }).error ?? "Try again.");
              }
            } catch {
              Alert.alert("Error", "Could not leave group.");
            }
          },
        },
      ]
    );
  }, [apiFetch, id, isDemoOn, refetchSummary]);

  const confirmRemoveMember = useCallback(
    (m: GroupMember) => {
      if (!id || isDemoOn) return;
      Alert.alert(
        "Remove member?",
        `Remove ${m.display_name} from this group?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              setRemovingMemberId(m.id);
              try {
                const res = await apiFetch(`/api/groups/${id}/members/${m.id}`, { method: "DELETE" });
                if (res.ok) {
                  DeviceEventEmitter.emit("groups-updated");
                  await refetch(true);
                  await refetchSummary();
                } else {
                  const err = await res.json().catch(() => ({}));
                  Alert.alert("Couldn't remove member", (err as { error?: string }).error ?? "Try again.");
                }
              } catch {
                Alert.alert("Error", "Could not remove member.");
              } finally {
                setRemovingMemberId(null);
              }
            },
          },
        ]
      );
    },
    [apiFetch, id, isDemoOn, refetch, refetchSummary]
  );

  const openEditHandles = useCallback(
    (m: GroupMember) => {
      if (!detail?.isOwner || isDemoOn || detail.archivedAt) return;
      sfx.pop();
      setHandlesMember(m);
      setHandlesVenmo((m.venmo_username ?? "").trim());
      setHandlesCashapp((m.cashapp_cashtag ?? "").replace(/^\$/, "").trim());
      setHandlesPaypal((m.paypal_username ?? "").trim());
    },
    [detail?.isOwner, detail?.archivedAt, isDemoOn]
  );

  const saveMemberHandles = useCallback(async () => {
    if (!id || !handlesMember || isDemoOn) return;
    const cashRaw = handlesCashapp.trim().replace(/^\$/, "");
    setSavingHandles(true);
    try {
      const res = await apiFetch(`/api/groups/${id}/members`, {
        method: "PATCH",
        body: {
          memberId: handlesMember.id,
          venmo_username: handlesVenmo.trim() || null,
          cashapp_cashtag: cashRaw || null,
          paypal_username: handlesPaypal.trim() || null,
        } as object,
      });
      if (res.ok) {
        setHandlesMember(null);
        await refetch(true);
        toast.show("Payment handles saved");
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Couldn't save", (err as { error?: string }).error ?? "Try again.");
      }
    } catch {
      Alert.alert("Error", "Could not save handles.");
    } finally {
      setSavingHandles(false);
    }
  }, [id, handlesMember, handlesVenmo, handlesCashapp, handlesPaypal, isDemoOn, apiFetch, refetch, toast]);

  const handleGroupP2P = useCallback(
    async (
      platform: "venmo" | "paypal" | "cashapp",
      su: { fromMemberId: string; toMemberId: string; amount: number; currency: string },
      toMember?: GroupMember,
    ) => {
      if (isDemoOn) {
        const names = { venmo: "Venmo", paypal: "PayPal", cashapp: "Cash App" };
        Alert.alert("Demo", `Opening ${names[platform]}...`);
        return;
      }
      setPendingP2PPlatform(platform);
      setPendingP2PSuggestion(su);
      const note = `Coconut – ${detail?.name ?? "group"}`;
      try {
        if (platform === "venmo") {
          await openVenmo(su.amount, toMember?.venmo_username ?? null, note);
        } else if (platform === "paypal") {
          await openPayPal(su.amount, toMember?.paypal_username ?? null);
        } else {
          await openCashApp(su.amount, toMember?.cashapp_cashtag ?? null);
        }
      } catch {
        setPendingP2PPlatform(null);
        setPendingP2PSuggestion(null);
        const names = { venmo: "Venmo", paypal: "PayPal", cashapp: "Cash App" };
        Alert.alert("Could not open app", `Make sure ${names[platform]} is installed.`);
      }
    },
    [isDemoOn, detail?.name],
  );

  const handleConfirmGroupP2P = useCallback(async () => {
    setConfirmPaymentOpen(false);
    const su = pendingP2PSuggestion;
    if (!su || !id) return;
    setPendingP2PSuggestion(null);
    setRecordingSettlement(true);
    try {
      const res = await apiFetch("/api/settlements", {
        method: "POST",
        body: {
          groupId: id,
          payerMemberId: su.fromMemberId,
          receiverMemberId: su.toMemberId,
          amount: su.amount,
          method: "manual",
          currency: su.currency,
        },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        refetch();
        refetchSummary();
        DeviceEventEmitter.emit("groups-updated");
      } else {
        Alert.alert("Error", data?.error ?? "Failed to record settlement");
      }
    } catch {
      Alert.alert("Error", "Could not record settlement");
    } finally {
      setRecordingSettlement(false);
    }
  }, [pendingP2PSuggestion, id, apiFetch, refetch, refetchSummary]);

  if (!detail) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={[s.topBar, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={goBack} style={s.backRow} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
            <Text style={[s.backText, { color: theme.text }]}>Back</Text>
          </TouchableOpacity>
          <View style={{ width: 30 }} />
        </View>
        <View style={s.center}>
          {loading ? (
          <ActivityIndicator size="large" color={theme.primary} />
          ) : (
            <>
              <Ionicons name="alert-circle-outline" size={48} color={theme.textTertiary} style={{ marginBottom: 12 }} />
              <Text style={{ fontFamily: font.semibold, fontSize: 17, color: theme.text, marginBottom: 4 }}>
                Group not found
              </Text>
              <Text style={{ fontFamily: font.regular, fontSize: 14, color: theme.textTertiary, textAlign: "center", paddingHorizontal: 40 }}>
                This group may have been deleted.
              </Text>
              <TouchableOpacity onPress={goBack} style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 10 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 15, color: "#fff" }}>Go back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const hasActivity = (detail.activity?.length ?? 0) > 0;
  const allSettled = (detail.balances?.filter((b) => Math.abs(b.total) >= 0.005).length ?? 0) === 0;
  const isArchived = Boolean(detail.archivedAt);
  const ownerUserId = detail.owner_id ?? (detail.isOwner && userId ? userId : null);
  const memberIsGroupOwner = (m: GroupMember) =>
    ownerUserId != null && m.user_id != null && m.user_id === ownerUserId;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <View style={[s.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={goBack} style={s.backRow} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
          <Text style={[s.backText, { color: theme.text }]}>{source === "home" ? "Home" : "Back"}</Text>
        </TouchableOpacity>
        {!isArchived && (
          <TouchableOpacity onPress={() => setShowSettingsModal(true)} hitSlop={12} style={s.settingsBtn}>
            <Ionicons name="settings-outline" size={22} color={theme.text} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Header: avatar + name + actions */}
        <View style={s.groupHeader}>
          <TouchableOpacity onPress={handleIconPress} activeOpacity={0.7} disabled={uploadingIcon}>
            {(localIconUrl || detail.image_url) ? (
              <Image source={{ uri: localIconUrl || detail.image_url! }} style={s.groupPhoto} />
          ) : (
            <View style={[s.groupIcon, { backgroundColor: theme.surfaceSecondary }]}>
                {uploadingIcon ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
              <Ionicons name="people" size={32} color={theme.textTertiary} />
                )}
            </View>
          )}
            <View style={s.groupIconBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={[s.groupName, { color: theme.text }]}>{detail.name}</Text>
          <Text style={[s.groupMeta, { color: theme.textTertiary }]}>
            {detail.members.length} member{detail.members.length !== 1 ? "s" : ""} ·{" "}
            {detail.totalSpend != null
              ? `$${detail.totalSpend.toFixed(2)}`
              : (detail.totalSpendByCurrency ?? [])
                  .map((r) => `${r.currency} ${r.amount.toFixed(2)}`)
                  .join(" · ") || "—"}{" "}
            total
          </Text>
        </View>

        {(detail.mySpend != null && detail.mySpend > 0) || (detail.mySpendByCurrency && detail.mySpendByCurrency.length > 0) ? (
          <View style={{ marginTop: 8, marginBottom: 12 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 18, color: theme.text }}>
              You spent{" "}
              {detail.mySpend != null
                ? formatSplitCurrencyAmount(detail.mySpend, detail.mySpendByCurrency?.[0]?.currency ?? "USD")
                : (detail.mySpendByCurrency ?? []).map((b) => formatSplitCurrencyAmount(b.amount, b.currency)).join(" + ")}
            </Text>
            </View>
          ) : null}

        {isArchived ? (
          <View
            style={[
              s.archivedBanner,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight },
            ]}
          >
            <Text style={[s.archivedBannerText, { color: theme.textSecondary }]}>
              Archived — hidden from your main group list.
            </Text>
            {detail.isOwner ? (
              <TouchableOpacity onPress={() => patchArchive(false)} hitSlop={8}>
                <Text style={[s.archivedRestore, { color: theme.primary }]}>Restore</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {detail.suggestions && detail.suggestions.length > 0 ? (() => {
          const myMemberId =
            detail.members.find((m) => m.user_id === userId)?.id ??
            (detail.isOwner ? detail.members[0]?.id : undefined);
          const mySuggestions = detail.suggestions.filter(
            (su) => myMemberId && (su.fromMemberId === myMemberId || su.toMemberId === myMemberId)
          );
          return mySuggestions.length > 0 ? (
          <>
            <Text style={[s.section, { color: theme.textTertiary }]}>Settle up</Text>
            {mySuggestions.map((su) => {
              const fromMember = detail.members.find((m) => m.id === su.fromMemberId);
              const toMember = detail.members.find((m) => m.id === su.toMemberId);
              const fromName = fromMember?.display_name ?? "?";
              const toName = toMember?.display_name ?? "?";
              const theyPayMe = myMemberId && su.toMemberId === myMemberId;
              const iPayThem = myMemberId && su.fromMemberId === myMemberId;
              const canMarkPaid =
                Boolean(theyPayMe || iPayThem || (detail.isOwner && !isDemoOn));
              const targetMember = iPayThem ? toMember : fromMember;
              const hasVenmoHandle = !!(targetMember?.venmo_username);
              const hasPayPalHandle = !!(targetMember?.paypal_username);
              const hasCashAppHandle = !!(targetMember?.cashapp_cashtag);
              return (
                <View
                  key={`${su.currency}-${su.fromMemberId}-${su.toMemberId}`}
                  style={[s.suggRow, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
                >
                  <View style={s.suggPeople}>
                    <MemberAvatar name={fromName} imageUrl={fromMember?.image_url} />
                    <Ionicons name="arrow-forward" size={14} color={theme.textQuaternary} />
                    <MemberAvatar name={toName} imageUrl={toMember?.image_url} />
                  </View>
                  <View style={s.suggInfo}>
                    <Text style={[s.suggText, { color: theme.textSecondary }]}>
                      {iPayThem
                        ? <><Text style={s.bold}>You</Text> pay <Text style={s.bold}>{toName}</Text></>
                        : <><Text style={s.bold}>{fromName}</Text> pays <Text style={s.bold}>you</Text></>}
                    </Text>
                    <Text style={[s.suggAmount, { color: theyPayMe ? theme.positive : theme.negative }]}>
                      {formatSplitCurrencyAmount(su.amount, su.currency)}
                    </Text>
                  </View>
                  <View style={s.suggActions}>
                    {iPayThem && hasVenmoHandle && (
                      <TouchableOpacity
                        style={[s.miniBtn, { backgroundColor: "#3D95CE" }]}
                        onPress={() => handleGroupP2P("venmo", su, toMember)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="logo-venmo" size={14} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {iPayThem && hasPayPalHandle && (
                      <TouchableOpacity
                        style={[s.miniBtn, { backgroundColor: "#003087" }]}
                        onPress={() => handleGroupP2P("paypal", su, toMember)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="logo-paypal" size={14} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {iPayThem && hasCashAppHandle && (
                      <TouchableOpacity
                        style={[s.miniBtn, { backgroundColor: "#00D632" }]}
                        onPress={() => handleGroupP2P("cashapp", su, toMember)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="cash-outline" size={14} color="#fff" />
                      </TouchableOpacity>
                    )}
                    {canMarkPaid && (
                      <TouchableOpacity
                        style={[s.miniBtn, { borderWidth: 1, borderColor: theme.border }]}
                        onPress={() => {
                          if (isDemoOn && id) { demo.settleGroupSuggestion(id, su.fromMemberId, su.toMemberId); return; }
                          const who = `${fromName} → ${toName}`;
                          Alert.alert(
                            "Mark as paid",
                            detail.isOwner && !theyPayMe && !iPayThem
                              ? `Record that ${who} settled $${su.amount.toFixed(2)}? (You're the group owner.)`
                              : `Mark $${su.amount.toFixed(2)} as paid?`,
                            [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Mark paid",
                              onPress: async () => {
                                setRecordingSettlement(true);
                                try {
                                  const res = await apiFetch("/api/settlements", {
                                    method: "POST",
                                    body: {
                                      groupId: id,
                                      payerMemberId: su.fromMemberId,
                                      receiverMemberId: su.toMemberId,
                                      amount: su.amount,
                                      method: "manual",
                                      currency: su.currency,
                                    },
                                  });
                                  const data = (await res.json().catch(() => ({}))) as { error?: string };
                                  if (res.ok) {
                                    refetch();
                                    refetchSummary();
                                    DeviceEventEmitter.emit("groups-updated");
                                  } else {
                                    Alert.alert("Error", data?.error ?? "Failed to record settlement");
                                  }
                                } finally { setRecordingSettlement(false); }
                              },
                            },
                          ]);
                        }}
                        disabled={recordingSettlement}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.miniBtnSecondaryText, { color: theme.textSecondary }]}>Paid</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
          ) : null;
        })() : hasActivity && allSettled ? (
          <View style={[s.settledBadge, { marginBottom: 16, backgroundColor: theme.primaryLight }]}>
            <Ionicons name="checkmark-circle" size={20} color={theme.primaryDark} />
            <Text style={[s.settledBadgeText, { color: theme.primaryDark }]}>All settled up</Text>
          </View>
        ) : null}

        <Text style={[s.section, { color: theme.textTertiary }]}>Transactions</Text>
        {!hasActivity ? (
          <View style={[s.empty, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <View style={[s.emptyIcon, { backgroundColor: theme.surfaceTertiary }]}>
              <Ionicons name="receipt-outline" size={28} color={theme.textQuaternary} />
            </View>
            <Text style={[s.emptyTitle, { color: theme.textSecondary }]}>No transactions yet</Text>
            <Text style={[s.emptySubtext, { color: theme.textQuaternary }]}>Add an expense or split a receipt to start tracking.</Text>
          </View>
        ) : (
          <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            {(detail.activity ?? []).map((a, i) => (
              <Swipeable
                key={a.id}
                ref={(ref) => { if (ref) swipeableRefs.set(a.id, ref); }}
                renderRightActions={isDemoOn ? undefined : renderRightActions(a.id, a.merchant)}
                overshootRight={false}
                friction={2}
              >
                <TouchableOpacity
                  style={[
                    s.txRow,
                    { backgroundColor: theme.surface },
                    i < detail.activity.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => router.push({ pathname: "/(tabs)/shared/transaction", params: { id: a.id } })}
                  disabled={deleting === a.id}
                >
                  {a.receiptUrl ? (
                    <Image source={{ uri: a.receiptUrl }} style={s.txThumb} />
                  ) : (
                    <MerchantLogo
                      merchantName={a.merchant}
                      size={36}
                      backgroundColor={theme.surfaceTertiary}
                      borderColor={theme.borderLight}
                      style={{ marginRight: 12 }}
                    />
                  )}
                  <View style={s.txInfo}>
                    <Text style={[s.txMerchant, { color: theme.text }]}>{a.merchant}</Text>
                    <Text style={[s.txMeta, { color: theme.textQuaternary }]}>Split {a.splitCount} ways · {formatTimeAgo(a.createdAt)}</Text>
                  </View>
                  {deleting === a.id ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Text style={[s.txAmount, { color: theme.text }]}>
                      {formatSplitCurrencyAmount(a.amount, a.currency ?? "USD")}
                    </Text>
                  )}
                </TouchableOpacity>
              </Swipeable>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Add members — full-screen multi-select picker */}
      {showAddMember ? <Modal
        visible={true}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddMember(false)}
      >
        <SafeAreaView style={[s.pickerRoot, { backgroundColor: theme.surface }]} edges={["top", "bottom"]}>
          {/* Top bar */}
          <View style={s.pickerTopBar}>
            <TouchableOpacity onPress={() => setShowAddMember(false)} hitSlop={10}>
              <Text style={[s.pickerCancel, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[s.pickerTitle, { color: theme.text }]}>Add group members</Text>
            <View style={{ width: 52 }} />
          </View>

          {/* Search */}
          <View style={[s.pickerSearchWrap, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Ionicons name="search" size={18} color={theme.textTertiary} />
            <TextInput
              style={[s.pickerSearchInput, { color: theme.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search friends"
              placeholderTextColor={theme.textTertiary}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Selected chips */}
          {selectedFriends.length > 0 && (
            <View style={s.pickerChipsSection}>
              <Text style={[s.pickerChipsLabel, { color: theme.textSecondary }]}>People to add</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pickerChipsScroll} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
                {selectedFriends.map((f) => (
                  <View key={f.key} style={s.pickerChip}>
                    <View style={[s.pickerChipAvatar, { backgroundColor: MEMBER_COLORS[f.displayName.charCodeAt(0) % MEMBER_COLORS.length] }]}>
                      <Text style={s.pickerChipAvatarText}>{f.displayName.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.pickerChipRemove, { backgroundColor: theme.textTertiary }]}
                      onPress={() => removeFriend(f.key)}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={10} color="#fff" />
                    </TouchableOpacity>
                    <Text style={[s.pickerChipName, { color: theme.text }]} numberOfLines={1}>{f.displayName.split(" ")[0]}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={[s.pickerDivider, { backgroundColor: theme.borderLight }]} />

          {/* Add a new contact */}
          {showManualInput ? (
            <View style={[s.pickerManualRow, { borderBottomColor: theme.borderLight }]}>
              <TextInput
                style={[s.pickerManualInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                value={manualName}
                onChangeText={setManualName}
                placeholder="Enter name"
                placeholderTextColor={theme.textTertiary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={addManualContact}
              />
              <TouchableOpacity
                style={[s.pickerManualAdd, { backgroundColor: manualName.trim() ? theme.text : theme.border }]}
                onPress={addManualContact}
                disabled={!manualName.trim()}
              >
                <Text style={{ color: "#fff", fontFamily: font.bold, fontSize: 14 }}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowManualInput(false); setManualName(""); }} hitSlop={8}>
                <Ionicons name="close" size={20} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.pickerNewContact, { borderBottomColor: theme.borderLight }]}
              onPress={() => { sfx.pop(); setShowManualInput(true); }}
              activeOpacity={0.7}
            >
              <View style={[s.pickerNewContactIcon, { backgroundColor: theme.surfaceSecondary }]}>
                <Ionicons name="person-add-outline" size={18} color={theme.textSecondary} />
              </View>
              <Text style={[s.pickerNewContactText, { color: theme.text }]}>Add a new contact</Text>
            </TouchableOpacity>
          )}

          {/* Friends list */}
          {availableFriends.length > 0 && (
            <Text style={[s.pickerSectionLabel, { color: theme.textTertiary }]}>Friends</Text>
          )}
          <FlatList
            data={filteredFriends}
            keyExtractor={(item) => item.key}
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
            renderItem={renderFriendPickerItem}
            ListEmptyComponent={
              <View style={{ padding: 32, alignItems: "center" }}>
                <Text style={[s.emptySubtext, { color: theme.textQuaternary }]}>
                  {searchQuery ? "No friends match your search" : "No friends to show"}
                </Text>
              </View>
            }
          />

          {/* Next button */}
          <View style={[s.pickerBottomBar, { backgroundColor: theme.surface, borderTopColor: theme.borderLight }]}>
            <TouchableOpacity
              style={[
                s.pickerNextBtn,
                { backgroundColor: selectedFriends.length > 0 ? theme.primary : theme.border },
              ]}
              onPress={addSelectedMembers}
              disabled={selectedFriends.length === 0 || addingMembers}
              activeOpacity={0.8}
            >
              {addingMembers ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.pickerNextBtnText}>
                  {selectedFriends.length > 0
                    ? `Add ${selectedFriends.length} member${selectedFriends.length !== 1 ? "s" : ""}`
                    : "Select people"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal> : null}

      {showRenameGroupModal ? <Modal
        visible={true}
        animationType="fade"
        transparent
        onRequestClose={() => !renamingGroup && setShowRenameGroupModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.renameModalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !renamingGroup && setShowRenameGroupModal(false)} />
          <View style={[s.renameModalCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[s.renameModalTitle, { color: theme.text }]}>Rename group</Text>
            <TextInput
              style={[s.renameModalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
              value={renameGroupDraft}
              onChangeText={setRenameGroupDraft}
              placeholder="Group name"
              placeholderTextColor={theme.textTertiary}
              autoFocus
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={() => void applyGroupRename(renameGroupDraft)}
              editable={!renamingGroup}
            />
            <View style={s.renameModalActions}>
              <TouchableOpacity
                onPress={() => !renamingGroup && setShowRenameGroupModal(false)}
                style={s.renameModalBtn}
                disabled={renamingGroup}
              >
                <Text style={{ color: theme.textSecondary, fontFamily: font.medium, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void applyGroupRename(renameGroupDraft)}
                style={s.renameModalBtn}
                disabled={renamingGroup || !renameGroupDraft.trim()}
              >
                {renamingGroup ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Text style={{ color: theme.primary, fontFamily: font.semibold, fontSize: 16 }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal> : null}

      {handlesMember != null ? <Modal
        visible={true}
        animationType="fade"
        transparent
        onRequestClose={() => !savingHandles && setHandlesMember(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.renameModalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !savingHandles && setHandlesMember(null)} />
          <View style={[s.renameModalCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[s.renameModalTitle, { color: theme.text }]}>Payment handles</Text>
            <Text style={[s.handlesModalSubtitle, { color: theme.textSecondary }]}>
              {handlesMember?.display_name ?? ""}
            </Text>
            <Text style={[s.handlesModalLabel, { color: theme.textTertiary }]}>Venmo</Text>
            <TextInput
              style={[s.renameModalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceSecondary, marginBottom: 10 }]}
              value={handlesVenmo}
              onChangeText={setHandlesVenmo}
              placeholder="@username"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={100}
              editable={!savingHandles}
            />
            <Text style={[s.handlesModalLabel, { color: theme.textTertiary }]}>Cash App</Text>
            <TextInput
              style={[s.renameModalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceSecondary, marginBottom: 10 }]}
              value={handlesCashapp}
              onChangeText={setHandlesCashapp}
              placeholder="$cashtag"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={100}
              editable={!savingHandles}
            />
            <Text style={[s.handlesModalLabel, { color: theme.textTertiary }]}>PayPal</Text>
            <TextInput
              style={[s.renameModalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceSecondary, marginBottom: 8 }]}
              value={handlesPaypal}
              onChangeText={setHandlesPaypal}
              placeholder="username or email"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={100}
              editable={!savingHandles}
            />
            <View style={s.renameModalActions}>
              <TouchableOpacity
                onPress={() => !savingHandles && setHandlesMember(null)}
                style={s.renameModalBtn}
                disabled={savingHandles}
              >
                <Text style={{ color: theme.textSecondary, fontFamily: font.medium, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void saveMemberHandles()}
                style={s.renameModalBtn}
                disabled={savingHandles}
              >
                {savingHandles ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Text style={{ color: theme.primary, fontFamily: font.semibold, fontSize: 16 }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal> : null}

      {/* Group Settings modal */}
      {showSettingsModal ? <Modal
        visible={true}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <SafeAreaView style={[s.pickerRoot, { backgroundColor: theme.surface }]} edges={["top", "bottom"]}>
          <View style={s.pickerTopBar}>
            <TouchableOpacity onPress={() => setShowSettingsModal(false)} hitSlop={10}>
              <Text style={[s.pickerCancel, { color: theme.primary }]}>Done</Text>
            </TouchableOpacity>
            <Text style={[s.pickerTitle, { color: theme.text }]}>Group settings</Text>
            <View style={{ width: 52 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
            {/* Actions */}
            <View style={s.settingsActionRow}>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                onPress={() => { setShowSettingsModal(false); setTimeout(openAddMembers, 300); }}
                activeOpacity={0.75}
              >
                <Ionicons name="person-add-outline" size={16} color={theme.text} />
                <Text style={[s.actionBtnText, { color: theme.text }]}>Add members</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.text, borderColor: theme.text }]}
                onPress={async () => {
                  sfx.pop();
                  const link = `${BASE_URL.replace(/\/$/, "")}/join/${detail.invite_token}`;
                  await Clipboard.setStringAsync(link);
                  toast.show("Link copied");
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="link-outline" size={16} color={theme.surface} />
                <Text style={[s.actionBtnText, { color: theme.surface }]}>Copy link</Text>
              </TouchableOpacity>
            </View>

            {/* Members list */}
            <Text style={[s.section, { color: theme.textTertiary, marginTop: 20 }]}>
              Members · {detail.members.length}
            </Text>
            <View style={[s.card, s.membersCard, { backgroundColor: theme.background, borderColor: theme.borderLight }]}>
              {detail.members.map((m, i) => {
                const isOwnerMember = memberIsGroupOwner(m);
                const isMe = Boolean(userId && m.user_id === userId);
                const showRemove =
                  detail.isOwner && !isDemoOn && !isArchived && !isOwnerMember;
                const showEditHandles = detail.isOwner && !isDemoOn && !isArchived;
                return (
                  <View
                    key={m.id}
                    style={[
                      s.memberRow,
                      i < detail.members.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderLight },
                    ]}
                  >
                    <MemberAvatar name={m.display_name} imageUrl={m.image_url} />
                    <View style={s.memberRowText}>
                      <Text style={[s.memberRowName, { color: theme.text }]} numberOfLines={1}>
                        {m.display_name}
                        {isMe ? " (you)" : ""}
                        {isOwnerMember ? " · Owner" : ""}
                      </Text>
                      {(m.venmo_username || m.cashapp_cashtag || m.paypal_username) ? (
                        <Text style={[s.memberRowHandles, { color: theme.textQuaternary }]} numberOfLines={2}>
                          {[m.venmo_username ? `Venmo @${m.venmo_username}` : null, m.cashapp_cashtag ? `Cash ${m.cashapp_cashtag.startsWith("$") ? m.cashapp_cashtag : `$${m.cashapp_cashtag}`}` : null, m.paypal_username ? `PayPal ${m.paypal_username}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                    <View style={s.memberRowActions}>
                      {showEditHandles ? (
                        <TouchableOpacity
                          onPress={() => { setShowSettingsModal(false); setTimeout(() => openEditHandles(m), 300); }}
                          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                          accessibilityLabel={`Edit payment handles for ${m.display_name}`}
                        >
                          <Ionicons name="wallet-outline" size={20} color={theme.textTertiary} />
                        </TouchableOpacity>
                      ) : null}
                      {showRemove ? (
                        removingMemberId === m.id ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : (
                          <TouchableOpacity
                            onPress={() => {
                              sfx.pop();
                              setShowSettingsModal(false);
                              setTimeout(() => confirmRemoveMember(m), 300);
                            }}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            accessibilityLabel={`Remove ${m.display_name}`}
                          >
                            <Ionicons name="close-circle" size={22} color={theme.textQuaternary} />
                          </TouchableOpacity>
                        )
                      ) : !showEditHandles ? (
                        <View style={{ width: 22 }} />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Rename / Archive / Leave */}
            {detail.isOwner && !isDemoOn && !isArchived ? (
              <View style={{ marginTop: 24, gap: 8 }}>
                <TouchableOpacity
                  style={[s.settingsRowBtn, { backgroundColor: theme.background, borderColor: theme.borderLight }]}
                  onPress={() => { setShowSettingsModal(false); setTimeout(openRenameGroup, 300); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pencil-outline" size={18} color={theme.text} />
                  <Text style={[s.settingsRowBtnText, { color: theme.text }]}>Rename group</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.settingsRowBtn, { backgroundColor: theme.background, borderColor: theme.borderLight }]}
                  onPress={() => {
                    setShowSettingsModal(false);
                    setTimeout(() => {
                      Alert.alert(
                        "Archive this group?",
                        "It will disappear from your main list.",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Archive", style: "destructive", onPress: () => void patchArchive(true) },
                        ]
                      );
                    }, 300);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="archive-outline" size={18} color={theme.negative} />
                  <Text style={[s.settingsRowBtnText, { color: theme.negative }]}>Archive group</Text>
                </TouchableOpacity>
              </View>
            ) : !isDemoOn && !isArchived ? (
              <View style={{ marginTop: 24 }}>
                <TouchableOpacity
                  style={[s.settingsRowBtn, { backgroundColor: theme.background, borderColor: theme.borderLight }]}
                  onPress={() => { setShowSettingsModal(false); setTimeout(leaveGroup, 300); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="exit-outline" size={18} color={theme.negative} />
                  <Text style={[s.settingsRowBtnText, { color: theme.negative }]}>Leave group</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal> : null}

      {confirmPaymentOpen ? <Modal visible={true} transparent animationType="fade" onRequestClose={() => setConfirmPaymentOpen(false)}>
        <Pressable style={s.confirmOverlay} onPress={() => setConfirmPaymentOpen(false)}>
          <Pressable style={[s.confirmCard, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
            <View style={{ marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={44} color={theme.positive} />
            </View>
            <Text style={[s.confirmTitle, { color: theme.text }]}>Payment sent?</Text>
            <Text style={[s.confirmSub, { color: theme.textSecondary }]}>
              If you completed the payment, mark it as settled.
            </Text>
            <TouchableOpacity
              style={[s.confirmBtn, { backgroundColor: theme.positive }]}
              onPress={handleConfirmGroupP2P}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={s.confirmBtnText}>Mark as paid</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 10 }} onPress={() => { setConfirmPaymentOpen(false); setPendingP2PSuggestion(null); }}>
              <Text style={[s.confirmDismissText, { color: theme.textTertiary }]}>Not yet</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  settingsBtn: { padding: 4 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { fontSize: 16, fontFamily: font.medium },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 100 },
  groupHeader: { alignItems: "center", marginBottom: 24, paddingTop: 8 },
  groupPhoto: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  groupIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  groupNameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  groupName: { fontSize: 24, fontWeight: "800", fontFamily: font.bold, color: colors.text, textAlign: "center" },
  membersToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 4 },
  membersCard: { marginBottom: 4 },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  memberRowText: { flex: 1, minWidth: 0 },
  memberRowName: { fontSize: 15, fontFamily: font.medium },
  memberRowHandles: { fontSize: 11, fontFamily: font.regular, marginTop: 3 },
  memberRowActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  handlesModalSubtitle: { fontSize: 14, fontFamily: font.medium, marginBottom: 14, marginTop: -6 },
  handlesModalLabel: { fontSize: 11, fontFamily: font.bold, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  renameModalOverlay: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.45)" },
  renameModalCard: { borderRadius: radii.lg, borderWidth: 1, padding: 20, ...shadow.md },
  renameModalTitle: { fontSize: 17, fontFamily: font.bold, marginBottom: 12 },
  renameModalInput: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: font.regular,
    marginBottom: 16,
  },
  renameModalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 20 },
  renameModalBtn: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 72, alignItems: "center" },
  groupMeta: { fontSize: 13, fontFamily: font.regular, color: colors.textTertiary, marginTop: 4, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  actionBtnText: { fontSize: 13, fontFamily: font.bold },
  // Multi-select picker styles
  pickerRoot: { flex: 1 },
  pickerTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  pickerCancel: { fontSize: 16, fontFamily: font.regular },
  pickerTitle: { fontSize: 16, fontFamily: font.bold },
  pickerSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  pickerSearchInput: { flex: 1, fontSize: 15, fontFamily: font.regular, paddingVertical: 10 },
  pickerChipsSection: { marginBottom: 8 },
  pickerChipsLabel: { fontSize: 13, fontFamily: font.bold, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 16, marginBottom: 8 },
  pickerChipsScroll: { paddingBottom: 4 },
  pickerChip: { alignItems: "center", width: 56 },
  pickerChipAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  pickerChipAvatarText: { color: "#fff", fontSize: 18, fontFamily: font.bold },
  pickerChipRemove: { position: "absolute", top: 0, right: 2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  pickerChipName: { fontSize: 11, fontFamily: font.medium, marginTop: 4, textAlign: "center" },
  pickerDivider: { height: 1, marginVertical: 4 },
  pickerNewContact: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1 },
  pickerNewContactIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  pickerNewContactText: { fontSize: 15, fontFamily: font.medium },
  pickerManualRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1 },
  pickerManualInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, fontFamily: font.regular },
  pickerManualAdd: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  pickerSectionLabel: { fontSize: 13, fontFamily: font.bold, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  pickerFriendRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  pickerFriendAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  pickerFriendAvatarText: { fontSize: 14, fontFamily: font.bold },
  pickerFriendName: { flex: 1, fontSize: 16, fontFamily: font.medium },
  pickerCheckbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  pickerBottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, borderTopWidth: 1 },
  pickerNextBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  pickerNextBtnText: { color: "#fff", fontSize: 16, fontFamily: font.bold },
  groupIconBadge: { position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#fff" },
  section: { fontSize: 13, fontWeight: "700", fontFamily: font.bold, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: "hidden", ...shadow.md },
  txRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  txThumb: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#F7F3F0", marginRight: 12 },
  txInfo: { flex: 1 },
  txMerchant: { fontSize: 15, fontWeight: "600", fontFamily: font.semibold, color: colors.text },
  txMeta: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "600", fontFamily: font.semibold, color: colors.text },
  empty: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 32, alignItems: "center", ...shadow.md },
  emptyIcon: { width: 52, height: 52, borderRadius: radii.lg, backgroundColor: colors.borderLight, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "600", fontFamily: font.semibold, color: colors.textSecondary },
  emptySubtext: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  suggRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14, marginBottom: 8, gap: 12, ...shadow.sm },
  suggPeople: { flexDirection: "row", alignItems: "center", gap: 6 },
  suggInfo: { flex: 1 },
  suggText: { fontSize: 14, fontFamily: font.regular, color: colors.textSecondary },
  suggAmount: { fontSize: 15, fontWeight: "700", fontFamily: font.bold, marginTop: 2 },
  suggActions: { flexDirection: "row", gap: 6 },
  miniBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radii.sm },
  miniBtnText: { color: "#fff", fontWeight: "600", fontFamily: font.semibold, fontSize: 13 },
  miniBtnSecondaryText: { color: colors.textSecondary, fontWeight: "500", fontFamily: font.medium, fontSize: 13 },
  settledBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primaryLight, padding: 14, borderRadius: radii.md },
  settledBadgeText: { fontSize: 14, color: colors.primaryDark, fontWeight: "600", fontFamily: font.semibold },
  archivedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  archivedBannerText: { flex: 1, fontSize: 13, fontFamily: font.regular },
  archivedRestore: { fontSize: 14, fontFamily: font.semibold },
  archiveLink: { fontSize: 14, fontFamily: font.medium, textAlign: "center" },
  settingsActionRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  settingsRowBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radii.lg, borderWidth: 1 },
  settingsRowBtnText: { fontSize: 15, fontFamily: font.medium },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  confirmCard: { borderRadius: 24, marginHorizontal: 32, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 24, alignItems: "center", alignSelf: "center" },
  confirmTitle: { fontFamily: font.black, fontSize: 20, marginBottom: 6, textAlign: "center" },
  confirmSub: { fontFamily: font.regular, fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 24, borderRadius: radii.md, width: "100%", marginBottom: 10 },
  confirmBtnText: { fontFamily: font.bold, fontSize: 15, color: "#fff" },
  confirmDismissText: { fontFamily: font.semibold, fontSize: 15 },
  bold: { fontWeight: "700", fontFamily: font.bold },
  avatar: { justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontFamily: font.bold },
  swipeActions: { flexDirection: "row" },
  swipeEdit: {
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
  },
  swipeDelete: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
  },
  swipeActionText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: font.semibold,
    marginTop: 4,
  },
});
