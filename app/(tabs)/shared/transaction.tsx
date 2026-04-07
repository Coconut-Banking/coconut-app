import { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useApiFetch } from "../../../lib/api";
import { useTransactionDetail } from "../../../hooks/useGroups";
import { colors, font, radii, prototype } from "../../../lib/theme";
import { formatSplitCurrencyAmount } from "../../../lib/format-split-money";
import { MerchantLogo } from "../../../components/merchant/MerchantLogo";
import { MemberAvatar } from "../../../components/MemberAvatar";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function TransactionScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const apiFetch = useApiFetch();
  const { detail, loading, refetch } = useTransactionDetail(id ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState("");

  useEffect(() => {
    if (detail) {
      setEditDesc(detail.description ?? "");
      setEditAmount(String(detail.amount ?? 0));
    }
  }, [detail]);

  useEffect(() => {
    if (edit === "1" && detail && !editing) {
      setEditing(true);
    }
  }, [edit, detail, editing]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(true); } finally { setRefreshing(false); }
  }, [refetch]);

  const handleDelete = useCallback(() => {
    if (!detail || !id) return;
    Alert.alert(
      "Delete expense",
      `Remove "${detail.description}"${detail.groupName && detail.groupType !== "friend" ? ` from ${detail.groupName}` : ""}? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const res = await apiFetch(`/api/split-transactions/${id}`, { method: "DELETE" });
              if (res.ok) {
                DeviceEventEmitter.emit("groups-updated");
                router.back();
              } else {
                Alert.alert("Error", "Couldn't delete expense. Try again.");
              }
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [id, detail, apiFetch]);

  const handleSaveEdit = useCallback(async () => {
    if (!id || !detail) return;
    const desc = editDesc.trim();
    const amt = parseFloat(editAmount);
    if (!desc) { Alert.alert("Error", "Description can't be empty"); return; }
    if (!Number.isFinite(amt) || amt <= 0) { Alert.alert("Error", "Enter a valid amount"); return; }

    const body: Record<string, unknown> = {};
    if (desc !== detail.description) body.description = desc;
    if (Math.abs(amt - (detail.amount ?? 0)) > 0.005) {
      body.amount = amt;
      const shares = detail.shares;
      const oldAmount = detail.amount ?? 0;
      if (shares.length === 0) {
        body.shares = [];
      } else if (oldAmount > 0 && Number.isFinite(oldAmount)) {
        const ratio = amt / oldAmount;
        let sumPrev = 0;
        body.shares = shares.map((sh, i) => {
          if (i === shares.length - 1) {
            return { memberId: sh.memberId, amount: Math.round((amt - sumPrev) * 100) / 100 };
          }
          const scaled = Math.round(sh.amount * ratio * 100) / 100;
          sumPrev += scaled;
          return { memberId: sh.memberId, amount: scaled };
        });
      } else {
        const n = shares.length;
        let sumPrev = 0;
        const per = Math.round((amt / n) * 100) / 100;
        body.shares = shares.map((sh, i) => {
          if (i === n - 1) {
            return { memberId: sh.memberId, amount: Math.round((amt - sumPrev) * 100) / 100 };
          }
          sumPrev += per;
          return { memberId: sh.memberId, amount: per };
        });
      }
    }

    if (Object.keys(body).length === 0) { setEditing(false); return; }

    try {
      const res = await apiFetch(`/api/split-transactions/${id}`, { method: "PATCH", body });
      if (res.ok) {
        DeviceEventEmitter.emit("groups-updated");
        setEditing(false);
        await refetch();
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Error", (err as { error?: string }).error ?? "Couldn't save changes.");
      }
    } catch {
      Alert.alert("Error", "Network error. Try again.");
    }
  }, [id, detail, editDesc, editAmount, apiFetch, refetch]);

  if (loading && !detail) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backRow} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backRow} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <Text style={s.emptyText}>Transaction not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalAmount = detail.amount ?? 0;
  const currency = detail.currency ?? "USD";
  const isFriendGroup = detail.groupType === "friend";

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => { if (editing) setEditing(false); else router.back(); }} style={s.backRow} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={s.backText}>{editing ? "Cancel" : "Back"}</Text>
        </TouchableOpacity>
        {!editing ? (
          <View style={s.topActions}>
            <TouchableOpacity onPress={() => setEditing(true)} hitSlop={10} style={s.topActionBtn}>
              <Ionicons name="pencil" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} hitSlop={10} style={s.topActionBtn} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Hero */}
        {editing ? (
          <View style={s.hero}>
            <MerchantLogo merchantName={editDesc || "Expense"} size={56} backgroundColor="#F7F3F0" borderColor="#E3DBD8" />
            <EditInput value={editDesc} onChangeText={setEditDesc} placeholder="Description" style={s.editDescInput} />
            <EditInput
              value={editAmount}
              onChangeText={setEditAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              style={s.editAmountInput}
              prefix="$"
            />
            {detail.groupName && !isFriendGroup ? <Text style={s.heroGroup}>{detail.groupName}</Text> : null}
            <Text style={s.heroDate}>{formatDate(detail.date)}</Text>
          </View>
        ) : (
          <View style={s.hero}>
            <MerchantLogo merchantName={detail.description ?? "Expense"} size={56} backgroundColor="#F7F3F0" borderColor="#E3DBD8" />
            <Text style={s.heroTitle}>{detail.description ?? "Expense"}</Text>
            <Text style={s.heroAmount}>{formatSplitCurrencyAmount(totalAmount, currency)}</Text>
            {detail.groupName && !isFriendGroup ? (
              <Text style={s.heroGroup}>{detail.groupName}</Text>
            ) : null}
            <Text style={s.heroDate}>{formatDate(detail.date)}</Text>
          </View>
        )}

        {/* Category badge */}
        {detail.category ? (
          <View style={s.categoryRow}>
            <View style={s.categoryBadge}>
              <Ionicons name="pricetag-outline" size={13} color="#6B7280" />
              <Text style={s.categoryText}>{detail.category}</Text>
            </View>
          </View>
        ) : null}

        {/* Paid by */}
        {detail.paidBy ? (
          <>
            <Text style={s.section}>Paid by</Text>
            <View style={s.card}>
              <View style={s.paidByRow}>
                <MemberAvatar name={detail.paidBy.displayName} size={36} imageUrl={detail.paidBy.image_url} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={s.paidByName}>
                    {detail.paidBy.isMe ? "You" : detail.paidBy.displayName}
                  </Text>
                  <Text style={s.paidByAmt}>
                    {formatSplitCurrencyAmount(totalAmount, currency)}
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {/* Shares */}
        {detail.shares.length > 0 ? (
          <>
            <Text style={s.section}>Split between</Text>
            <View style={s.card}>
              {detail.shares.map((share, i) => (
                <View key={share.memberId}>
                  <View style={s.shareRow}>
                    <MemberAvatar name={share.displayName} size={32} imageUrl={share.image_url} />
                    <Text style={[s.shareName, { flex: 1, marginLeft: 12 }]}>
                      {share.isMe ? "You" : share.displayName}
                    </Text>
                    <Text style={s.shareAmt}>
                      {formatSplitCurrencyAmount(share.amount, currency)}
                    </Text>
                  </View>
                  {i < detail.shares.length - 1 ? <View style={s.sep} /> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Notes */}
        {detail.notes ? (
          <>
            <Text style={s.section}>Notes</Text>
            <View style={s.card}>
              <Text style={s.notesText}>{detail.notes}</Text>
            </View>
          </>
        ) : null}

        {/* Receipt */}
        {detail.receiptUrl ? (
          <>
            <Text style={s.section}>Receipt</Text>
            <View style={[s.card, { alignItems: "center", padding: 12 }]}>
              <Image source={{ uri: detail.receiptUrl }} style={s.receiptImage} resizeMode="contain" />
            </View>
          </>
        ) : null}

        {editing ? (
          <TouchableOpacity style={s.saveBtn} onPress={handleSaveEdit} activeOpacity={0.8}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={s.saveBtnText}>Save changes</Text>
          </TouchableOpacity>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

function EditInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  style,
  prefix,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  keyboardType?: "default" | "decimal-pad";
  style?: object;
  prefix?: string;
}) {
  const { TextInput } = require("react-native");
  return (
    <View style={[s.editInputWrap, style]}>
      {prefix ? <Text style={s.editPrefix}>{prefix}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType ?? "default"}
        style={s.editInput}
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F3F2" },
  topBar: { paddingHorizontal: 8, paddingTop: 4, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 8 },
  backText: { fontSize: 15, fontFamily: font.semibold, color: colors.primary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 14, fontFamily: font.regular, color: "#7A8088" },

  hero: { alignItems: "center", paddingTop: 8, paddingBottom: 20 },
  heroTitle: { fontSize: 20, fontFamily: font.black, color: "#1F2328", textAlign: "center", marginTop: 12 },
  heroAmount: { fontSize: 34, fontFamily: font.black, color: "#1F2328", letterSpacing: -1, marginTop: 4 },
  heroGroup: { fontSize: 13, fontFamily: font.medium, color: colors.primary, marginTop: 8 },
  heroDate: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 4 },

  categoryRow: { alignItems: "center", marginBottom: 20 },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F7F3F0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E3DBD8",
  },
  categoryText: { fontSize: 13, fontFamily: font.medium, color: "#4B5563" },

  section: {
    fontSize: 11,
    fontFamily: font.extrabold,
    color: "#9AA0A6",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    overflow: "hidden",
    marginBottom: 20,
  },
  paidByRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  paidByName: { fontSize: 15, fontFamily: font.semibold, color: "#1F2328" },
  paidByAmt: { fontSize: 13, fontFamily: font.regular, color: "#7A8088", marginTop: 2 },

  shareRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14 },
  shareName: { fontSize: 14, fontFamily: font.semibold, color: "#1F2328" },
  shareAmt: { fontSize: 14, fontFamily: font.bold, color: "#1F2328" },
  sep: { height: 1, backgroundColor: "#EEE8E4", marginLeft: 58 },

  notesText: { fontSize: 14, fontFamily: font.regular, color: "#4B5563", padding: 14, lineHeight: 20 },

  receiptImage: { width: "100%", height: 300, borderRadius: 12 },

  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  avatarText: { fontFamily: font.bold },

  topActions: { flexDirection: "row", gap: 12, alignItems: "center" },
  topActionBtn: { padding: 8 },
  editInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3DBD8",
    paddingHorizontal: 14,
    height: 48,
    marginTop: 10,
    width: "100%",
  },
  editPrefix: { fontSize: 22, fontFamily: font.black, color: "#1F2328", marginRight: 4 },
  editInput: { flex: 1, fontSize: 16, fontFamily: font.semibold, color: "#1F2328", paddingVertical: 0 },
  editDescInput: {},
  editAmountInput: {},
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginTop: 8,
    marginBottom: 20,
  },
  saveBtnText: { fontSize: 16, fontFamily: font.bold, color: "#fff" },
});
