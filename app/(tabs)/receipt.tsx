import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApiFetch } from "../../lib/api";
import { useReceiptSplitWithOptions, type Step } from "../../hooks/useReceiptSplit";
import { useTheme } from "../../lib/theme-context";
import { colors, font, fontSize, shadow, radii, space } from "../../lib/theme";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "assign", label: "Assign" },
  { key: "summary", label: "Summary" },
];

const PC = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#FF5A5F", "#9B59B6", "#334155"];
function pColor(i: number) { return PC[i % PC.length]; }

// Demo-only: compute minimal settlement suggestions (paid vs owed) so Summary feels real.
type DemoMemberBalance = { memberId: string; paid: number; owed: number; total: number };
type DemoSettlementSuggestion = { fromMemberId: string; toMemberId: string; amount: number };
function computeBalancesDemo(
  paidRows: { member_id: string; amount: number }[],
  owedRows: { member_id: string; amount: number }[],
  paidSettlements: { payer_member_id: string; amount: number }[] = [],
  receivedSettlements: { receiver_member_id: string; amount: number }[] = []
): Map<string, DemoMemberBalance> {
  const map = new Map<string, DemoMemberBalance>();
  function ensure(id: string) {
    if (!map.has(id)) map.set(id, { memberId: id, paid: 0, owed: 0, total: 0 });
    return map.get(id)!;
  }
  for (const r of paidRows) ensure(r.member_id).paid += Number(r.amount);
  for (const r of owedRows) ensure(r.member_id).owed += Number(r.amount);
  for (const s of paidSettlements) ensure(s.payer_member_id).total += Number(s.amount);
  for (const s of receivedSettlements) ensure(s.receiver_member_id).total -= Number(s.amount);
  for (const m of map.values()) {
    m.total += m.paid - m.owed;
    m.paid = Math.round(m.paid * 100) / 100;
    m.owed = Math.round(m.owed * 100) / 100;
    m.total = Math.round(m.total * 100) / 100;
  }
  return map;
}

function getSuggestedSettlementsDemo(balances: Map<string, DemoMemberBalance>): DemoSettlementSuggestion[] {
  const compare = (a: { memberId: string; total: number }, b: { memberId: string; total: number }) => {
    if (a.total > 0 && b.total < 0) return -1;
    if (a.total < 0 && b.total > 0) return 1;
    return a.memberId.localeCompare(b.memberId);
  };
  const arr = Array.from(balances.values())
    .filter((b) => Math.round(b.total * 100) / 100 !== 0)
    .map((b) => ({ memberId: b.memberId, total: b.total }))
    .sort(compare);

  const suggestions: DemoSettlementSuggestion[] = [];
  while (arr.length >= 2) {
    const first = arr[0];
    const last = arr[arr.length - 1];
    if (first.total <= 0 || last.total >= 0) break;
    const amount = first.total + last.total;
    if (first.total > -last.total) {
      const amt = Math.round(-last.total * 100) / 100;
      if (amt > 0) suggestions.push({ fromMemberId: last.memberId, toMemberId: first.memberId, amount: amt });
      first.total = amount;
      arr.pop();
    } else {
      const amt = Math.round(first.total * 100) / 100;
      if (amt > 0) suggestions.push({ fromMemberId: last.memberId, toMemberId: first.memberId, amount: amt });
      last.total = amount;
      arr.shift();
    }
  }
  return suggestions.filter((s) => Math.round(s.amount * 100) / 100 > 0);
}

type Contact = {
  displayName: string;
  email: string | null;
  groupId: string;
  groupName: string;
  memberId: string;
  memberCount: number;
  hasAccount: boolean;
};

export default function ReceiptScreen() {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const rs = useReceiptSplitWithOptions(apiFetch, { demo: isDemoOn });
  const stepIdx = STEPS.findIndex((s) => s.key === rs.step);

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: theme.background }]} edges={["top"]}>
      <View style={st.receiptTopBar}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)");
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView style={st.kv} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={[st.scroll, { backgroundColor: theme.background }]} contentContainerStyle={st.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={st.header}>
          <View style={[st.headerIcon, { backgroundColor: theme.primaryLight }]}><Ionicons name="receipt-outline" size={22} color={theme.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: theme.text }]}>Split Receipt</Text>
            <Text style={[st.headerSub, { color: theme.textQuaternary }]}>Scan a receipt and split items with friends</Text>
          </View>
        </View>

        {/* Step indicator */}
        <View style={st.steps}>
          {STEPS.map((s, i) => (
            <View key={s.key} style={st.stepWrap}>
              <View style={[st.stepDot, { backgroundColor: theme.border }, i < stepIdx && { backgroundColor: theme.primary }, i === stepIdx && { backgroundColor: theme.primary }, i > stepIdx && { backgroundColor: theme.surfaceTertiary }]}>
                {i < stepIdx ? <Ionicons name="checkmark" size={11} color="#fff" /> : <Text style={[st.stepNum, i === stepIdx && { color: "#fff" }]}>{i + 1}</Text>}
              </View>
              <Text style={[st.stepLabel, { color: theme.primary }, i === stepIdx && { color: theme.text, fontWeight: "700" }, i > stepIdx && { color: theme.textQuaternary }]}>{s.label}</Text>
              {i < STEPS.length - 1 && <View style={[st.stepLine, { backgroundColor: theme.border }, i < stepIdx && { backgroundColor: theme.primary }]} />}
            </View>
          ))}
        </View>

        {rs.step === "upload" && <UploadStep rs={rs} />}
        {rs.step === "review" && <ReviewStep rs={rs} />}
        {rs.step === "assign" && <AssignStep rs={rs} apiFetch={apiFetch} isDemoOn={isDemoOn} demo={demo} />}
        {rs.step === "summary" && <SummaryStep rs={rs} apiFetch={apiFetch} isDemoOn={isDemoOn} demo={demo} />}
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ═══════════════════ Step 1: Upload ═══════════════════ */

