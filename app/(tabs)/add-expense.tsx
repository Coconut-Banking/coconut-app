import { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApiFetch } from "../../lib/api";
import { useGroupsSummary } from "../../hooks/useGroups";

type SelectedParticipant =
  | { type: "group"; id: string; name: string; personKey?: undefined }
  | { type: "person"; id: string; name: string; personKey: string };

export default function AddExpenseScreen() {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const { summary, loading } = useGroupsSummary();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<SelectedParticipant | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build Recent: groups by lastActivityAt (most recent first), top 3
  const recent = useMemo(() => {
    if (!summary) return [];
    const groups = [...(summary.groups ?? [])].sort(
      (a, b) =>
        new Date(b.lastActivityAt || 0).getTime() -
        new Date(a.lastActivityAt || 0).getTime()
    );
    return groups.slice(0, 3);
  }, [summary]);

  const groups = summary?.groups ?? [];
  const friends = summary?.friends ?? [];

  const q = searchQuery.toLowerCase().trim();
  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, q]);
  const filteredFriends = useMemo(() => {
    if (!q) return friends;
    return friends.filter((f) => f.displayName.toLowerCase().includes(q));
  }, [friends, q]);

  const handleSelectGroup = (g: (typeof groups)[0]) => {
    setSelected({ type: "group", id: g.id, name: g.name });
    setError(null);
  };

  // Friends: key can be "groupId-memberId" (split 50/50 with them) or user_id/email (aggregated, need group)
  const handleSelectPerson = (f: (typeof friends)[0]) => {
    const isUuidKey = /^[0-9a-f-]{36}-[0-9a-f-]{36}$/i.test(f.key);
    if (isUuidKey) {
      const groupId = f.key.slice(0, 36);
      setSelected({ type: "person", id: groupId, name: f.displayName, personKey: f.key });
      setError(null);
    } else {
      setError("Tap a group to split with this person");
    }
  };

  const saveExpense = async () => {
    const amt = parseFloat(amount.replace(/[^0-9.-]/g, ""));
    if (!amt || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!selected) {
      setError("Select who to split with");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await apiFetch("/api/manual-expense", {
        method: "POST",
        body: {
          amount: amt,
          description: description.trim() || "Expense",
          groupId: selected.id,
          personKey: selected.type === "person" ? selected.personKey : undefined,
        },
      });
      if (res.ok) {
        router.navigate("/(tabs)");
      } else {
        let errorMsg = "Failed to add expense";
        try {
          const data = await res.json();
          errorMsg = data.error ?? errorMsg;
        } catch {
          // Response wasn't JSON, use default message
        }
        setError(errorMsg);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !summary) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3D8E62" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.navigate("/(tabs)")} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.title}>Add an expense</Text>
          <TouchableOpacity
            onPress={saveExpense}
            disabled={saving}
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          >
            <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
          />
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder="What was it for?"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <Text style={styles.sectionLabel}>With you and:</Text>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Enter names, emails, or search"
          placeholderTextColor="#9CA3AF"
        />

        {selected && (
          <View style={styles.selectedChip}>
            <Text style={styles.selectedText}>{selected.name}</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.sections}>
          {recent.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent</Text>
              {recent.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[
                    styles.optionRow,
                    selected?.id === g.id && styles.optionRowSelected,
                  ]}
                  onPress={() => handleSelectGroup(g)}
                >
                  <View style={[styles.optionIcon, { backgroundColor: "#EEF7F2" }]}>
                    <Ionicons name="home" size={20} color="#3D8E62" />
                  </View>
                  <Text style={styles.optionName}>{g.name}</Text>
                  <View
                    style={[
                      styles.radio,
                      selected?.id === g.id && styles.radioChecked,
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Groups</Text>
            {(q ? filteredGroups : groups).map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[
                  styles.optionRow,
                  selected?.id === g.id && styles.optionRowSelected,
                ]}
                onPress={() => handleSelectGroup(g)}
              >
                <View style={[styles.optionIcon, { backgroundColor: "#EEF7F2" }]}>
                  <Ionicons name="people" size={20} color="#3D8E62" />
                </View>
                <Text style={styles.optionName}>{g.name}</Text>
                <View
                  style={[
                    styles.radio,
                    selected?.id === g.id && styles.radioChecked,
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Friends</Text>
            {(q ? filteredFriends : friends).map((f) => {
              const isSelected =
                selected?.type === "person" && selected.personKey === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                  onPress={() => handleSelectPerson(f)}
                >
                  <View style={[styles.optionIcon, { backgroundColor: "#E0F2FE" }]}>
                    <Text style={styles.optionAvatar}>{f.displayName.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.optionName}>{f.displayName}</Text>
                  <View style={[styles.radio, isSelected && styles.radioChecked]} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAF8" },
  center: { justifyContent: "center", alignItems: "center" },
  keyboardView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  closeBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: "700", color: "#1F2937" },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#3D8E62",
    borderRadius: 12,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  form: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 6 },
  amountInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 16,
  },
  descInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1F2937",
  },
  sectionLabel: { fontSize: 15, color: "#6B7280", marginBottom: 8 },
  searchInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F2937",
    marginBottom: 16,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF7F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
    gap: 8,
    marginBottom: 16,
  },
  selectedText: { fontSize: 14, fontWeight: "500", color: "#1F2937" },
  sections: { gap: 24 },
  section: { marginBottom: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    borderRadius: 12,
  },
  optionRowSelected: { backgroundColor: "#F7FAF8" },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  optionAvatar: { fontSize: 12, fontWeight: "600", color: "#3B82F6" },
  optionName: { flex: 1, fontSize: 16, color: "#1F2937" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  radioChecked: {
    borderColor: "#3D8E62",
    backgroundColor: "#3D8E62",
  },
  errorText: { fontSize: 14, color: "#DC2626", marginTop: 12 },
});
