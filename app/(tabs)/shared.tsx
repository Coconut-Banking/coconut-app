import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { useApiFetch } from "../../lib/api";
import {
  useGroupsSummary,
  useGroupDetail,
  usePersonDetail,
  useRecentActivity,
} from "../../hooks/useGroups";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "";

function MemberAvatar({ name }: { name: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: "#3D8E62" }]}>
      <Text style={styles.avatarText}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const MEMBER_COLORS = ["#3D8E62", "#4A6CF7", "#E8507A", "#F59E0B", "#10A37F"];

export default function SharedScreen() {
  const { userId } = useAuth();
  const apiFetch = useApiFetch();
  const { summary, loading, refetch } = useGroupsSummary();
  const { activity, refetch: refetchActivity } = useRecentActivity(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { detail: groupDetail, loading: groupLoading, refetch: refetchGroup } =
    useGroupDetail(selectedGroupId);
  const { detail: personDetail, loading: personLoading, refetch: refetchPerson } =
    usePersonDetail(selectedPersonKey);
  const [plaidLinked, setPlaidLinked] = useState<boolean | null>(null);
  const [requestingPayment, setRequestingPayment] = useState(false);
  const [recordingSettlement, setRecordingSettlement] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        refetchActivity(),
        selectedGroupId ? refetchGroup(true) : Promise.resolve(),
        selectedPersonKey ? refetchPerson(true) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refetchActivity, refetchGroup, refetchPerson, selectedGroupId, selectedPersonKey]);

  useEffect(() => {
    apiFetch("/api/plaid/status")
      .then((r) => {
        if (r.status === 425) return;
        if (!r.ok) { setPlaidLinked(false); return; }
        return r.json().then((d) => setPlaidLinked(d.linked === true));
      })
      .catch(() => setPlaidLinked(false));
  }, [apiFetch]);

  const showOverview = !selectedGroupId && !selectedPersonKey;

  if (plaidLinked === false && !summary?.groups?.length) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.screenPadding}>
          <Text style={styles.title}>Shared expenses</Text>
          <View style={styles.connectCard}>
          <Ionicons name="wallet-outline" size={40} color="#9CA3AF" />
          <Text style={styles.connectTitle}>Connect your bank</Text>
          <Text style={styles.connectSubtitle}>
            Create groups and split transactions. Open the web app to connect.
          </Text>
          {API_URL ? (
            <TouchableOpacity
              style={styles.connectButton}
              onPress={() => Linking.openURL(`${API_URL.replace(/\/$/, "")}/connect-from-app`)}
            >
              <Text style={styles.connectButtonText}>Open web app</Text>
            </TouchableOpacity>
          ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && showOverview) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={["top"]}>
        <ActivityIndicator size="large" color="#3D8E62" />
      </SafeAreaView>
    );
  }

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    setCreateError(null);
    setCreating(true);
    try {
      const res = await apiFetch("/api/groups", {
        method: "POST",
        body: { name: newGroupName.trim(), ownerDisplayName: "You" } as object,
      });
      const data = await res.json();
      if (res.ok) {
        refetch();
        refetchActivity();
        setNewGroupName("");
        setShowCreate(false);
        setSelectedGroupId(data.id);
      } else {
        const msg = res.status === 401
          ? "Session expired. Sign out and sign back in, then try again."
          : (data.error ?? "Failed to create group");
        setCreateError(msg);
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setCreating(false);
    }
  };

  const goBack = () => {
    setSelectedGroupId(null);
    setSelectedPersonKey(null);
    refetch();
  };

  const requestPayment = async () => {
    if (!personDetail || personDetail.balance <= 0) return;
    setRequestingPayment(true);
    try {
      const s = (personDetail.settlements ?? [])[0];
      const res = await apiFetch("/api/stripe/create-payment-link", {
        method: "POST",
        body: {
          amount: personDetail.balance,
          description: "expenses",
          recipientName: personDetail.displayName,
          groupId: s?.groupId,
          payerMemberId: s?.fromMemberId,
          receiverMemberId: s?.toMemberId,
        },
      });
      const data = await res.json();
      if (res.ok && data.url) {
        await Share.share({
          message: `You owe me $${personDetail.balance.toFixed(2)}. Pay here: ${data.url}`,
          url: data.url,
          title: "Payment request",
        });
      } else {
        Alert.alert("Error", (data as { error?: string })?.error ?? "Could not create payment link");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Request failed");
    } finally {
      setRequestingPayment(false);
    }
  };

  const recordSettlement = async () => {
    if (!personDetail || (personDetail.settlements ?? []).length === 0) return;
    Alert.alert(
      "Mark as paid",
      `Mark $${Math.abs(personDetail.balance).toFixed(2)} as paid?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark paid",
          onPress: async () => {
            setRecordingSettlement(true);
            try {
              for (const s of personDetail?.settlements ?? []) {
                await apiFetch("/api/settlements", {
                  method: "POST",
                  body: {
                    groupId: s.groupId,
                    payerMemberId: s.fromMemberId,
                    receiverMemberId: s.toMemberId,
                    amount: s.amount,
                    method: "manual",
                  },
                });
              }
              refetch();
              refetchPerson();
              goBack();
            } catch {
              Alert.alert("Error", "Could not record settlement");
            } finally {
              setRecordingSettlement(false);
            }
          },
        },
      ]
    );
  };

  const settleWithTapToPay = () => {
    if (!personDetail || personDetail.balance <= 0) return;
    const s = (personDetail.settlements ?? [])[0];
    if (!s) return;
    router.push({
      pathname: "/(tabs)/pay",
      params: {
        amount: personDetail.balance.toFixed(2),
        groupId: s.groupId,
        payerMemberId: s.fromMemberId,
        receiverMemberId: s.toMemberId,
      },
    });
  };

  if (selectedPersonKey && personDetail) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3D8E62" />
        }
      >
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color="#6B7280" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.header}>
          <MemberAvatar name={personDetail.displayName} />
          <View>
            <Text style={styles.personName}>{personDetail.displayName}</Text>
            <Text style={styles.balance}>
              {personDetail.balance > 0
                ? `They owe you $${personDetail.balance.toFixed(2)}`
                : personDetail.balance < 0
                  ? `You owe $${Math.abs(personDetail.balance).toFixed(2)}`
                  : "All settled up"}
            </Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Transactions</Text>
        {personDetail.activity.length === 0 ? (
          <Text style={styles.empty}>No shared transactions yet.</Text>
        ) : (
          personDetail.activity.map((a) => (
            <View key={a.id} style={styles.txRow}>
              <Text style={styles.txMerchant}>{a.merchant}</Text>
              <Text style={styles.txMeta}>
                ${a.amount.toFixed(2)} · {a.groupName}
              </Text>
            </View>
          ))
        )}
        {personDetail.balance === 0 && personDetail.activity.length > 0 && (
          <View style={styles.settledBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#2D7A52" />
            <Text style={styles.settledText}>
              All settled up with {personDetail.displayName}
            </Text>
          </View>
        )}
        {personDetail.balance !== 0 && (
          <View style={styles.settleActions}>
            {personDetail.balance > 0 && (
              <>
                <TouchableOpacity
                  style={[styles.settleButton, styles.settleButtonPrimary]}
                  onPress={requestPayment}
                  disabled={requestingPayment}
                >
                  {requestingPayment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.settleButtonPrimaryText}>Request</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.settleButton, styles.settleTapToPay]}
                  onPress={settleWithTapToPay}
                >
                  <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                  <Text style={styles.settleButtonPrimaryText}>Tap to Pay</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={[styles.settleButton, styles.settleButtonSecondary]}
              onPress={recordSettlement}
              disabled={recordingSettlement}
            >
              {recordingSettlement ? (
                <ActivityIndicator size="small" color="#374151" />
              ) : (
                <Text style={styles.settleButtonSecondaryText}>Mark paid</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      </SafeAreaView>
    );
  }

  if (selectedGroupId && groupDetail) {
    const hasActivity = (groupDetail.activity?.length ?? 0) > 0;
    const allSettled = (groupDetail.balances?.filter((b) => b.total !== 0).length ?? 0) === 0;
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3D8E62" />
          }
        >
          <View style={styles.screenPadding}>
            <TouchableOpacity onPress={goBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="#6B7280" />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <View style={styles.header}>
              <Text style={styles.groupName}>{groupDetail.name}</Text>
              <Text style={styles.groupMeta}>
                {groupDetail.members.length} members · $
                {groupDetail.totalSpend?.toFixed(2) ?? "0.00"} total
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Transactions</Text>
            {!hasActivity ? (
              <View style={styles.groupDetailEmpty}>
                <View style={styles.groupDetailEmptyIcon}>
                  <Ionicons name="receipt-outline" size={28} color="#9CA3AF" />
                </View>
                <Text style={styles.groupDetailEmptyTitle}>No shared transactions yet</Text>
                <Text style={styles.groupDetailEmptySubtext}>
                  Add an expense from the web app or split a receipt to start tracking.
                </Text>
                {API_URL ? (
                  <TouchableOpacity
                    style={styles.groupDetailEmptyButton}
                    onPress={() => Linking.openURL(`${API_URL.replace(/\/$/, "")}/app/shared`)}
                  >
                    <Text style={styles.groupDetailEmptyButtonText}>Open web app</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              (groupDetail.activity ?? []).map((a) => (
                <View key={a.id} style={styles.txRow}>
                  <Text style={styles.txMerchant}>{a.merchant}</Text>
                  <Text style={styles.txMeta}>
                    ${a.amount.toFixed(2)} split {a.splitCount} ways
                  </Text>
                </View>
              ))
            )}
            {groupDetail.suggestions && groupDetail.suggestions.length > 0 && (
              <View style={styles.settleSection}>
                <Text style={styles.sectionTitle}>Settle</Text>
                {groupDetail.suggestions.map((s) => {
                  const fromName = groupDetail.members.find((m) => m.id === s.fromMemberId)?.display_name ?? "?";
                  const toName = groupDetail.members.find((m) => m.id === s.toMemberId)?.display_name ?? "?";
                  const myMemberId = groupDetail.members.find((m) => m.user_id === userId)?.id;
                  const theyPayMe = myMemberId && s.toMemberId === myMemberId;
                  const iPayThem = myMemberId && s.fromMemberId === myMemberId;
                  return (
                    <View key={`${s.fromMemberId}-${s.toMemberId}`} style={styles.suggestionRow}>
                      <Text style={styles.suggestionText}>
                        <Text style={styles.suggestionBold}>{fromName}</Text> →{" "}
                        <Text style={styles.suggestionBold}>{toName}</Text>{" "}
                        <Text style={styles.suggestionAmount}>${s.amount.toFixed(2)}</Text>
                      </Text>
                      <View style={styles.suggestionActions}>
                        {theyPayMe && (
                          <>
                            <TouchableOpacity
                              style={[styles.settleButtonSmall, styles.settleButtonPrimary]}
                              onPress={async () => {
                                setRequestingPayment(true);
                                try {
                                  const res = await apiFetch("/api/stripe/create-payment-link", {
                                    method: "POST",
                                    body: {
                                      amount: s.amount,
                                      description: groupDetail.name,
                                      recipientName: fromName,
                                      groupId: selectedGroupId,
                                      payerMemberId: s.fromMemberId,
                                      receiverMemberId: s.toMemberId,
                                    },
                                  });
                                  const data = await res.json();
                                  if (res.ok && data.url) {
                                    await Share.share({
                                      message: `You owe me $${s.amount.toFixed(2)} for ${groupDetail.name}. Pay here: ${data.url}`,
                                      url: data.url,
                                      title: "Payment request",
                                    });
                                  } else {
                                    Alert.alert("Error", (data as { error?: string })?.error ?? "Could not create link");
                                  }
                                } finally {
                                  setRequestingPayment(false);
                                }
                              }}
                              disabled={requestingPayment}
                            >
                              <Text style={styles.settleButtonPrimaryText}>Request</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.settleButtonSmall, styles.settleTapToPay]}
                              onPress={() =>
                                router.push({
                                  pathname: "/(tabs)/pay",
                                  params: {
                                    amount: s.amount.toFixed(2),
                                    groupId: selectedGroupId!,
                                    payerMemberId: s.fromMemberId,
                                    receiverMemberId: s.toMemberId,
                                  },
                                })
                              }
                            >
                              <Ionicons name="phone-portrait-outline" size={14} color="#fff" />
                              <Text style={styles.settleButtonPrimaryText}>Tap</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        {(theyPayMe || iPayThem) && (
                          <TouchableOpacity
                            style={[styles.settleButtonSmall, styles.settleButtonSecondary]}
                            onPress={async () => {
                              Alert.alert(
                                "Mark as paid",
                                `Mark $${s.amount.toFixed(2)} as paid?`,
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
                                            groupId: selectedGroupId,
                                            payerMemberId: s.fromMemberId,
                                            receiverMemberId: s.toMemberId,
                                            amount: s.amount,
                                            method: "manual",
                                          },
                                        });
                                        if (res.ok) {
                                          refetchGroup();
                                          refetch();
                                        } else {
                                          const data = await res.json();
                                          Alert.alert("Error", (data as { error?: string })?.error ?? "Could not record");
                                        }
                                      } finally {
                                        setRecordingSettlement(false);
                                      }
                                    },
                                  },
                                ]
                              );
                            }}
                            disabled={recordingSettlement}
                          >
                            <Text style={styles.settleButtonSecondaryText}>Mark paid</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {hasActivity && allSettled && (
              <View style={styles.settledBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#2D7A52" />
                <Text style={styles.settledText}>All settled up.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3D8E62" />
        }
      >
        <View style={styles.screenPadding}>
        <View style={[styles.row, { marginBottom: 8 }]}>
          <View>
            <Text style={styles.title}>Shared</Text>
            <Text style={styles.subtitle}>Expenses with friends and groups</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={styles.createButton} onPress={() => setShowCreate(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.createButtonText}>Create group</Text>
            </TouchableOpacity>
          </View>
        </View>

        {showCreate && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.createCard}
        >
          <Text style={styles.createCardTitle}>New group</Text>
          <TextInput
            style={styles.createInput}
            value={newGroupName}
            onChangeText={(t) => {
              setNewGroupName(t);
              setCreateError(null);
            }}
            placeholder="Group name"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
          />
          <View style={styles.createActions}>
            <TouchableOpacity
              style={[styles.createBtn, styles.createBtnPrimary]}
              onPress={createGroup}
              disabled={!newGroupName.trim() || creating}
            >
              <Text style={styles.createBtnPrimaryText}>{creating ? "Creating…" : "Create"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createBtn, styles.createBtnSecondary]}
              onPress={() => {
                setShowCreate(false);
                setNewGroupName("");
                setCreateError(null);
              }}
              disabled={creating}
            >
              <Text style={styles.createBtnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {createError ? <Text style={styles.createError}>{createError}</Text> : null}
        </KeyboardAvoidingView>
        )}
        {summary && (
          <View style={[
            styles.balanceCard,
            { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" },
            (summary.netBalance ?? 0) > 0 && { backgroundColor: "#F0F9F4", borderColor: "#C3E0D3" },
            (summary.netBalance ?? 0) < 0 && { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
          ]}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text style={styles.balanceLabel}>Overall</Text>
              <Text style={styles.balanceText}>
                {(summary.netBalance ?? 0) > 0 ? (
                  <>
                    You are owed <Text style={[styles.bold, { color: "#3D8E62", fontSize: 18 }]}>${(summary.netBalance ?? 0).toFixed(2)}</Text>
                  </>
                ) : (summary.netBalance ?? 0) < 0 ? (
                  <>
                    You owe <Text style={[styles.bold, { color: "#DC2626", fontSize: 18 }]}>${Math.abs(summary.netBalance ?? 0).toFixed(2)}</Text>
                  </>
                ) : (
                  <Text style={styles.allSettled}>All settled up</Text>
                )}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 24 }}>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.balanceSmallLabel}>Owed to you</Text>
                <Text style={[styles.bold, { color: "#3D8E62" }]}>${(summary.totalOwedToMe ?? 0).toFixed(2)}</Text>
              </View>
              <View style={{ width: 1, height: 32, backgroundColor: "#E5E7EB" }} />
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.balanceSmallLabel}>You owe</Text>
                <Text style={[styles.bold, { color: "#DC2626" }]}>${(summary.totalIOwe ?? 0).toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>People</Text>
        {!summary?.friends?.length ? (
          <View style={styles.peopleEmpty}>
            <View style={styles.peopleEmptyIcon}>
              <Ionicons name="person-add-outline" size={24} color="#9CA3AF" />
            </View>
            <Text style={styles.peopleEmptyTitle}>No friends added yet</Text>
            <Text style={styles.peopleEmptySubtext}>
              Create a group and add members to start splitting bills.
            </Text>
          </View>
        ) : (
          summary.friends.map((f, i) => (
            <TouchableOpacity
              key={f.key}
              style={styles.personRow}
              onPress={() => setSelectedPersonKey(f.key)}
            >
              <View style={[styles.avatar, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length], marginRight: 12 }]}>
                <Text style={styles.avatarText}>{f.displayName.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{f.displayName}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {f.balance !== 0 && (
                  <Text style={[styles.groupBalanceLabel, { marginBottom: 2 }]}>
                    {f.balance > 0 ? "owes you" : "you owe"}
                  </Text>
                )}
                <Text
                  style={[
                    styles.personBalance,
                    f.balance > 0 && styles.balanceGreen,
                    f.balance < 0 && styles.balanceAmber,
                  ]}
                >
                  {f.balance > 0 ? `$${f.balance.toFixed(2)}` : f.balance < 0 ? `$${Math.abs(f.balance).toFixed(2)}` : "settled up"}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Groups</Text>
        {!summary?.groups?.length ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptySubtitle}>Create one to split expenses</Text>
          </View>
        ) : (
          <>
            {(summary?.groups ?? []).map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.groupRow}
                onPress={() => setSelectedGroupId(g.id)}
              >
                <View style={styles.groupIcon}>
                  <Ionicons name="people" size={20} color="#3D8E62" />
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupMeta}>{g.memberCount} members · {formatTimeAgo(g.lastActivityAt)}</Text>
                </View>
                {g.myBalance !== 0 ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.groupBalanceLabel}>{g.myBalance > 0 ? "owed" : "you owe"}</Text>
                    <Text style={[styles.groupBalance, g.myBalance > 0 ? styles.balanceGreen : styles.balanceAmber]}>
                      ${Math.abs(g.myBalance).toFixed(2)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.groupSettled}>settled up</Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addGroupRow} onPress={() => setShowCreate(true)}>
              <View style={styles.addGroupIcon}>
                <Ionicons name="add" size={20} color="#9CA3AF" />
              </View>
              <Text style={styles.addGroupText}>Create a new group</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Recent activity</Text>
        <View style={styles.activityCard}>
          {activity.length === 0 ? (
            <View style={styles.activityEmpty}>
              <Ionicons name="time-outline" size={24} color="#9CA3AF" />
              <Text style={styles.activityEmptyText}>No activity yet</Text>
              <Text style={styles.activityEmptySubtext}>Splits and settlements will show here.</Text>
            </View>
          ) : (
            activity.map((item, i) => (
              <View key={item.id} style={[styles.activityRow, i < activity.length - 1 && styles.activityRowBorder]}>
                <View style={[styles.activityIcon, { backgroundColor: item.direction === "get_back" ? "rgba(61,142,98,0.15)" : item.direction === "owe" ? "rgba(220,38,38,0.15)" : "#F3F4F6" }]}>
                  <Text style={{ fontSize: 16 }}>💳</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityWho}>
                    <Text style={{ fontWeight: "600" }}>{item.who}</Text> {item.action}
                    {item.what ? ` "${item.what}"` : ""}
                    {item.in ? ` in "${item.in}"` : ""}
                  </Text>
                  {item.direction !== "settled" && (
                    <Text style={[styles.activityAmount, item.direction === "get_back" ? styles.balanceGreen : { color: "#DC2626" }]}>
                      {item.direction === "get_back" ? `You get back $${item.amount.toFixed(2)}` : `You owe $${item.amount.toFixed(2)}`}
                    </Text>
                  )}
                  <Text style={styles.activityTime}>{item.time}</Text>
                </View>
              </View>
            ))
          )}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAF8" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  screenPadding: { paddingHorizontal: 20, paddingTop: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  subtitle: { fontSize: 13, color: "#9CA3AF", marginTop: 2 },
  balanceSmallLabel: { fontSize: 11, color: "#9CA3AF", marginBottom: 2 },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  backText: { fontSize: 14, color: "#6B7280" },
  createCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 20,
    marginBottom: 24,
  },
  createCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 12,
  },
  createInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F2937",
    marginBottom: 12,
    minHeight: 48,
  },
  createActions: { flexDirection: "row", gap: 10 },
  createBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnPrimary: { backgroundColor: "#3D8E62" },
  createBtnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  createBtnSecondary: { borderWidth: 1, borderColor: "#E5E7EB" },
  createBtnSecondaryText: { color: "#374151", fontSize: 15 },
  createError: { fontSize: 14, color: "#DC2626", marginTop: 8 },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#3D8E62",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  createButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  balanceCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  balanceText: { fontSize: 15, color: "#1F2937" },
  balanceLabel: { fontWeight: "500", color: "#374151" },
  balanceOwe: { fontSize: 15, color: "#B45309" },
  balanceOwed: { fontSize: 15, color: "#2D7A52" },
  balanceGreen: { color: "#2D7A52" },
  balanceAmber: { color: "#B45309" },
  bold: { fontWeight: "700" },
  allSettled: { fontSize: 15, color: "#2D7A52", fontWeight: "600" },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  personName: { fontSize: 16, fontWeight: "500", color: "#1F2937" },
  balance: { fontSize: 14, color: "#6B7280", marginTop: 4 },
  personBalance: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EEF7F2",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  groupInfo: { flex: 1 },
  groupName: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  groupMeta: { fontSize: 12, color: "#6B7280" },
  groupBalance: { fontSize: 14, fontWeight: "600" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  txRow: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  txMerchant: { fontSize: 15, fontWeight: "500", color: "#1F2937" },
  txMeta: { fontSize: 12, color: "#6B7280", marginTop: 4 },
  empty: { fontSize: 14, color: "#9CA3AF", padding: 16 },
  emptyCard: {
    backgroundColor: "#fff",
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#6B7280", marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: "#9CA3AF", marginTop: 4 },
  peopleEmpty: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 24,
    alignItems: "center",
  },
  peopleEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  peopleEmptyTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },
  peopleEmptySubtext: { fontSize: 13, color: "#9CA3AF", marginTop: 4, textAlign: "center" },
  groupDetailEmpty: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 32,
    alignItems: "center",
  },
  groupDetailEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  groupDetailEmptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151" },
  groupDetailEmptySubtext: { fontSize: 14, color: "#6B7280", marginTop: 8, textAlign: "center" },
  groupDetailEmptyButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#3D8E62",
    borderRadius: 12,
  },
  groupDetailEmptyButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  groupBalanceLabel: { fontSize: 11, color: "#9CA3AF", marginBottom: 2 },
  groupSettled: { fontSize: 14, color: "#9CA3AF" },
  addGroupRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  addGroupIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  addGroupText: { fontSize: 14, color: "#9CA3AF", fontWeight: "500" },
  activityCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  activityEmpty: {
    padding: 24,
    alignItems: "center",
  },
  activityEmptyText: { fontSize: 14, fontWeight: "600", color: "#374151", marginTop: 8 },
  activityEmptySubtext: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  activityRow: { flexDirection: "row", alignItems: "flex-start", padding: 16, gap: 12 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activityWho: { fontSize: 13, color: "#374151", flex: 1 },
  activityAmount: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  activityTime: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },
  previewBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#EEF7F2",
    borderWidth: 1,
    borderColor: "#C3E0D3",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  previewBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(61, 142, 98, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewBannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  previewCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  previewRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  previewAvatar: {
    width: 40,
    height: 40,
    marginRight: 12,
  },
  previewRowText: { flex: 1 },
  previewLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  previewSubtext: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  previewBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  previewHint: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F9FAFB",
  },
  settledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EEF7F2",
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  settledText: { fontSize: 14, color: "#2D7A52", fontWeight: "500" },
  connectCard: {
    backgroundColor: "#fff",
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
  },
  connectTitle: { fontSize: 18, fontWeight: "600", color: "#374151", marginTop: 16 },
  connectSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
  },
  connectButton: {
    backgroundColor: "#3D8E62",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  connectButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  settleActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 20,
  },
  settleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 100,
  },
  settleButtonPrimary: { backgroundColor: "#3D8E62" },
  settleButtonSecondary: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  settleTapToPay: { backgroundColor: "#4A6CF7" },
  settleButtonPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  settleButtonSecondaryText: { color: "#374151", fontSize: 14 },
  settleSection: { marginTop: 24, marginBottom: 16 },
  suggestionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  suggestionText: { fontSize: 14, color: "#374151", flex: 1 },
  suggestionBold: { fontWeight: "600", color: "#1F2937" },
  suggestionAmount: { fontWeight: "600", color: "#3D8E62" },
  suggestionActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  settleButtonSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
});