function UploadStep({ rs }: { rs: ReturnType<typeof useReceiptSplitWithOptions> }) {
  const { theme } = useTheme();
  const pick = async (camera: boolean) => {
    const { status: lib } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const { status: cam } = await ImagePicker.requestCameraPermissionsAsync();
    if (camera && cam !== "granted") { Alert.alert("Permission needed", "Allow camera access."); return; }
    if (!camera && lib !== "granted") { Alert.alert("Permission needed", "Allow photo access."); return; }
    const pickerOpts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 0.85,
      exif: false,
    };
    const result = camera
      ? await ImagePicker.launchCameraAsync(pickerOpts)
      : await ImagePicker.launchImageLibraryAsync(pickerOpts);
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) return;
    const raw = asset.mimeType ?? "image/jpeg";
    const mimeType = (raw === "image/heic" || raw === "image/heif") ? "image/jpeg" : raw;
    const ext = mimeType.split("/")[1] ?? "jpg";
    await rs.uploadReceipt(asset.uri, { mimeType, name: `receipt.${ext}` });
  };

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
      if (result.canceled) return;
      const doc = result.assets[0];
      if (doc?.uri) await rs.uploadReceipt(doc.uri, { mimeType: doc.mimeType ?? "application/pdf", name: doc.name ?? "receipt.pdf" });
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  if (rs.uploading) {
    const msg = rs.uploadStage === "uploading" ? "Uploading image…" : rs.uploadStage === "reading" ? "Reading receipt…" : rs.uploadStage === "extracting" ? "Extracting items…" : "Cleaning up…";
    return <View style={st.center}><ActivityIndicator size="large" color={theme.primary} /><Text style={[st.centerText, { color: theme.textTertiary }]}>{msg}</Text></View>;
  }

  if (rs.uploadError) {
    return (
      <View style={st.center}>
        <Text style={[st.errorText, { color: theme.error }]}>{rs.uploadError}</Text>
        <TouchableOpacity style={[st.btn, { backgroundColor: theme.primary }]} onPress={() => pick(false)}><Text style={st.btnText}>Try again</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <TouchableOpacity style={[st.uploadArea, { borderColor: theme.inputBorder, backgroundColor: theme.surface }]} onPress={() => pick(false)} activeOpacity={0.8}>
        <View style={[st.uploadIcon, { backgroundColor: theme.primaryLight }]}><Ionicons name="camera" size={28} color={theme.primary} /></View>
        <Text style={[st.uploadTitle, { color: theme.text }]}>Take or pick a photo</Text>
        <Text style={[st.uploadSub, { color: theme.textQuaternary }]}>PNG, JPG, or PDF</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity style={[st.uploadBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => pick(true)}>
          <Ionicons name="camera" size={18} color={theme.primary} /><Text style={[st.uploadBtnText, { color: theme.primary }]}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.uploadBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={pickPdf}>
          <Ionicons name="document-text" size={18} color={theme.primary} /><Text style={[st.uploadBtnText, { color: theme.primary }]}>PDF</Text>
        </TouchableOpacity>
      </View>
      {rs.imageUri && !rs.isPdf && <Image source={{ uri: rs.imageUri }} style={st.preview} resizeMode="contain" />}
      {rs.imageUri && rs.isPdf && (
        <View style={[st.pdfPreview, { backgroundColor: theme.surface, borderColor: theme.border }]}><Ionicons name="document-text" size={40} color={theme.primary} /><Text style={[st.pdfText, { color: theme.textSecondary }]}>PDF selected</Text></View>
      )}
    </View>
  );
}

/* ═══════════════════ Step 2: Review (REDESIGNED) ═══════════════════ */

function ReviewStep({ rs }: { rs: ReturnType<typeof useReceiptSplitWithOptions> }) {
  const { theme } = useTheme();
  const recalcSubtotal = useCallback(() => {
    const sub = rs.editItems.reduce((s, i) => s + i.totalPrice, 0);
    rs.setEditSubtotal(Math.round(sub * 100) / 100);
  }, [rs.editItems]);

  useEffect(() => { recalcSubtotal(); }, [rs.editItems]);

  useEffect(() => {
    rs.setEditTotal(Math.round((rs.editSubtotal + rs.editTax + rs.editTip) * 100) / 100);
  }, [rs.editSubtotal, rs.editTax, rs.editTip]);

  return (
    <View style={{ gap: 16 }}>
      {/* Merchant */}
      <View>
        <Text style={[st.label, { color: theme.textTertiary }]}>Merchant</Text>
        <TextInput style={[st.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={rs.editMerchant} onChangeText={rs.setEditMerchant} placeholder="Restaurant name" placeholderTextColor={theme.inputPlaceholder} />
      </View>

      {/* Editable items */}
      <View>
        <Text style={[st.label, { color: theme.textTertiary }]}>Items</Text>
        {rs.editItems.map((item, idx) => (
          <View key={item.id} style={[st.itemCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <View style={st.itemTop}>
              <TextInput
                style={[st.itemNameInput, { color: theme.text, borderBottomColor: theme.borderLight }]}
                value={item.name}
                onChangeText={(v) => rs.updateItem(item.id, { name: v })}
                placeholder="Item name"
                placeholderTextColor={theme.inputPlaceholder}
              />
              <TouchableOpacity onPress={() => rs.removeItem(item.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={theme.error} />
              </TouchableOpacity>
            </View>
            <View style={st.itemBottom}>
              {/* Quantity stepper */}
              <View style={[st.stepper, { backgroundColor: theme.surfaceTertiary }]}>
                <TouchableOpacity
                  style={st.stepperBtn}
                  onPress={() => { if (item.quantity > 1) rs.updateItem(item.id, { quantity: item.quantity - 1 }); }}
                >
                  <Ionicons name="remove" size={16} color={item.quantity <= 1 ? theme.border : theme.textSecondary} />
                </TouchableOpacity>
                <Text style={[st.stepperVal, { color: theme.text }]}>{item.quantity}</Text>
                <TouchableOpacity
                  style={st.stepperBtn}
                  onPress={() => rs.updateItem(item.id, { quantity: item.quantity + 1 })}
                >
                  <Ionicons name="add" size={16} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={[st.itemX, { color: theme.textQuaternary }]}>×</Text>
              {/* Unit price */}
              <View style={[st.priceWrap, { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight }]}>
                <Text style={[st.pricePre, { color: theme.textQuaternary }]}>$</Text>
                <DecimalInput
                  style={[st.priceInput, { color: theme.text }]}
                  numValue={item.unitPrice}
                  onValueChange={(n) => rs.updateItem(item.id, { unitPrice: n })}
                />
              </View>
              <Text style={[st.itemEquals, { color: theme.textQuaternary }]}>=</Text>
              <Text style={[st.itemTotal, { color: theme.text }]}>${item.totalPrice.toFixed(2)}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={[st.addItemBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={rs.addItem}>
          <Ionicons name="add-circle-outline" size={20} color={theme.primary} />
          <Text style={[st.addItemText, { color: theme.primary }]}>Add item</Text>
        </TouchableOpacity>
      </View>

      {/* Totals */}
      <View style={[st.totalsCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
        <TotalRow label="Subtotal" value={rs.editSubtotal} editable={false} />
        <TotalRow label="Tax" value={rs.editTax} onChange={(v) => rs.setEditTax(v)} />
        <TotalRow label="Tip" value={rs.editTip} onChange={(v) => rs.setEditTip(v)} />
        <View style={[st.totalDivider, { backgroundColor: theme.border }]} />
        <View style={st.totalFinalRow}>
          <Text style={[st.totalFinalLabel, { color: theme.text }]}>Total</Text>
          <Text style={[st.totalFinalValue, { color: theme.text }]}>${rs.editTotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* Nav */}
      <View style={st.nav}>
        <TouchableOpacity style={st.navBack} onPress={() => rs.setStep("upload")}>
          <Ionicons name="chevron-back" size={18} color={theme.textTertiary} /><Text style={[st.navBackText, { color: theme.textTertiary }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.btn, { backgroundColor: theme.primary }, (rs.saving || rs.editItems.length === 0) && st.btnOff]}
          onPress={rs.confirmItems}
          disabled={rs.saving || rs.editItems.length === 0}
        >
          {rs.saving ? <ActivityIndicator size="small" color="#fff" /> : (
            <><Text style={st.btnText}>Continue</Text><Ionicons name="chevron-forward" size={16} color="#fff" /></>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DecimalInput({ numValue, onValueChange, style }: { numValue: number; onValueChange: (n: number) => void; style?: any }) {
  const [text, setText] = useState(String(numValue));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(numValue)); }, [numValue, focused]);
  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={(v) => {
        const cleaned = v.replace(/[^0-9.]/g, "");
        setText(cleaned);
        const num = parseFloat(cleaned);
        if (!isNaN(num)) onValueChange(num);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const num = parseFloat(text) || 0;
        onValueChange(num);
        setText(String(num));
      }}
      keyboardType="decimal-pad"
      selectTextOnFocus
    />
  );
}

function TotalRow({ label, value, editable = true, onChange }: { label: string; value: number; editable?: boolean; onChange?: (v: number) => void }) {
  const { theme } = useTheme();
  return (
    <View style={st.totalRow}>
      <Text style={[st.totalLabel, { color: theme.textTertiary }]}>{label}</Text>
      {editable && onChange ? (
        <View style={[st.totalInputWrap, { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight }]}>
          <Text style={[st.totalPre, { color: theme.textQuaternary }]}>$</Text>
          <DecimalInput
            style={[st.totalInput, { color: theme.text }]}
            numValue={value}
            onValueChange={onChange}
          />
        </View>
      ) : (
        <Text style={[st.totalVal, { color: theme.textSecondary }]}>${value.toFixed(2)}</Text>
      )}
    </View>
  );
}

function ItemSearch({ value, onChange, theme }: { value: string; onChange: (v: string) => void; theme: any }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: theme.surfaceSecondary, borderRadius: radii.md,
      borderWidth: 1, borderColor: theme.borderLight,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
    }}>
      <Ionicons name="search" size={16} color={theme.textQuaternary} />
      <TextInput
        style={{ flex: 1, fontSize: 14, fontFamily: font.regular, color: theme.text, padding: 0 }}
        value={value}
        onChangeText={onChange}
        placeholder="Search items..."
        placeholderTextColor={theme.inputPlaceholder}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

/* ═══════════════════ Step 3: Assign (REDESIGNED) ═══════════════════ */

function AssignStep({
  rs,
  apiFetch,
  isDemoOn,
  demo,
}: {
  rs: ReturnType<typeof useReceiptSplitWithOptions>;
  apiFetch: (path: string, opts?: any) => Promise<Response>;
  isDemoOn: boolean;
  demo: ReturnType<typeof useDemoData>;
}) {
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return rs.itemsWithExtras;
    return rs.itemsWithExtras.filter(item => item.name.toLowerCase().includes(q));
  }, [rs.itemsWithExtras, itemSearch]);

  useEffect(() => {
    if (isDemoOn) {
      // Demo contacts come from demo group member lists.
      const groups = Object.values(demo.groupDetails ?? {});
      const contactsBuilt: Contact[] = [];
      for (const g of groups) {
        for (const m of g.members ?? []) {
          contactsBuilt.push({
            displayName: m.display_name,
            email: m.email,
            groupId: g.id,
            groupName: g.name,
            memberId: m.id,
            memberCount: g.members?.length ?? 0,
            hasAccount: Boolean(m.user_id),
          });
        }
      }
      setContacts(contactsBuilt);
      return;
    }
    apiFetch("/api/groups/people").then(r => r.json()).then(d => setContacts(d.people ?? [])).catch(() => {});
  }, [apiFetch, isDemoOn, demo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts.slice(0, 6);
    return contacts.filter(c => c.displayName.toLowerCase().includes(q)).slice(0, 6);
  }, [contacts, search]);

  const addFromContact = (c: Contact) => {
    rs.addPerson(c.displayName, { memberId: c.memberId, email: c.email, hasAccount: c.hasAccount });
    setSearch("");
  };

  const addNew = () => {
    const name = search.trim();
    if (!name) return;
    const match = contacts.find(c => c.displayName.toLowerCase() === name.toLowerCase());
    if (match) addFromContact(match);
    else { rs.addPerson(name, { hasAccount: false }); setSearch(""); }
  };

  const unassignedCount = rs.itemsWithExtras.filter(item => (rs.assignments.get(item.id) ?? []).length === 0).length;
  const allAssigned = unassignedCount === 0 && rs.itemsWithExtras.length > 0;

  const personTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of rs.itemsWithExtras) {
      const assignees = rs.assignments.get(item.id) ?? [];
      if (assignees.length === 0) continue;
      const share = item.finalPrice / assignees.length;
      for (const a of assignees) {
        const key = a.name.toLowerCase();
        totals.set(key, (totals.get(key) ?? 0) + share);
      }
    }
    return totals;
  }, [rs.itemsWithExtras, rs.assignments]);

  return (
    <View style={{ gap: 16 }}>
      {/* People section */}
      <View>
        <Text style={[st.label, { color: theme.textTertiary }]}>People at the table</Text>
        <View style={st.peopleRow}>
          {rs.people.map((p, i) => (
            <TouchableOpacity key={p.name} style={[st.personChip, { backgroundColor: pColor(i) }]} onPress={() => rs.removePerson(p.name)}>
              <Text style={st.personChipText}>{p.name}</Text>
              <Ionicons name="close" size={12} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          ))}
        </View>
        <View style={st.addPersonRow}>
          <TextInput style={[st.searchInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={search} onChangeText={setSearch} placeholder="Search contacts or type a name" placeholderTextColor={theme.inputPlaceholder} onSubmitEditing={addNew} />
          <TouchableOpacity style={[st.addBtn, { backgroundColor: theme.primary }, !search.trim() && st.btnOff]} onPress={addNew} disabled={!search.trim()}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {filtered.length > 0 && search.length > 0 && (
          <View style={[st.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {filtered.map(c => (
              <TouchableOpacity key={`${c.groupId}-${c.memberId}`} style={[st.dropdownRow, { borderBottomColor: theme.borderLight }]} onPress={() => addFromContact(c)}>
                <Text style={[st.dropdownName, { color: theme.text }]}>{c.displayName}</Text>
                {c.email && <Text style={[st.dropdownEmail, { color: theme.textQuaternary }]} numberOfLines={1}>{c.email}</Text>}
              </TouchableOpacity>
            ))}
            {search.trim() && !contacts.some(c => c.displayName.toLowerCase() === search.trim().toLowerCase()) && (
              <TouchableOpacity style={[st.dropdownRow, { borderBottomColor: theme.borderLight }]} onPress={() => { rs.addPerson(search.trim(), { hasAccount: false }); setSearch(""); }}>
                <Ionicons name="person-add-outline" size={14} color={theme.primary} />
                <Text style={[st.dropdownAdd, { color: theme.primary }]}>Add "{search.trim()}"</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Items with inline assignment */}
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={[st.label, { color: theme.textTertiary, marginBottom: 0 }]}>Assign items</Text>
          {rs.itemsWithExtras.length > 4 && (
            <Text style={{ fontSize: 12, color: theme.textQuaternary }}>{rs.itemsWithExtras.length} items</Text>
          )}
        </View>
        {rs.itemsWithExtras.length > 5 && (
          <ItemSearch value={itemSearch} onChange={setItemSearch} theme={theme} />
        )}
        {rs.people.length === 0 && (
          <View style={st.emptyAssign}>
            <Ionicons name="person-add-outline" size={24} color={theme.border} />
            <Text style={[st.emptyAssignText, { color: theme.textQuaternary }]}>Add people above to start assigning items</Text>
          </View>
        )}
        {filteredItems.length === 0 && itemSearch.trim() && (
          <View style={st.emptyAssign}>
            <Ionicons name="search-outline" size={24} color={theme.border} />
            <Text style={[st.emptyAssignText, { color: theme.textQuaternary }]}>No items matching "{itemSearch.trim()}"</Text>
          </View>
        )}
        {filteredItems.map((item) => {
          const assigned = rs.assignments.get(item.id) ?? [];
          const isAssigned = assigned.length > 0;
          const isUnassigned = !isAssigned && rs.people.length > 0;
          return (
            <View key={item.id} style={[st.assignCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }, isAssigned && { borderColor: theme.primaryLight }, isUnassigned && { borderColor: theme.warningLight, backgroundColor: theme.warningLight }]}>
              <View style={st.assignCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.assignItemName, { color: theme.text }]}>{item.name}</Text>
                  <Text style={[st.assignItemMeta, { color: theme.textQuaternary }]}>
                    ${item.totalPrice.toFixed(2)}
                    {item.proportionalExtra > 0 ? ` + $${item.proportionalExtra.toFixed(2)} tax/tip` : ""}
                    {" = "}
                    <Text style={{ fontWeight: "700", color: theme.text }}>${item.finalPrice.toFixed(2)}</Text>
                  </Text>
                </View>
                {rs.people.length > 0 && (
                  <TouchableOpacity style={[st.everyoneBtn, { backgroundColor: theme.primaryLight }]} onPress={() => rs.assignAll(item.id)}>
                    <Ionicons name="people" size={14} color={theme.primary} />
                    <Text style={[st.everyoneBtnText, { color: theme.primary }]}>All</Text>
                  </TouchableOpacity>
                )}
              </View>
              {rs.people.length > 0 && (
                <View style={st.assignChips}>
                  {rs.people.map((person, pIdx) => {
                    const on = assigned.some(a => a.name.toLowerCase() === person.name.toLowerCase());
                    return (
                      <TouchableOpacity
                        key={person.name}
                        style={[st.assignChip, on ? { backgroundColor: pColor(pIdx) } : { backgroundColor: theme.surfaceTertiary }]}
                        onPress={() => rs.toggleAssignment(item.id, person)}
                        activeOpacity={0.7}
                      >
                        <Text style={[st.assignChipText, { color: theme.textTertiary }, on && { color: "#fff" }]}>
                          {person.name}
                          {on && assigned.length > 1 ? ` $${(item.finalPrice / assigned.length).toFixed(2)}` : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Per-person running totals */}
      {rs.people.length > 0 && personTotals.size > 0 && (
        <View style={[st.runningTotals, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <Text style={[st.label, { color: theme.textTertiary }]}>Running totals</Text>
          {rs.people.map((p, i) => {
            const total = personTotals.get(p.name.toLowerCase()) ?? 0;
            return (
              <View key={p.name} style={st.runningRow}>
                <View style={[st.runningDot, { backgroundColor: pColor(i) }]} />
                <Text style={[st.runningName, { color: theme.text }]}>{p.name}</Text>
                <Text style={[st.runningAmount, { color: theme.text }]}>${total.toFixed(2)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Nav */}
      <View style={st.nav}>
        <TouchableOpacity style={st.navBack} onPress={() => rs.setStep("review")}>
          <Ionicons name="chevron-back" size={18} color={theme.textTertiary} /><Text style={[st.navBackText, { color: theme.textTertiary }]}>Back</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {!allAssigned && rs.people.length > 0 && unassignedCount > 0 && (
            <Text style={{ fontSize: 12, color: theme.error }}>
              {unassignedCount} item{unassignedCount > 1 ? "s" : ""} unassigned
            </Text>
          )}
          <TouchableOpacity
            style={[st.btn, { backgroundColor: theme.primary }, (!allAssigned || rs.people.length === 0 || rs.saving) && st.btnOff]}
            onPress={async () => { await rs.saveAssignments(); rs.computeSummary(); }}
            disabled={!allAssigned || rs.people.length === 0 || rs.saving}
          >
            {rs.saving ? <ActivityIndicator size="small" color="#fff" /> : (
              <><Text style={st.btnText}>View Summary</Text><Ionicons name="chevron-forward" size={16} color="#fff" /></>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/* ═══════════════════ Step 4: Summary ═══════════════════ */

function SummaryStep({
  rs,
  apiFetch,
  isDemoOn,
  demo,
}: {
  rs: ReturnType<typeof useReceiptSplitWithOptions>;
  apiFetch: (path: string, opts?: any) => Promise<Response>;
  isDemoOn: boolean;
  demo: ReturnType<typeof useDemoData>;
}) {
  const { theme } = useTheme();
  const grandTotal = rs.personShares.reduce((s, p) => s + p.totalOwed, 0);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [groupBalances, setGroupBalances] = useState<Array<{ memberId: string; name: string; total: number }>>([]);
  const [suggestions, setSuggestions] = useState<Array<{ fromMemberId: string; toMemberId: string; fromName: string; toName: string; amount: number }>>([]);
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<Array<{ id: string; displayName: string; email: string | null }>>([]);
  const [requestingPayment, setRequestingPayment] = useState<string | null>(null);
  const [recordedSettlements, setRecordedSettlements] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isDemoOn) {
      const demoGroups = demo.summary?.groups ?? [];
      setGroups(demoGroups.map((g) => ({ id: g.id, name: g.name })));
      if (demoGroups.length > 0) setSelectedGroupId(demoGroups[0].id);
      return;
    }
    apiFetch("/api/groups")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.groups ?? [];
        setGroups(list);
        if (list.length > 0) setSelectedGroupId(list[0].id);
      })
      .catch(() => {});
  }, [apiFetch, isDemoOn, demo.summary]);

  const handleFinish = async (opts?: { stayForSettle?: boolean; groupId?: string }) => {
    const gid = opts?.groupId ?? selectedGroupId;
    if (!gid || !rs.receiptId) return;
    setFinishing(true);

    if (isDemoOn) {
      const group = demo.groupDetails?.[gid];
      if (!group) {
        Alert.alert("Error", "Group not found");
        setFinishing(false);
        return;
      }

      const groupMembers = group.members ?? [];
      const payer = groupMembers.find((m) => m.user_id === "me") ?? groupMembers[0];
      if (!payer?.id) {
        Alert.alert("Error", "Missing payer");
        setFinishing(false);
        return;
      }

      const owedRows = rs.personShares
        .filter((p) => !!p.memberId)
        .map((p) => ({ member_id: p.memberId as string, amount: p.totalOwed }));

      const paidRows = [{ member_id: payer.id, amount: grandTotal }];
      const balances = computeBalancesDemo(paidRows, owedRows);
      const demoSuggestions = getSuggestedSettlementsDemo(balances);

      const memberMap = new Map(groupMembers.map((m) => [m.id, m.display_name]));
      const membersForUi = groupMembers.map((m) => ({ id: m.id, displayName: m.display_name, email: m.email ?? null }));

      setFinished(true);
      setGroupBalances([]);
      setSuggestions(
        demoSuggestions.map((s) => ({
          fromMemberId: s.fromMemberId,
          toMemberId: s.toMemberId,
          fromName: memberMap.get(s.fromMemberId) ?? "Unknown",
          toName: memberMap.get(s.toMemberId) ?? "Unknown",
          amount: s.amount,
        }))
      );
      setGroupName(group.name ?? "");
      setMembers(membersForUi);
      setFinishing(false);
      return;
    }

    try {
      const res = await apiFetch(`/api/receipt/${rs.receiptId}/finish`, { method: "POST", body: { groupId: gid, people: rs.people.map(p => ({ name: p.name, email: p.email })) } });
      const data = await res.json();
      if (res.ok) { setFinished(true); setGroupBalances(data.balances || []); setSuggestions(data.suggestions || []); setGroupName(data.groupName || ""); setMembers(data.members || []); }
      else { Alert.alert("Error", data.error || "Failed"); setFinishing(false); }
    } catch { Alert.alert("Error", "Failed"); setFinishing(false); }
  };

  const handleSettleNoGroup = async () => {
    if (!rs.receiptId) return;
    setFinishing(true);
    try {
      const res = await apiFetch("/api/groups", { method: "POST", body: { name: rs.editMerchant ? `${rs.editMerchant} split` : "New group", ownerDisplayName: "You" } });
      const gd = await res.json();
      if (!res.ok || !gd.id) { Alert.alert("Error", gd.error ?? "Failed"); setFinishing(false); return; }
      setGroups(prev => [...prev, { id: gd.id, name: gd.name || "New group" }]);
      setSelectedGroupId(gd.id);
      await handleFinish({ stayForSettle: true, groupId: gd.id });
    } catch { Alert.alert("Error", "Failed"); setFinishing(false); }
  };

  const handleRequest = async (s: (typeof suggestions)[0]) => {
    if (isDemoOn) {
      const key = `${s.fromMemberId}-${s.toMemberId}`;
      setRequestingPayment(key);
      try {
        const mail = members.find((m) => m.id === s.fromMemberId)?.email;
        if (mail) {
          Linking.openURL(
            `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(
              `Payment: $${s.amount.toFixed(2)}`
            )}&body=${encodeURIComponent(
              `You owe $${s.amount.toFixed(2)} for ${groupName || "our receipt split"}.`
            )}`
          );
        } else {
          Alert.alert("No email", "Add their email to send a request.");
        }
      } finally {
        setRequestingPayment(null);
      }
      return;
    }
    const key = `${s.fromMemberId}-${s.toMemberId}`;
    setRequestingPayment(key);
    try {
      const res = await apiFetch("/api/stripe/create-payment-link", { method: "POST", body: { amount: s.amount, description: `${rs.editMerchant || "Receipt"} split`, recipientName: s.fromName, groupId: selectedGroupId, payerMemberId: s.fromMemberId, receiverMemberId: s.toMemberId } });
      const data = await res.json();
      if (res.ok && data.url) {
        await Share.share({ message: `You owe me $${s.amount.toFixed(2)} for ${groupName || "our receipt split"}. Pay here: ${data.url}`, url: data.url, title: "Payment request" });
      } else {
        const payer = members.find(m => m.id === s.fromMemberId);
        if (payer?.email) { Linking.openURL(`mailto:${payer.email}?subject=${encodeURIComponent(`Payment: $${s.amount.toFixed(2)}`)}&body=${encodeURIComponent(`You owe $${s.amount.toFixed(2)} for ${groupName}.`)}`); }
        else Alert.alert("No email", "Add their email to send a request.");
      }
    } finally { setRequestingPayment(null); }
  };

  const handleCash = async (s: (typeof suggestions)[0]) => {
    if (isDemoOn) {
      const key = `${s.fromMemberId}-${s.toMemberId}`;
      setRecordedSettlements((prev) => new Set(prev).add(key));
      return;
    }
    const key = `${s.fromMemberId}-${s.toMemberId}`;
    try {
      const res = await apiFetch("/api/settlements", { method: "POST", body: { groupId: selectedGroupId, payerMemberId: s.fromMemberId, receiverMemberId: s.toMemberId, amount: s.amount, method: "in_person" } });
      if (res.ok) setRecordedSettlements(prev => new Set(prev).add(key));
      else Alert.alert("Error", "Could not record");
    } catch { Alert.alert("Error", "Could not record"); }
  };

  return (
    <View style={{ gap: 20 }}>
      <Text style={[st.summaryTitle, { color: theme.textTertiary }]}>
        {rs.editMerchant ? <Text style={{ fontWeight: "700", color: theme.text }}>{rs.editMerchant}</Text> : null}
        {rs.editMerchant ? " — " : ""}${grandTotal.toFixed(2)} total
      </Text>

      {/* Per-person shares */}
      {rs.personShares.map((person, idx) => (
        <View key={person.name} style={[st.shareCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <View style={[st.shareHeader, { backgroundColor: theme.surfaceSecondary }]}>
            <View style={[st.shareAv, { backgroundColor: pColor(idx) }]}>
              <Text style={st.shareAvText}>{person.name.slice(0, 2).toUpperCase()}</Text>
            </View>
            <Text style={[st.shareName, { color: theme.text }]}>{person.name}</Text>
            <Text style={[st.shareTotal, { color: theme.text }]}>${person.totalOwed.toFixed(2)}</Text>
          </View>
          <View style={st.shareItems}>
            {person.items.map((item, i) => (
              <View key={i} style={st.shareItemRow}>
                <Text style={[st.shareItemName, { color: theme.textTertiary }]}>{item.itemName}</Text>
                <Text style={[st.shareItemAmt, { color: theme.textSecondary }]}>${item.shareAmount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {/* Actions */}
      {!finished && (
        <View style={{ gap: 12 }}>
          <Text style={[st.label, { color: theme.textTertiary }]}>What next?</Text>
          <View style={[st.actionCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[st.actionTitle, { color: theme.text }]}>Settle now</Text>
            <Text style={[st.actionSub, { color: theme.textQuaternary }]}>{groups.length > 0 ? "Save to a group and share payment links." : "Create a group and settle."}</Text>
            {groups.length > 1 && (
              <View style={st.groupPicker}>
                {groups.map(g => (
                  <TouchableOpacity key={g.id} style={[st.groupChip, { backgroundColor: theme.surfaceTertiary }, selectedGroupId === g.id && { backgroundColor: theme.primaryLight }]} onPress={() => setSelectedGroupId(g.id)}>
                    <Text style={[st.groupChipText, { color: theme.textTertiary }, selectedGroupId === g.id && { color: theme.primary, fontWeight: "700" }]}>{g.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity style={[st.btn, { backgroundColor: theme.primary }, finishing && st.btnOff]} onPress={() => groups.length > 0 ? handleFinish({ stayForSettle: true }) : handleSettleNoGroup()} disabled={finishing}>
              {finishing ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={st.btnText}>Save & settle</Text></>}
            </TouchableOpacity>
          </View>
          <View style={[st.actionCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[st.actionTitle, { color: theme.text }]}>Track for later</Text>
            <Text style={[st.actionSub, { color: theme.textQuaternary }]}>Add to shared expenses, settle whenever.</Text>
            <TouchableOpacity style={[st.btnOutline, { borderColor: theme.primary }, (!selectedGroupId || finishing) && st.btnOff]} onPress={() => handleFinish()} disabled={!selectedGroupId || finishing}>
              <Ionicons name="people" size={18} color={theme.primary} /><Text style={[st.btnOutlineText, { color: theme.primary }]}>Add to group</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Post-save */}
      {finished && (
        <View style={{ gap: 16 }}>
          <View style={[st.successCard, { backgroundColor: theme.successLight, borderColor: theme.success }]}><Ionicons name="checkmark-circle" size={22} color={theme.success} /><Text style={[st.successText, { color: theme.positive }]}>Saved to group!</Text></View>
          {suggestions.filter(s => !recordedSettlements.has(`${s.fromMemberId}-${s.toMemberId}`)).map((s, i) => (
            <View key={i} style={[st.suggRow, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <Text style={[st.suggText, { color: theme.textSecondary }]}><Text style={{ fontWeight: "700" }}>{s.fromName}</Text> → <Text style={{ fontWeight: "700" }}>{s.toName}</Text> <Text style={{ color: theme.positive, fontWeight: "700" }}>${s.amount.toFixed(2)}</Text></Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                <TouchableOpacity style={[st.suggBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => handleCash(s)}><Text style={[st.suggBtnText, { color: theme.textTertiary }]}>Paid</Text></TouchableOpacity>
                <TouchableOpacity style={[st.suggBtn, { borderColor: theme.primary, backgroundColor: theme.primaryLight }]} onPress={() => handleRequest(s)} disabled={requestingPayment !== null}>
                  {requestingPayment === `${s.fromMemberId}-${s.toMemberId}` ? <ActivityIndicator size="small" color={theme.primary} /> : <><Ionicons name="send" size={12} color={theme.primary} /><Text style={[st.suggBtnGreenText, { color: theme.primary }]}>Share</Text></>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.suggBtn, st.suggBtnTap]}
                  onPress={() => router.push({ pathname: "/(tabs)/pay", params: { amount: s.amount.toFixed(2), groupId: selectedGroupId, payerMemberId: s.fromMemberId, receiverMemberId: s.toMemberId } })}
                >
                  <Ionicons name="phone-portrait-outline" size={12} color="#4A6CF7" />
                  <Text style={st.suggBtnTapText}>Tap to Pay</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={[st.btn, { backgroundColor: theme.primary }]} onPress={() => router.replace("/(tabs)/shared")}><Text style={st.btnText}>View expenses</Text></TouchableOpacity>
            <TouchableOpacity style={[st.btnOutline, { borderColor: theme.primary }]} onPress={rs.reset}><Text style={[st.btnOutlineText, { color: theme.primary }]}>New receipt</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {/* Nav */}
      <View style={st.nav}>
        <TouchableOpacity style={st.navBack} onPress={() => rs.setStep("assign")} disabled={finishing || finished}>
          <Ionicons name="chevron-back" size={18} color={theme.textTertiary} /><Text style={[st.navBackText, { color: theme.textTertiary }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.navBack} onPress={rs.reset} disabled={finishing}>
          <Ionicons name="refresh" size={16} color={theme.textTertiary} /><Text style={[st.navBackText, { color: theme.textTertiary }]}>New</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ═══════════════════ Styles ═══════════════════ */

const st = StyleSheet.create({
  safe: { flex: 1 },
  receiptTopBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  kv: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 20, paddingBottom: 60 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  headerIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: font.extrabold, fontWeight: "800", color: colors.text },
  headerSub: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, marginTop: 2 },

  steps: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  stepWrap: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepDot: { width: 24, height: 24, borderRadius: radii.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.border },
  stepDone: { backgroundColor: colors.primary },
  stepActive: { backgroundColor: colors.primary },
  stepPending: { backgroundColor: colors.borderLight },
  stepNum: { fontSize: 11, fontFamily: font.bold, fontWeight: "700", color: colors.textMuted },
  stepLabel: { fontSize: 11, fontFamily: font.semibold, fontWeight: "600", color: colors.primary, marginLeft: 4 },
  stepLabelActive: { color: colors.text, fontFamily: font.bold, fontWeight: "700" },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.border, marginHorizontal: 4 },

  center: { alignItems: "center", paddingVertical: 48 },
  centerText: { fontSize: 14, fontFamily: font.regular, color: colors.textTertiary, marginTop: 12 },
  errorText: { fontSize: 14, fontFamily: font.regular, color: colors.red, marginBottom: 16 },

  uploadArea: { borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, borderRadius: radii.xl, padding: 28, alignItems: "center", backgroundColor: colors.surface },
  uploadIcon: { width: 56, height: 56, borderRadius: radii.lg, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  uploadTitle: { fontSize: 16, fontFamily: font.bold, fontWeight: "700", color: colors.text },
  uploadSub: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, marginTop: 4 },
  uploadBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  uploadBtnText: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600", color: colors.primary },
  preview: { width: "100%", height: 180, borderRadius: radii.md, backgroundColor: colors.borderLight },
  pdfPreview: { height: 120, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 8 },
  pdfText: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600", color: colors.textSecondary },

  label: { fontSize: 11, fontFamily: font.bold, fontWeight: "700", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: font.regular, color: colors.text },

  // Review — editable item cards
  itemCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: 12, marginBottom: 8, ...shadow.md },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  itemNameInput: { flex: 1, fontSize: 15, fontFamily: font.semibold, fontWeight: "600", color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, paddingBottom: 4 },
  itemBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.borderLight, borderRadius: radii.sm, overflow: "hidden" },
  stepperBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  stepperVal: { fontSize: 14, fontFamily: font.bold, fontWeight: "700", color: colors.text, minWidth: 20, textAlign: "center" },
  itemX: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted },
  priceWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radii.sm, paddingHorizontal: 6, borderWidth: 1, borderColor: colors.borderSubtle },
  pricePre: { fontSize: 13, fontFamily: font.semibold, color: colors.textMuted, fontWeight: "600" },
  priceInput: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600", color: colors.text, paddingVertical: 4, minWidth: 50 },
  itemEquals: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted },
  itemTotal: { fontSize: 15, fontFamily: font.extrabold, fontWeight: "800", color: colors.text },
  addItemBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  addItemText: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600", color: colors.primary },

  // Totals
  totalsCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, gap: 10, ...shadow.md },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 14, fontFamily: font.regular, color: colors.textTertiary },
  totalVal: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600", color: colors.textSecondary },
  totalInputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radii.sm, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.borderSubtle },
  totalPre: { fontSize: 13, fontFamily: font.semibold, color: colors.textMuted, fontWeight: "600" },
  totalInput: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600", color: colors.text, paddingVertical: 6, width: 70, textAlign: "right" },
  totalDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  totalFinalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalFinalLabel: { fontSize: 15, fontFamily: font.bold, fontWeight: "700", color: colors.text },
  totalFinalValue: { fontSize: 18, fontFamily: font.black, fontWeight: "900", color: colors.text },

  // Assign — people
  peopleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  personChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii["2xl"] },
  personChipText: { color: "#fff", fontFamily: font.semibold, fontWeight: "600", fontSize: 13 },
  addPersonRow: { flexDirection: "row", gap: 8 },
  searchInput: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: font.regular, color: colors.text },
  addBtn: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  dropdown: { backgroundColor: colors.surface, borderRadius: radii.md, overflow: "hidden", marginTop: 6, ...shadow.md },
  dropdownRow: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: "#F5F5F5", gap: 8 },
  dropdownName: { fontSize: 15, fontFamily: font.medium, fontWeight: "500", color: colors.text, flex: 1 },
  dropdownEmail: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted },
  dropdownAdd: { fontSize: 14, fontFamily: font.semibold, color: colors.primary, fontWeight: "600" },

  // Assign — item cards
  emptyAssign: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyAssignText: { fontSize: 13, fontFamily: font.regular, color: colors.textFaint },
  assignCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14, marginBottom: 8, ...shadow.md },
  assignCardDone: {},
  assignCardWarn: { backgroundColor: "#FFFBEB" },
  assignCardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  assignItemName: { fontSize: 15, fontFamily: font.bold, fontWeight: "700", color: colors.text },
  assignItemMeta: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 3 },
  everyoneBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm, backgroundColor: colors.primaryLight },
  everyoneBtnText: { fontSize: 12, fontFamily: font.bold, color: colors.primary, fontWeight: "700" },
  assignChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  assignChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii["2xl"] },
  assignChipOff: { backgroundColor: colors.borderLight },
  assignChipText: { fontSize: 13, fontFamily: font.semibold, fontWeight: "600", color: colors.textTertiary },

  // Running totals
  runningTotals: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 14, ...shadow.md },
  runningRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  runningDot: { width: 10, height: 10, borderRadius: 5 },
  runningName: { flex: 1, fontSize: 14, fontFamily: font.semibold, fontWeight: "600", color: colors.text },
  runningAmount: { fontSize: 15, fontFamily: font.extrabold, fontWeight: "800", color: colors.text },

  // Summary
  summaryTitle: { fontSize: 14, fontFamily: font.regular, color: colors.textTertiary },
  shareCard: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: "hidden", ...shadow.md },
  shareHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10, backgroundColor: colors.surfaceRaised },
  shareAv: { width: 32, height: 32, borderRadius: radii.xl, alignItems: "center", justifyContent: "center" },
  shareAvText: { fontSize: 11, fontFamily: font.bold, fontWeight: "700", color: "#fff" },
  shareName: { fontSize: 15, fontFamily: font.semibold, fontWeight: "600", color: colors.text, flex: 1 },
  shareTotal: { fontSize: 15, fontFamily: font.extrabold, fontWeight: "800", color: colors.text },
  shareItems: { paddingHorizontal: 14, paddingVertical: 8 },
  shareItemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  shareItemName: { fontSize: 12, fontFamily: font.regular, color: colors.textTertiary },
  shareItemAmt: { fontSize: 12, fontFamily: font.semibold, fontWeight: "600", color: colors.textSecondary },

  actionCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, gap: 10, ...shadow.md },
  actionTitle: { fontSize: 15, fontFamily: font.bold, fontWeight: "700", color: colors.text },
  actionSub: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted },
  groupPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  groupChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.sm, backgroundColor: colors.borderLight },
  groupChipOn: { backgroundColor: colors.primaryLight },
  groupChipText: { fontSize: 13, fontFamily: font.medium, fontWeight: "500", color: colors.textTertiary },

  successCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.greenSurface, padding: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.greenBorder },
  successText: { fontSize: 14, fontFamily: font.bold, fontWeight: "700", color: colors.greenDark },
  suggRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: 12, backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSubtle },
  suggText: { fontSize: 13, fontFamily: font.regular, color: colors.textSecondary, flex: 1 },
  suggBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  suggBtnGreen: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  suggBtnText: { fontSize: 12, fontFamily: font.medium, fontWeight: "500", color: colors.textTertiary },
  suggBtnGreenText: { fontSize: 12, fontFamily: font.semibold, fontWeight: "600", color: colors.primary },
  suggBtnTap: { borderColor: colors.blue, backgroundColor: colors.blueBg },
  suggBtnTapText: { fontSize: 12, fontFamily: font.semibold, fontWeight: "600", color: colors.blue },

  // Shared
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingVertical: 13, paddingHorizontal: 20, borderRadius: radii.md },
  btnText: { color: "#fff", fontFamily: font.bold, fontWeight: "700", fontSize: 15 },
  btnOff: { opacity: 0.4 },
  btnOutline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, paddingHorizontal: 20, borderRadius: radii.md, borderWidth: 2, borderColor: colors.primary },
  btnOutlineText: { color: colors.primary, fontFamily: font.bold, fontWeight: "700", fontSize: 15 },
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 12 },
  navBack: { flexDirection: "row", alignItems: "center", gap: 4 },
  navBackText: { fontSize: 14, fontFamily: font.medium, color: colors.textTertiary, fontWeight: "500" },
});
