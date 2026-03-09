import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApiFetch } from "../../lib/api";
import {
  useGroupsSummary,
  useGroupDetail,
  usePersonDetail,
} from "../../hooks/useGroups";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "";

function MemberAvatar({ name }: { name: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: "#3D8E62" }]}>
      <Text style={styles.avatarText}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

export default function SharedScreen() {
  const apiFetch = useApiFetch();
  const { summary, loading, refetch } = useGroupsSummary();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(null);
  const { detail: groupDetail, loading: groupLoading, refetch: refetchGroup } =
    useGroupDetail(selectedGroupId);
  const { detail: personDetail, loading: personLoading, refetch: refetchPerson } =
    usePersonDetail(selectedPersonKey);
  const [plaidLinked, setPlaidLinked] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch("/api/plaid/status")
      .then((r) => r.json())
      .then((d) => setPlaidLinked(d.linked === true))
      .catch(() => setPlaidLinked(false));
  }, [apiFetch]);

  const showOverview = !selectedGroupId && !selectedPersonKey;

  if (plaidLinked === false && !summary?.groups?.length) {
    return (
      <View style={styles.container}>
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
              onPress={() => Linking.openURL(`${API_URL.replace(/\/$/, "")}/connect?from_app=1`)}
            >
              <Text style={styles.connectButtonText}>Open web app</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  if (loading && showOverview) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3D8E62" />
      </View>
    );
  }

  const createGroup = async () => {
    const res = await apiFetch("/api/groups", {
      method: "POST",
      body: { name: "New group", ownerDisplayName: "You" } as object,
    });
    const data = await res.json();
    if (res.ok) {
      refetch();
      setSelectedGroupId(data.id);
    } else {
      Alert.alert("Error", data.error ?? "Failed to create group");
    }
  };

  const goBack = () => {
    setSelectedGroupId(null);
    setSelectedPersonKey(null);
    refetch();
  };

  if (selectedPersonKey && personDetail) {
    return (
      <ScrollView style={styles.container}>
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
      </ScrollView>
    );
  }

  if (selectedGroupId && groupDetail) {
    return (
      <ScrollView style={styles.container}>
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
        {groupDetail.activity?.length === 0 ? (
          <Text style={styles.empty}>No shared transactions yet.</Text>
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
        {groupDetail.balances?.filter((b) => b.total !== 0).length === 0 &&
          (groupDetail.activity?.length ?? 0) > 0 && (
            <View style={styles.settledBadge}>
              <Ionicons name="checkmark-circle" size={20} color="#2D7A52" />
              <Text style={styles.settledText}>All settled up.</Text>
            </View>
          )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.title}>Shared</Text>
        <TouchableOpacity style={styles.createButton} onPress={createGroup}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.createButtonText}>Create group</Text>
        </TouchableOpacity>
      </View>
      {summary && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Overall, </Text>
          {summary.totalIOwe > 0 && (
            <Text style={styles.balanceOwe}>
              you owe <Text style={styles.bold}>${summary.totalIOwe.toFixed(2)}</Text>
            </Text>
          )}
          {summary.totalOwedToMe > 0 && (
            <Text style={styles.balanceOwed}>
              you are owed <Text style={styles.bold}>${summary.totalOwedToMe.toFixed(2)}</Text>
            </Text>
          )}
          {summary.totalIOwe === 0 && summary.totalOwedToMe === 0 && (
            <Text style={styles.allSettled}>All settled</Text>
          )}
        </View>
      )}
      {summary?.friends && summary.friends.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>People</Text>
          {summary.friends.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={styles.personRow}
              onPress={() => setSelectedPersonKey(f.key)}
            >
              <Text style={styles.personName}>{f.displayName}</Text>
              <Text
                style={[
                  styles.personBalance,
                  f.balance > 0 && styles.balanceGreen,
                  f.balance < 0 && styles.balanceAmber,
                ]}
              >
                {f.balance > 0 ? "owes you $" : f.balance < 0 ? "you owe $" : "settled up"}
                {f.balance !== 0 && Math.abs(f.balance).toFixed(2)}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      )}
      <Text style={styles.sectionTitle}>Groups</Text>
      {summary?.groups?.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={40} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptySubtitle}>Create one to split expenses</Text>
        </View>
      ) : (
        (summary?.groups ?? []).map((g) => (
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
              <Text style={styles.groupMeta}>{g.memberCount} members</Text>
            </View>
            {g.myBalance !== 0 && (
              <Text
                style={[
                  styles.groupBalance,
                  g.myBalance > 0 ? styles.balanceGreen : styles.balanceAmber,
                ]}
              >
                {g.myBalance > 0 ? "owed $" : "you owe $"}
                {Math.abs(g.myBalance).toFixed(2)}
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAF8" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  backText: { fontSize: 14, color: "#6B7280" },
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
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  balanceLabel: { fontSize: 15, color: "#374151" },
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
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
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
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#6B7280", marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: "#9CA3AF", marginTop: 4 },
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
});
