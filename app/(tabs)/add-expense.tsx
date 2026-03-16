import { useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  SafeAreaView,
} from "react-native";
import { useRouter, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApiFetch } from "../../lib/api";
import { useGroupsSummary } from "../../hooks/useGroups";
import { useDemoMode } from "../../lib/demo-mode-context";
import { DEMO_SUMMARY } from "../../lib/demo-data";

type Target = { type: "group" | "friend"; key: string; name: string };
type SplitMethod = "equal" | "exact" | "percent" | "shares";

const C = ["#3D8E62", "#4A6CF7", "#E8507A", "#F59E0B", "#10A37F", "#8B5CF6"];

const SPLITS: { key: SplitMethod; label: string; icon: string }[] = [
  { key: "equal", label: "Equal", icon: "git-compare-outline" },
  { key: "exact", label: "Exact", icon: "cash-outline" },
  { key: "percent", label: "Percent", icon: "pie-chart-outline" },
  { key: "shares", label: "Shares", icon: "layers-outline" },
];

export default function AddExpenseScreen() {
  const nav = useRouter();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const { summary: realSummary, loading } = useGroupsSummary();
  const summary = isDemoOn ? DEMO_SUMMARY : realSummary;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [targets, setTargets] = useState<Target[]>([]);
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [recurring, setRecurring] = useState<"none" | "weekly" | "biweekly" | "monthly">("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<TextInput>(null);

  const friends = summary?.friends ?? [];
  const groups = summary?.groups ?? [];
  const q = query.toLowerCase().trim();
  const filteredFriends = q ? friends.filter(f => f.displayName.toLowerCase().includes(q)) : friends;
  const filteredGroups = q ? groups.filter(g => g.name.toLowerCase().includes(q)) : groups;
  const selectedKeys = new Set(targets.map(t => t.key));

  const people = useMemo(() => [{ key: "_you", name: "You" }, ...targets], [targets]);
  const total = parseFloat(amount) || 0;

  const shares = useMemo(() => {
    if (total <= 0) return people.map(p => ({ ...p, share: 0 }));
    switch (splitMethod) {
      case "equal": return people.map(p => ({ ...p, share: total / people.length }));
      case "exact": return people.map(p => ({ ...p, share: parseFloat(customSplits[p.key] || "0") || 0 }));
      case "percent": return people.map(p => ({ ...p, share: (total * (parseFloat(customSplits[p.key] || "0") || 0)) / 100 }));
      case "shares": {
        const sum = people.reduce((s, p) => s + (parseFloat(customSplits[p.key] || "1") || 1), 0);
        return people.map(p => ({ ...p, share: (total * ((parseFloat(customSplits[p.key] || "1") || 1))) / sum }));
      }
    }
  }, [people, total, splitMethod, customSplits]);

  const shareSum = shares.reduce((s, p) => s + p.share, 0);
  const valid = splitMethod === "equal" || Math.abs(shareSum - total) < 0.02;

  const toggle = useCallback((t: Target) => {
    setTargets(prev => {
      if (prev.some(x => x.key === t.key)) return prev.filter(x => x.key !== t.key);
      return [...prev, t];
    });
    setQuery("");
    setError(null);
  }, []);

  const removeChip = useCallback((key: string) => {
    setTargets(prev => prev.filter(x => x.key !== key));
    setCustomSplits(prev => { const n = { ...prev }; delete n[key]; return n; });
  }, []);

  const goStep2 = useCallback(() => {
    if (targets.length === 0) { setError("Pick at least one person"); return; }
    setStep(2);
    setTimeout(() => amountRef.current?.focus(), 100);
  }, [targets]);

  const pickSplit = useCallback((m: SplitMethod) => {
    setSplitMethod(m);
    if (m === "equal") { setCustomSplits({}); return; }
    const init: Record<string, string> = {};
    people.forEach(p => {
      if (m === "shares") init[p.key] = "1";
      else if (m === "percent") init[p.key] = (100 / people.length).toFixed(1);
      else init[p.key] = total > 0 ? (total / people.length).toFixed(2) : "0";
    });
    setCustomSplits(init);
  }, [people, total]);

  const save = async () => {
    if (total <= 0) { setError("Enter an amount"); return; }
    if (!valid && splitMethod === "exact") { setError(`Must add up to $${total.toFixed(2)}`); return; }
    if (!valid && splitMethod === "percent") { setError("Must add up to 100%"); return; }

    if (isDemoOn) { setStep(3); return; }
    setSaving(true);
    try {
      const t = targets[0];
      const res = await apiFetch("/api/manual-expense", {
        method: "POST",
        body: {
          amount: total,
          description: description.trim() || "Expense",
          groupId: t.type === "group" ? t.key : t.key.slice(0, 36),
          personKey: t.type === "friend" ? t.key : undefined,
          recurringFrequency: recurring !== "none" ? recurring : undefined,
        },
      });
      if ((await res.json()) && res.ok) setStep(3);
      else setError("Failed to save");
    } catch { setError("Failed"); }
    finally { setSaving(false); }
  };

  if (loading && !summary) return <View style={s.center}><ActivityIndicator size="large" color="#3D8E62" /></View>;

  // ════════════════════════════════
  // Step 1 — Pick people
  // ════════════════════════════════
  if (step === 1) return (
    <SafeAreaView style={s.root}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => nav.back()} hitSlop={12}><Ionicons name="close" size={24} color="#1F2937" /></TouchableOpacity>
        <Text style={s.barTitle}>Split with</Text>
        <TouchableOpacity onPress={goStep2} style={[s.pill, targets.length === 0 && s.pillOff]} disabled={targets.length === 0}>
          <Text style={s.pillText}>Next</Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" />
        </TouchableOpacity>
      </View>

      {targets.length > 0 && (
        <View style={s.chipRow}>
          {targets.map((t, i) => (
            <TouchableOpacity key={t.key} style={s.chip} onPress={() => removeChip(t.key)}>
              <View style={[s.dot, { backgroundColor: C[i % C.length] }]} />
              <Text style={s.chipLabel}>{t.name}</Text>
              <Ionicons name="close" size={12} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={s.search}>
        <Ionicons name="search" size={18} color="#9CA3AF" />
        <TextInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder="Search..." placeholderTextColor="#C4C4C4" autoFocus />
        {!!q && <TouchableOpacity onPress={() => setQuery("")}><Ionicons name="close-circle" size={18} color="#D1D5DB" /></TouchableOpacity>}
      </View>

      <ScrollView style={s.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {filteredFriends.length > 0 && <Text style={s.label}>Friends</Text>}
        {filteredFriends.map((f, i) => {
          const on = selectedKeys.has(f.key);
          return (
            <TouchableOpacity key={f.key} style={[s.row, on && s.rowOn]} onPress={() => toggle({ type: "friend", key: f.key, name: f.displayName })}>
              <View style={[s.av, { backgroundColor: C[i % C.length] }]}><Text style={s.avT}>{f.displayName.slice(0, 2).toUpperCase()}</Text></View>
              <Text style={s.rowName}>{f.displayName}</Text>
              <View style={[s.ck, on && s.ckOn]}>{on && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
            </TouchableOpacity>
          );
        })}
        {filteredGroups.length > 0 && <Text style={[s.label, { marginTop: 16 }]}>Groups</Text>}
        {filteredGroups.map(g => {
          const on = selectedKeys.has(g.id);
          return (
            <TouchableOpacity key={g.id} style={[s.row, on && s.rowOn]} onPress={() => toggle({ type: "group", key: g.id, name: g.name })}>
              <View style={s.gIcon}><Ionicons name="people" size={16} color="#3D8E62" /></View>
              <View style={{ flex: 1 }}><Text style={s.rowName}>{g.name}</Text><Text style={s.rowMeta}>{g.memberCount} members</Text></View>
              <View style={[s.ck, on && s.ckOn]}>{on && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>
      {error && <Text style={s.err}>{error}</Text>}
    </SafeAreaView>
  );

  // ════════════════════════════════
  // Step 3 — Confirmation
  // ════════════════════════════════
  if (step === 3) return (
    <SafeAreaView style={s.root}>
      <View style={s.confirmWrap}>
        <View style={s.confirmIcon}>
          <Ionicons name="checkmark-circle" size={64} color="#3D8E62" />
        </View>
        <Text style={s.confirmTitle}>Expense added!</Text>
        <Text style={s.confirmSub}>
          ${total.toFixed(2)} · {description || "Expense"} · split with {targets.map(t => t.name).join(", ")}
          {recurring !== "none" ? ` · repeats ${recurring}` : ""}
        </Text>
        <TouchableOpacity style={s.confirmBtn} onPress={() => { nav.back(); setTimeout(() => router.push("/(tabs)/shared"), 100); }}>
          <Ionicons name="people" size={18} color="#fff" />
          <Text style={s.confirmBtnText}>View in Shared</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.confirmBtnOutline} onPress={() => { setStep(1); setTargets([]); setAmount(""); setDescription(""); setRecurring("none"); setSplitMethod("equal"); setCustomSplits({}); setError(null); }}>
          <Ionicons name="add" size={18} color="#3D8E62" />
          <Text style={s.confirmBtnOutlineText}>Add another</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => nav.back()} style={{ paddingVertical: 12 }}>
          <Text style={{ fontSize: 14, color: "#9CA3AF", fontWeight: "600" }}>Close</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // ════════════════════════════════
  // Step 2 — Amount + Split
  // ════════════════════════════════
  return (
    <SafeAreaView style={s.root}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => setStep(1)} hitSlop={12}><Ionicons name="chevron-back" size={24} color="#1F2937" /></TouchableOpacity>
        <Text style={s.barTitle}>Amount</Text>
        <TouchableOpacity onPress={save} style={[s.pill, (!amount || saving) && s.pillOff]} disabled={!amount || saving}>
          <Text style={s.pillText}>{saving ? "…" : "Done"}</Text>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </TouchableOpacity>
      </View>

      {targets.length > 0 && (
        <View style={s.chipBar}>
          <Text style={s.chipBarLabel}>Splitting with:</Text>
          <Text style={s.chipBarNames}>{targets.map(t => t.name).join(", ")}</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {/* Big amount */}
        <View style={s.amtWrap}>
          <Text style={s.amtSign}>$</Text>
          <TextInput ref={amountRef} style={s.amtInput} value={amount} onChangeText={t => { const c = t.replace(/[^0-9.]/g, ""); if (c.split(".").length <= 2 && (c.split(".")[1]?.length ?? 0) <= 2) setAmount(c); }} placeholder="0" placeholderTextColor="#E5E7EB" keyboardType="decimal-pad" maxLength={10} />
        </View>

        {/* Split method pills */}
        <View style={s.splitRow}>
          {SPLITS.map(o => (
            <TouchableOpacity key={o.key} style={[s.splitBtn, splitMethod === o.key && s.splitBtnOn]} onPress={() => pickSplit(o.key)}>
              <Ionicons name={o.icon as any} size={14} color={splitMethod === o.key ? "#fff" : "#6B7280"} />
              <Text style={[s.splitLabel, splitMethod === o.key && { color: "#fff" }]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Equal info */}
        {splitMethod === "equal" && total > 0 && (
          <View style={s.eqBadge}>
            <Text style={s.eqText}>${(total / people.length).toFixed(2)}/person · {people.length} people</Text>
          </View>
        )}

        {/* Custom breakdown */}
        {splitMethod !== "equal" && (
          <View style={s.bkCard}>
            <View style={s.bkHeader}>
              <Text style={s.bkTitle}>{splitMethod === "exact" ? "Exact amounts" : splitMethod === "percent" ? "Percentages" : "Share ratios"}</Text>
              {splitMethod === "exact" && total > 0 && (
                <Text style={[s.bkBadge, !valid && { color: "#DC2626" }]}>
                  {Math.abs(total - shareSum) < 0.01 ? "✓" : shareSum > total ? `$${(shareSum - total).toFixed(2)} over` : `$${(total - shareSum).toFixed(2)} left`}
                </Text>
              )}
            </View>
            {people.map((p, i) => (
              <View key={p.key} style={[s.bkRow, i < people.length - 1 && { borderBottomWidth: 1, borderBottomColor: "#F5F5F5" }]}>
                <View style={[s.bkDot, { backgroundColor: p.key === "_you" ? "#1F2937" : C[(i - 1) % C.length] }]} />
                <Text style={s.bkName} numberOfLines={1}>{p.name}</Text>
                <View style={s.bkInputWrap}>
                  {splitMethod === "exact" && <Text style={s.bkPre}>$</Text>}
                  <TextInput
                    style={s.bkInput}
                    value={customSplits[p.key] ?? ""}
                    onChangeText={v => setCustomSplits(prev => ({ ...prev, [p.key]: v.replace(/[^0-9.]/g, "") }))}
                    keyboardType="decimal-pad"
                    placeholder={splitMethod === "shares" ? "1" : "0"}
                    placeholderTextColor="#D1D5DB"
                  />
                  {splitMethod === "percent" && <Text style={s.bkSuf}>%</Text>}
                  {splitMethod === "shares" && <Text style={s.bkSuf}>×</Text>}
                </View>
                {total > 0 && <Text style={s.bkShare}>${shares.find(x => x.key === p.key)?.share.toFixed(2)}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        <View style={s.descWrap}>
          <Ionicons name="create-outline" size={18} color="#9CA3AF" />
          <TextInput style={s.descInput} value={description} onChangeText={setDescription} placeholder="What's it for?" placeholderTextColor="#C4C4C4" returnKeyType="done" onSubmitEditing={save} />
        </View>

        {/* Recurring option */}
        <View style={s.recurWrap}>
          <Ionicons name="repeat" size={16} color={recurring !== "none" ? "#3D8E62" : "#9CA3AF"} />
          <Text style={[s.recurLabel, recurring !== "none" && { color: "#3D8E62" }]}>Repeat</Text>
          <View style={s.recurOptions}>
            {([["none", "Off"], ["weekly", "Weekly"], ["biweekly", "Biweekly"], ["monthly", "Monthly"]] as const).map(([val, label]) => (
              <TouchableOpacity key={val} style={[s.recurChip, recurring === val && s.recurChipOn]} onPress={() => setRecurring(val)}>
                <Text style={[s.recurChipText, recurring === val && s.recurChipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {error && <Text style={s.err}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7FAF8" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7FAF8" },

  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  barTitle: { fontSize: 17, fontWeight: "700", color: "#1F2937" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#3D8E62", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  pillOff: { opacity: 0.3 },
  pillText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  chips: { gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  chipStatic: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EEF7F2", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipLabel: { fontSize: 13, fontWeight: "600", color: "#1F2937" },
  chipBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: "#EEF7F2" },
  chipBarLabel: { fontSize: 13, color: "#6B7280" },
  chipBarNames: { fontSize: 13, fontWeight: "700", color: "#3D8E62", flex: 1 },

  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#F0F0F0" },
  searchInput: { flex: 1, fontSize: 16, color: "#1F2937" },

  list: { flex: 1, paddingHorizontal: 20, marginTop: 12 },
  label: { fontSize: 11, fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 12 },
  rowOn: { backgroundColor: "#F0F9F4", marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 12 },
  av: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avT: { color: "#fff", fontWeight: "700", fontSize: 13 },
  gIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "#EEF7F2", alignItems: "center", justifyContent: "center" },
  rowName: { flex: 1, fontSize: 15, fontWeight: "600", color: "#1F2937" },
  rowMeta: { fontSize: 12, color: "#9CA3AF" },
  ck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  ckOn: { borderColor: "#3D8E62", backgroundColor: "#3D8E62" },

  amtWrap: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", paddingVertical: 28 },
  amtSign: { fontSize: 32, fontWeight: "300", color: "#9CA3AF", marginTop: 6 },
  amtInput: { fontSize: 52, fontWeight: "800", color: "#1F2937", minWidth: 50, textAlign: "center", letterSpacing: -2 },

  splitRow: { flexDirection: "row", gap: 6, marginBottom: 16 },
  splitBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 9, borderRadius: 10, backgroundColor: "#F3F4F6" },
  splitBtnOn: { backgroundColor: "#3D8E62" },
  splitLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280" },

  eqBadge: { alignItems: "center", marginBottom: 20 },
  eqText: { fontSize: 14, fontWeight: "700", color: "#3D8E62", backgroundColor: "#EEF7F2", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, overflow: "hidden" },

  bkCard: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#F0F0F0", padding: 14, marginBottom: 16 },
  bkHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  bkTitle: { fontSize: 12, fontWeight: "700", color: "#6B7280" },
  bkBadge: { fontSize: 12, fontWeight: "700", color: "#3D8E62" },
  bkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8 },
  bkDot: { width: 8, height: 8, borderRadius: 4 },
  bkName: { width: 55, fontSize: 14, fontWeight: "600", color: "#1F2937" },
  bkInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: "#F0F0F0" },
  bkPre: { fontSize: 13, color: "#9CA3AF", fontWeight: "600" },
  bkSuf: { fontSize: 12, color: "#9CA3AF", fontWeight: "600", marginLeft: 2 },
  bkInput: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1F2937", paddingVertical: 7 },
  bkShare: { width: 55, fontSize: 13, fontWeight: "700", color: "#374151", textAlign: "right" },

  descWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: "#F0F0F0", marginBottom: 12 },
  descInput: { flex: 1, fontSize: 15, color: "#1F2937" },
  recurWrap: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  recurLabel: { fontSize: 14, fontWeight: "600", color: "#9CA3AF" },
  recurOptions: { flexDirection: "row", gap: 6, flex: 1, justifyContent: "flex-end" },
  recurChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "#F3F4F6" },
  recurChipOn: { backgroundColor: "#3D8E62" },
  recurChipText: { fontSize: 12, fontWeight: "700", color: "#6B7280" },
  recurChipTextOn: { color: "#fff" },

  err: { fontSize: 13, color: "#DC2626", textAlign: "center", marginTop: 8, paddingHorizontal: 20 },

  confirmWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  confirmIcon: { marginBottom: 20 },
  confirmTitle: { fontSize: 24, fontWeight: "900", color: "#1F2937", marginBottom: 8 },
  confirmSub: { fontSize: 15, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3D8E62", paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, width: "100%", marginBottom: 12 },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  confirmBtnOutline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 2, borderColor: "#3D8E62", paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, width: "100%", marginBottom: 8 },
  confirmBtnOutlineText: { color: "#3D8E62", fontWeight: "700", fontSize: 16 },
});
