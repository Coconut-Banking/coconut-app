import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
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
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import * as ImagePicker from "expo-image-picker";
import { useApiFetch } from "../../../lib/api";
import { useGroupDetail, useGroupsSummary, type FriendBalance } from "../../../hooks/useGroups";
import { useDemoMode } from "../../../lib/demo-mode-context";
import { useDemoData } from "../../../lib/demo-context";
import { useTheme } from "../../../lib/theme-context";
import { colors, font, fontSize, shadow, radii, space } from "../../../lib/theme";
import { formatSplitCurrencyAmount } from "../../../lib/format-split-money";
import { MerchantLogo } from "../../../components/merchant/MerchantLogo";
import { MemberAvatar } from "../../../components/MemberAvatar";
import { setExpensePrefillTarget } from "../../../lib/add-expense-prefill";
import { simplifyDebtsByCurrency } from "../../../lib/simplify-debts";
import * as Clipboard from "expo-clipboard";
import { useToast } from "../../../components/Toast";
import { sfx } from "../../../lib/sounds";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/heic"];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
const MEMBER_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"];

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function GroupScreen() {
  const { theme } = useTheme();
  const { id, localImage } = useLocalSearchParams<{ id: string; localImage?: string }>();
  const { userId } = useAuth();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const { detail: realDetail, loading, refetch } = useGroupDetail(isDemoOn ? null : (id ?? null));
  const { refetch: refetchSummary } = useGroupsSummary({ contacts: true });
  const detail = isDemoOn && id ? demo.groupDetails[id] ?? null : realDetail;
  const toast = useToast();

  const [requestingPayment, setRequestingPayment] = useState(false);
  const [recordingSettlement, setRecordingSettlement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const swipeableRefs = useRef(new Map<string, Swipeable>()).current;
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [localIconUrl, setLocalIconUrl] = useState<string | null>(null);

  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<FriendBalance[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [addingMembers, setAddingMembers] = useState(false);
  const [manualName, setManualName] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

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

  const toggleFriend = (friend: FriendBalance) => {
    sfx.pop();
    setSelectedFriends((prev) => {
      const exists = prev.some((f) => f.key === friend.key);
      return exists ? prev.filter((f) => f.key !== friend.key) : [...prev, friend];
    });
  };

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

    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append("image", { uri: asset.uri, name: `icon.${mimeType === "image/png" ? "png" : "jpg"}`, type: mimeType } as unknown as Blob);
      if (__DEV__) console.log(`[group-icon] uploading to /api/groups/${id}/icon, mimeType:`, mimeType, "uri:", asset.uri.slice(0, 80));
      const res = await apiFetch(`/api/groups/${id}/icon`, { method: "POST", body: formData });
      if (__DEV__) console.log("[group-icon] response status:", res.status);
      if (res.ok) {
        const data = await res.json();
        if (__DEV__) console.log("[group-icon] success, imageUrl:", data.imageUrl);
        setLocalIconUrl(data.imageUrl);
        toast.show("Group icon updated");
        refetch(true);
        DeviceEventEmitter.emit("groups-updated");
      } else {
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
              if (res.ok) { setLocalIconUrl(null); toast.show("Group icon removed"); refetch(true); DeviceEventEmitter.emit("groups-updated"); }
            } finally { setUploadingIcon(false); }
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
            if (res.ok) { setLocalIconUrl(null); toast.show("Group icon removed"); refetch(true); DeviceEventEmitter.emit("groups-updated"); }
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
    if (archived) router.back();
  };

  if (!detail) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backRow} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={theme.primary} />
            <Text style={[s.backText, { color: theme.primary }]}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const hasActivity = (detail.activity?.length ?? 0) > 0;
  const allSettled = (detail.balances?.filter((b) => Math.abs(b.total) >= 0.005).length ?? 0) === 0;
  const isArchived = Boolean(detail.archivedAt);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backRow} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={theme.primary} />
          <Text style={[s.backText, { color: theme.primary }]}>Back</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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

          {!isArchived ? (
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
                onPress={openAddMembers}
                activeOpacity={0.75}
              >
                <Ionicons name="person-add-outline" size={16} color={theme.text} />
                <Text style={[s.actionBtnText, { color: theme.text }]}>Add members</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.text, borderColor: theme.text }]}
                onPress={async () => {
                  sfx.pop();
                  const link = `https://coconut-app.dev/join/${detail.invite_token}`;
                  await Clipboard.setStringAsync(link);
                  toast.show("Link copied");
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="link-outline" size={16} color={theme.surface} />
                <Text style={[s.actionBtnText, { color: theme.surface }]}>Copy link</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

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

        {(() => {
          const simplified = simplifyDebtsByCurrency(detail.balances ?? []);
          const myMemberId = detail.members.find((m) => m.user_id === userId)?.id;
          const mySuggestions = simplified.filter(
            (su) => myMemberId && (su.from === myMemberId || su.to === myMemberId)
          );
          const otherSuggestions = simplified.filter(
            (su) => !myMemberId || (su.from !== myMemberId && su.to !== myMemberId)
          );
          const allSuggestions = [...mySuggestions, ...otherSuggestions];

          if (allSuggestions.length === 0 && hasActivity && allSettled) {
            return (
              <View style={[s.settledBadge, { marginBottom: 16, backgroundColor: theme.primaryLight }]}>
                <Ionicons name="checkmark-circle" size={20} color={theme.primaryDark} />
                <Text style={[s.settledBadgeText, { color: theme.primaryDark }]}>All settled up</Text>
              </View>
            );
          }

          if (allSuggestions.length === 0) return null;

          return (
          <>
            <Text style={[s.section, { color: theme.textTertiary }]}>Settle up</Text>
            {allSuggestions.map((su) => {
              const fromMember = detail.members.find((m) => m.id === su.from);
              const toMember = detail.members.find((m) => m.id === su.to);
              const fromName = fromMember?.display_name ?? "?";
              const toName = toMember?.display_name ?? "?";
              const theyPayMe = myMemberId && su.to === myMemberId;
              const iPayThem = myMemberId && su.from === myMemberId;
              const canMarkPaid =
                Boolean(theyPayMe || iPayThem || (detail.isOwner && !isDemoOn));
              return (
                <View
                  key={`${su.currency}-${su.from}-${su.to}`}
                  style={[s.suggRow, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
                >
                  <View style={s.suggPeople}>
                    <MemberAvatar name={fromName} imageUrl={fromMember?.image_url} />
                    <Ionicons name="arrow-forward" size={14} color={theme.textQuaternary} />
                    <MemberAvatar name={toName} imageUrl={toMember?.image_url} />
                  </View>
                  <View style={s.suggInfo}>
                    <Text style={[s.suggText, { color: theme.textSecondary }]}>
                      <Text style={s.bold}>{fromName}</Text> pays <Text style={s.bold}>{toName}</Text>
                    </Text>
                    <Text style={[s.suggAmount, { color: theyPayMe ? theme.positive : theme.negative }]}>
                      {formatSplitCurrencyAmount(su.amount, su.currency)}
                    </Text>
                  </View>
                  <View style={s.suggActions}>
                    {theyPayMe && (
                      <TouchableOpacity
                        style={[s.miniBtn, { backgroundColor: theme.primary }]}
                        onPress={async () => {
                          if (isDemoOn) { Alert.alert("Sent", `Payment request for $${su.amount.toFixed(2)} sent!`); return; }
                          setRequestingPayment(true);
                          try {
                            const res = await apiFetch("/api/stripe/create-payment-link", {
                              method: "POST",
                              body: { amount: su.amount, description: detail.name, recipientName: fromName, groupId: id, payerMemberId: su.from, receiverMemberId: su.to },
                            });
                            const data = await res.json();
                            if (res.ok && data.url) {
                              await Share.share({ message: `You owe me $${su.amount.toFixed(2)} for ${detail.name}. Pay here: ${data.url}`, url: data.url, title: "Payment request" });
                            }
                          } finally { setRequestingPayment(false); }
                        }}
                        disabled={requestingPayment}
                        activeOpacity={0.7}
                      >
                        <Text style={s.miniBtnText}>Request</Text>
                      </TouchableOpacity>
                    )}
                    {canMarkPaid && (
                      <TouchableOpacity
                        style={[s.miniBtn, { borderWidth: 1, borderColor: theme.border }]}
                        onPress={() => {
                          if (isDemoOn && id) { demo.settleGroupSuggestion(id, su.from, su.to); return; }
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
                                      payerMemberId: su.from,
                                      receiverMemberId: su.to,
                                      amount: su.amount,
                                      method: "manual",
                                      currency: su.currency,
                                    },
                                  });
                                  if (res.ok) { refetch(); refetchSummary(); DeviceEventEmitter.emit("groups-updated"); }
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
          );
        })()}

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

        {!isDemoOn && detail.isOwner && !isArchived ? (
          <TouchableOpacity
            style={{ marginTop: 28, paddingVertical: 12 }}
            onPress={() =>
              Alert.alert(
                "Archive this group?",
                "It will disappear from your main list. Open People & groups → Show archived groups to restore it.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Archive", style: "destructive", onPress: () => void patchArchive(true) },
                ]
              )
            }
            activeOpacity={0.7}
          >
            <Text style={[s.archiveLink, { color: theme.textQuaternary }]}>Archive group</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Add members — full-screen multi-select picker */}
      <Modal
        visible={showAddMember}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddMember(false)}
      >
        <SafeAreaView style={[s.pickerRoot, { backgroundColor: theme.surface }]} edges={["top", "bottom"]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
            renderItem={({ item }) => {
              const isSelected = selectedFriends.some((f) => f.key === item.key);
              const avatarColor = MEMBER_COLORS[item.displayName.charCodeAt(0) % MEMBER_COLORS.length];
              return (
                <TouchableOpacity
                  style={s.pickerFriendRow}
                  onPress={() => toggleFriend(item)}
                  activeOpacity={0.7}
                >
                  <View style={[s.pickerFriendAvatar, { backgroundColor: `${avatarColor}20`, borderColor: `${avatarColor}40` }]}>
                    <Text style={[s.pickerFriendAvatarText, { color: avatarColor }]}>
                      {item.displayName.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
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
            }}
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
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: {
    paddingHorizontal: 8,
    paddingTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 8 },
  backText: { fontSize: 15, fontFamily: font.semibold },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 100 },
  groupHeader: { alignItems: "center", marginBottom: 24, paddingTop: 0 },
  groupPhoto: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  groupIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  groupName: { fontSize: 24, fontWeight: "800", fontFamily: font.bold, color: colors.text, textAlign: "center" },
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
