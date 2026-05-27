import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "../../../lib/theme-context";
import { font, radii, space } from "../../../lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-app.dev";

type Item = { id: string; name: string; total_price: number };
type Participant = { member_id: string; display_name: string; status: string };

export default function ReceiptCollectScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/receipt/collect/${encodeURIComponent(token)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Invalid link");
          return;
        }
        setMerchantName(data.merchantName ?? "Receipt");
        setParticipants(data.participants ?? []);
        setItems(data.items ?? []);
      } catch {
        setError("Could not load");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = useCallback(async () => {
    if (!memberId || !token || selected.size === 0) return;
    setSubmitting(true);
    const name = participants.find((p) => p.member_id === memberId)?.display_name ?? "Guest";
    const assignments = [...selected].map((itemId) => ({
      itemId,
      assignees: [{ name, memberId }],
    }));
    try {
      const res = await fetch(
        `${API_URL}/api/receipt/collect/${encodeURIComponent(token)}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId, assignments }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error ?? "Submit failed");
        return;
      }
      setDone(true);
    } catch {
      Alert.alert("Error", "Network error");
    } finally {
      setSubmitting(false);
    }
  }, [memberId, token, selected, participants]);

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.error, textAlign: "center", marginTop: 40 }}>{error}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ alignSelf: "center", marginTop: 20 }}>
          <Text style={{ color: theme.primary }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
        <View style={s.center}>
          <Ionicons name="checkmark-circle" size={56} color={theme.primary} />
          <Text style={[s.title, { color: theme.text }]}>You&apos;re done</Text>
          <Text style={[s.sub, { color: theme.textSecondary, textAlign: "center" }]}>
            We&apos;ll notify you when it&apos;s time to pay.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!memberId) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={s.pad}>
          <Text style={[s.title, { color: theme.text }]}>{merchantName}</Text>
          <Text style={[s.sub, { color: theme.textTertiary }]}>Pick your name</Text>
          <View style={s.grid}>
            {participants.map((p) => (
              <TouchableOpacity
                key={p.member_id}
                style={[s.nameBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                disabled={p.status === "submitted"}
                onPress={() => setMemberId(p.member_id)}
              >
                <Text style={[s.nameBtnText, { color: theme.text }]}>
                  {p.display_name}
                  {p.status === "submitted" ? " ✓" : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const myName = participants.find((p) => p.member_id === memberId)?.display_name;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={s.pad}>
        <TouchableOpacity onPress={() => setMemberId(null)} style={s.backRow}>
          <Ionicons name="chevron-back" size={18} color={theme.textTertiary} />
          <Text style={{ color: theme.textTertiary }}>Change name</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text }]}>{merchantName}</Text>
        <Text style={[s.sub, { color: theme.textTertiary }]}>Tap what you had, {myName}</Text>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              s.itemRow,
              {
                borderColor: selected.has(item.id) ? theme.primary : theme.borderLight,
                backgroundColor: selected.has(item.id) ? `${theme.primary}11` : theme.surface,
              },
            ]}
            onPress={() => toggleItem(item.id)}
          >
            <Text style={[s.itemName, { color: theme.text }]}>{item.name}</Text>
            <Text style={{ color: theme.textSecondary }}>${Number(item.total_price).toFixed(2)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[s.submitBtn, { backgroundColor: theme.primary }, (selected.size === 0 || submitting) && { opacity: 0.5 }]}
          disabled={selected.size === 0 || submitting}
          onPress={() => void submit()}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.submitText}>Submit my items</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: space.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  title: { fontFamily: font.bold, fontSize: 22 },
  sub: { fontFamily: font.regular, fontSize: 14, marginTop: 6, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nameBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: radii.lg, borderWidth: 1, minWidth: "45%" },
  nameBtnText: { fontFamily: font.semibold, fontSize: 14, textAlign: "center" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemName: { fontFamily: font.medium, fontSize: 15, flex: 1, marginRight: 8 },
  submitBtn: { marginTop: 16, paddingVertical: 14, borderRadius: radii.lg, alignItems: "center" },
  submitText: { color: "#fff", fontFamily: font.semibold, fontSize: 16 },
});
