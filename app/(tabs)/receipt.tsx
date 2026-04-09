import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { sfx } from "../../lib/sounds";
import { exportReceiptPdf } from "../../lib/receipt-pdf";

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
  const scrollRef = useRef<ScrollView>(null);

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: theme.background }]} edges={["top"]}>
      {/* Clean top bar: back + title */}
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
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.topBarTitle, { color: theme.text }]}>Split Receipt</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Minimal progress bar */}
      <View style={st.progressRow}>
        {STEPS.map((s, i) => (
          <View key={s.key} style={st.progressSegWrap}>
            <View style={[st.progressSeg, { backgroundColor: theme.surfaceTertiary }, i <= stepIdx && { backgroundColor: theme.primary }]} />
            <Text style={[st.progressSegLabel, { color: theme.textQuaternary }, i === stepIdx && { color: theme.text, fontFamily: font.bold, fontWeight: "700" }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView style={st.kv} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <ScrollView
          ref={scrollRef}
          style={[st.scroll, { backgroundColor: theme.background }]}
          contentContainerStyle={st.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >

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
    if (camera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Allow camera access."); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Allow photo access."); return; }
    }
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

  const hasSavedReceipt = Boolean(rs.receiptId && rs.editItems.length > 0);

  return (
    <View style={{ gap: 16 }}>
      {hasSavedReceipt && (
        <TouchableOpacity
          style={[st.savedReceiptBanner, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}
          onPress={() => rs.setStep("review")}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.savedReceiptTitle, { color: theme.primary }]}>
              {rs.editMerchant || "Receipt"} · {rs.editItems.length} item{rs.editItems.length !== 1 ? "s" : ""}
            </Text>
            <Text style={[st.savedReceiptSub, { color: theme.primary }]}>
              Tap to continue where you left off
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.primary} />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[st.uploadArea, { borderColor: theme.inputBorder, backgroundColor: theme.surface }]} onPress={() => pick(false)} activeOpacity={0.8}>
        <View style={[st.uploadIcon, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="cloud-upload-outline" size={26} color={theme.primary} />
        </View>
        <Text style={[st.uploadTitle, { color: theme.text }]}>
          {hasSavedReceipt ? "Scan a different receipt" : "Tap to scan or pick a photo"}
        </Text>
        <Text style={[st.uploadSub, { color: theme.textQuaternary }]}>PNG, JPG, or PDF</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity style={[st.uploadBtn, { backgroundColor: theme.primary }]} onPress={() => pick(true)} activeOpacity={0.8}>
          <Ionicons name="camera" size={16} color="#fff" />
          <Text style={[st.uploadBtnText, { color: "#fff" }]}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.uploadBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={pickPdf} activeOpacity={0.8}>
          <Ionicons name="document-text-outline" size={16} color={theme.text} />
          <Text style={[st.uploadBtnText, { color: theme.text }]}>PDF</Text>
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
        <TextInput style={[st.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={rs.editMerchant} onChangeText={rs.setEditMerchant} placeholder="Restaurant name" placeholderTextColor={theme.inputPlaceholder} maxLength={500} />
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
                maxLength={500}
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

      {rs.saveError && (
        <Text style={[st.errorText, { color: theme.error }]}>{rs.saveError}</Text>
      )}
      {/* Nav */}
      <View style={st.nav}>
        <TouchableOpacity style={st.navBack} onPress={() => rs.setStep("upload")}>
          <Ionicons name="chevron-back" size={18} color={theme.textTertiary} /><Text style={[st.navBackText, { color: theme.textTertiary }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.btn, { backgroundColor: theme.primary }, (rs.saving || rs.editItems.length === 0) && st.btnOff]}
          onPress={() => { sfx.pop(); rs.confirmItems(); }}
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
  const [text, setText] = useState(numValue.toFixed(2));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(numValue.toFixed(2)); }, [numValue, focused]);
  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={(v) => {
        const cleaned = v.replace(/[^0-9.]/g, "");
        const parts = cleaned.split(".");
        let capped = parts[0];
        if (parts.length > 1) {
          capped += "." + parts[1].slice(0, 2);
        }
        setText(capped);
        const num = parseFloat(capped);
        if (!isNaN(num)) onValueChange(Math.round(num * 100) / 100);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const num = parseFloat(text) || 0;
        const rounded = Math.round(num * 100) / 100;
        onValueChange(rounded);
        setText(rounded.toFixed(2));
      }}
      keyboardType="decimal-pad"
      selectTextOnFocus
      maxLength={500}
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
        maxLength={500}
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
    rs.addPerson(c.displayName, { memberId: c.memberId, email: c.email, hasAccount: c.hasAccount, groupId: c.groupId, groupName: c.groupName });
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
          <TextInput style={[st.searchInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={search} onChangeText={setSearch} placeholder="Search contacts or type a name" placeholderTextColor={theme.inputPlaceholder} onSubmitEditing={addNew} maxLength={500} />
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
            onPress={async () => {
              sfx.success();
              try {
                await rs.saveAssignments();
              } catch {
                Alert.alert("Error", "Failed to save assignments. Please try again.");
                return;
              }
              rs.computeSummary();
            }}
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

function buildShareText(merchant: string, personShares: Array<{ name: string; totalOwed: number; items: Array<{ itemName: string; shareAmount: number }> }>, grandTotal: number) {
  const lines: string[] = [];
  lines.push(`${merchant || "Receipt"} Split — $${grandTotal.toFixed(2)} total`);
  lines.push("");
  for (const p of personShares) {
    lines.push(`${p.name}: $${p.totalOwed.toFixed(2)}`);
    for (const item of p.items) {
      lines.push(`  ${item.itemName} — $${item.shareAmount.toFixed(2)}`);
    }
    lines.push("");
  }
  lines.push("Sent via Coconut");
  return lines.join("\n");
}

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
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [resolvedGroupId, setResolvedGroupId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ fromMemberId: string; toMemberId: string; fromName: string; toName: string; amount: number }>>([]);
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<Array<{ id: string; displayName: string; email: string | null }>>([]);
  const [recordedSettlements, setRecordedSettlements] = useState<Set<string>>(new Set());

  const detectedGroupId = useMemo(() => {
    const ids = rs.people.map(p => p.groupId).filter(Boolean) as string[];
    if (ids.length === 0) return null;
    const unique = [...new Set(ids)];
    return unique.length === 1 ? unique[0] : null;
  }, [rs.people]);

  const detectedGroupName = useMemo(() => {
    if (!detectedGroupId) return null;
    return rs.people.find(p => p.groupId === detectedGroupId)?.groupName ?? null;
  }, [rs.people, detectedGroupId]);

  const autoSave = useCallback(async () => {
    if (!rs.receiptId || finishing || finished) return;
    setFinishing(true);

    let gid = detectedGroupId;

    if (isDemoOn) {
      if (!gid) {
        setFinished(true);
        setFinishing(false);
        return;
      }
      const group = demo.groupDetails?.[gid];
      if (!group) { setFinished(true); setFinishing(false); return; }

      const groupMembers = group.members ?? [];
      const payer = groupMembers.find((m) => m.user_id === "me") ?? groupMembers[0];
      if (!payer?.id) { setFinished(true); setFinishing(false); return; }

      const owedRows = rs.personShares
        .filter((p) => !!p.memberId)
        .map((p) => ({ member_id: p.memberId as string, amount: p.totalOwed }));
      const paidRows = [{ member_id: payer.id, amount: grandTotal }];
      const balances = computeBalancesDemo(paidRows, owedRows);
      const demoSuggestions = getSuggestedSettlementsDemo(balances);
      const memberMap = new Map(groupMembers.map((m) => [m.id, m.display_name]));

      setFinished(true);
      setResolvedGroupId(gid);
      setSuggestions(demoSuggestions.map((s) => ({
        fromMemberId: s.fromMemberId, toMemberId: s.toMemberId,
        fromName: memberMap.get(s.fromMemberId) ?? "Unknown",
        toName: memberMap.get(s.toMemberId) ?? "Unknown",
        amount: s.amount,
      })));
      setGroupName(group.name ?? "");
      setMembers(groupMembers.map((m) => ({ id: m.id, displayName: m.display_name, email: m.email ?? null })));
      setFinishing(false);
      return;
    }

    try {
      if (!gid) {
        const res = await apiFetch("/api/groups", {
          method: "POST",
          body: { name: rs.editMerchant ? `${rs.editMerchant} split` : "Receipt split", ownerDisplayName: "You" },
        });
        const gd = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (res.ok && gd.id) gid = gd.id;
        else {
          Alert.alert("Error", gd?.error ?? "Could not create group for this split.");
          return;
        }
      }

      setResolvedGroupId(gid);
      const res = await apiFetch(`/api/receipt/${rs.receiptId}/finish`, {
        method: "POST",
        body: { groupId: gid, people: rs.people.map(p => ({ name: p.name, email: p.email })) },
      });
      const data = (await res.json().catch(() => ({}))) as {
        suggestions?: Array<{ fromMemberId: string; toMemberId: string; fromName: string; toName: string; amount: number }>;
        groupName?: string;
        members?: Array<{ id: string; displayName: string; email: string | null }>;
        error?: string;
      };
      if (res.ok) {
        setFinished(true);
        setSuggestions(data.suggestions || []);
        setGroupName(data.groupName || "");
        setMembers(data.members || []);
      } else {
        Alert.alert("Error", data?.error ?? "Failed to save receipt split.");
      }
    } catch {
      Alert.alert("Error", "Could not save receipt split.");
    } finally {
      setFinishing(false);
    }
  }, [rs.receiptId, rs.people, rs.personShares, rs.editMerchant, detectedGroupId, isDemoOn, demo, apiFetch, finishing, finished, grandTotal]);

  useEffect(() => { autoSave(); }, []);

  const [exportingPdf, setExportingPdf] = useState(false);

  const handleShareText = async () => {
    const text = buildShareText(rs.editMerchant, rs.personShares, grandTotal);
    try {
      await Share.share({ message: text, title: `${rs.editMerchant || "Receipt"} Split` });
    } catch { /* cancelled */ }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReceiptPdf(apiFetch, rs.editMerchant, rs.personShares);
    } catch (e) {
      Alert.alert("PDF Export", "Could not generate PDF. Try sharing as text instead.");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCash = async (s: (typeof suggestions)[0]) => {
    if (isDemoOn) {
      setRecordedSettlements((prev) => new Set(prev).add(`${s.fromMemberId}-${s.toMemberId}`));
      return;
    }
    const key = `${s.fromMemberId}-${s.toMemberId}`;
    try {
      const res = await apiFetch("/api/settlements", { method: "POST", body: { groupId: resolvedGroupId, payerMemberId: s.fromMemberId, receiverMemberId: s.toMemberId, amount: s.amount, method: "in_person" } });
      if (res.ok) setRecordedSettlements(prev => new Set(prev).add(key));
      else Alert.alert("Error", "Could not record");
    } catch { Alert.alert("Error", "Could not record"); }
  };

  const [toast, setToast] = useState<string | null>(null);
  const [tabbedPeople, setTabbedPeople] = useState<Set<string>>(new Set());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleTabPerson = async (person: typeof rs.personShares[0]) => {
    const key = person.name.toLowerCase();
    if (tabbedPeople.has(key)) return;
    if (!isDemoOn && resolvedGroupId) {
      try {
        await apiFetch(`/api/groups/${resolvedGroupId}/tab`, {
          method: "POST",
          body: { personName: person.name, memberId: person.memberId, amount: person.totalOwed, description: rs.editMerchant || "Receipt split" },
        });
      } catch { /* still mark as tabbed locally */ }
    }
    setTabbedPeople(prev => new Set(prev).add(key));
    sfx.pop();
    showToast(`Added $${person.totalOwed.toFixed(2)} to ${person.name}'s tab`);
  };

  const handleTabAll = async () => {
    const untabbed = rs.personShares.filter(
      (p) => !tabbedPeople.has(p.name.toLowerCase())
    );
    if (!isDemoOn && resolvedGroupId) {
      await Promise.all(
        untabbed.map((person) =>
          apiFetch(`/api/groups/${resolvedGroupId}/tab`, {
            method: "POST",
            body: { personName: person.name, memberId: person.memberId, amount: person.totalOwed, description: rs.editMerchant || "Receipt split" },
          }).catch(() => {})
        )
      );
    }
    setTabbedPeople((prev) => {
      const next = new Set(prev);
      for (const p of untabbed) next.add(p.name.toLowerCase());
      return next;
    });
    sfx.coin();
    showToast(`Added to everyone's tab`);
  };

  if (finishing) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[st.centerText, { color: theme.textTertiary }]}>Saving...</Text>
      </View>
    );
  }

  const allTabbed = rs.personShares.every(p => tabbedPeople.has(p.name.toLowerCase()));

  return (
    <View style={{ gap: 20 }}>
      {/* Toast */}
      {toast && (
        <View style={{ position: "absolute", top: -50, left: 0, right: 0, zIndex: 99, alignItems: "center" }}>
          <View style={{ backgroundColor: "#1a1a1a", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }}>
            <Text style={{ color: "#fff", fontSize: 13, fontFamily: font.semibold, fontWeight: "600" }}>{toast}</Text>
          </View>
        </View>
      )}

      {/* Receipt summary card */}
      <View style={[smst.receiptCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight }]}>
        <Text style={[smst.receiptMeta, { color: theme.textTertiary }]}>
          {rs.editMerchant || "Receipt"} · {rs.editItems.length} line{rs.editItems.length !== 1 ? "s" : ""}
        </Text>
        <Text style={[smst.receiptTotal, { color: theme.text }]}>${grandTotal.toFixed(2)}</Text>
        <Text style={[smst.receiptPaid, { color: theme.textQuaternary }]}>
          Paid by You · {rs.personShares.length} {rs.personShares.length === 1 ? "person" : "people"}
        </Text>
      </View>

      {/* They owe you */}
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[st.label, { color: theme.textTertiary, marginBottom: 0 }]}>They owe you</Text>
          {rs.personShares.length > 1 && !allTabbed && (
            <TouchableOpacity onPress={handleTabAll} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.md, backgroundColor: theme.surfaceTertiary }}>
              <Ionicons name="layers-outline" size={14} color={theme.primary} />
              <Text style={{ fontSize: 12, fontFamily: font.semibold, fontWeight: "600", color: theme.primary }}>Tab all</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {rs.personShares.map((person, idx) => {
        const isTabbed = tabbedPeople.has(person.name.toLowerCase());
        return (
          <View key={person.name} style={[smst.personCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <View style={smst.personHeader}>
              <View style={[st.shareAv, { backgroundColor: pColor(idx) }]}>
                <Text style={st.shareAvText}>{person.name.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[smst.personName, { color: theme.text }]}>{person.name}</Text>
                <Text style={[smst.personSub, { color: theme.textQuaternary }]}>their share</Text>
              </View>
              <Text style={[smst.personAmount, { color: theme.positive }]}>${person.totalOwed.toFixed(2)}</Text>
            </View>

            {/* Item breakdown */}
            <View style={smst.personItems}>
              {person.items.map((item, i) => (
                <View key={i} style={st.shareItemRow}>
                  <Text style={[st.shareItemName, { color: theme.textTertiary }]}>{item.itemName}</Text>
                  <Text style={[st.shareItemAmt, { color: theme.textSecondary }]}>${item.shareAmount.toFixed(2)}</Text>
                </View>
              ))}
            </View>

            {/* Action buttons */}
            <View style={smst.personActions}>
              <TouchableOpacity
                style={[smst.settleBtn, { backgroundColor: theme.text }]}
                onPress={() => { sfx.paymentTap(); router.push({ pathname: "/(tabs)/pay", params: { amount: person.totalOwed.toFixed(2), currency: "USD", groupId: resolvedGroupId ?? "" } }); }}
                activeOpacity={0.8}
              >
                <Ionicons name="wifi" size={14} color={theme.surface} style={{ transform: [{ rotate: "90deg" }] }} />
                <Text style={[smst.settleBtnText, { color: theme.surface }]}>Settle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[smst.tabBtn, { borderColor: theme.border, backgroundColor: isTabbed ? theme.successLight : theme.surface }]}
                onPress={() => handleTabPerson(person)}
                disabled={isTabbed}
                activeOpacity={0.7}
              >
                {isTabbed ? (
                  <><Ionicons name="checkmark" size={14} color={theme.success} /><Text style={[smst.tabBtnText, { color: theme.success }]}>Tabbed</Text></>
                ) : (
                  <Text style={[smst.tabBtnText, { color: theme.textSecondary }]}>Tab it</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {/* Export row */}
      <View style={smst.exportRow}>
        <TouchableOpacity onPress={handleShareText} style={[smst.exportBtn, { borderColor: theme.border }]} activeOpacity={0.7}>
          <Ionicons name="share-social-outline" size={15} color={theme.text} />
          <Text style={[smst.exportBtnText, { color: theme.text }]}>Share text</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleExportPdf} style={[smst.exportBtn, { borderColor: theme.border }]} activeOpacity={0.7} disabled={exportingPdf}>
          {exportingPdf ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <Ionicons name="document-outline" size={15} color={theme.text} />
          )}
          <Text style={[smst.exportBtnText, { color: theme.text }]}>Export PDF</Text>
        </TouchableOpacity>
      </View>

      {/* Done */}
      <TouchableOpacity style={[smst.doneBtn, { backgroundColor: theme.text }]} onPress={rs.reset} activeOpacity={0.8}>
        <Text style={[smst.doneBtnText, { color: theme.surface }]}>Done</Text>
      </TouchableOpacity>

      {/* Edit link */}
      <TouchableOpacity style={{ alignSelf: "center", paddingVertical: 8 }} onPress={() => rs.setStep("assign")} disabled={finished}>
        <Text style={{ fontSize: 14, fontFamily: font.medium, fontWeight: "500", color: theme.textTertiary }}>
          <Ionicons name="chevron-back" size={12} color={theme.textTertiary} /> Edit assignments
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ═══════════════════ Styles ═══════════════════ */

const st = StyleSheet.create({
  safe: { flex: 1 },
  receiptTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  topBarTitle: { fontSize: 17, fontFamily: font.bold, fontWeight: "700", letterSpacing: -0.3 },
  progressRow: { flexDirection: "row", gap: 6, paddingHorizontal: 20, paddingBottom: 14 },
  progressSegWrap: { flex: 1, gap: 4 },
  progressSeg: { height: 3, borderRadius: 2, backgroundColor: colors.borderLight },
  progressSegLabel: { fontSize: 10, fontFamily: font.medium, fontWeight: "500", textAlign: "center", color: colors.textMuted },
  kv: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 20, paddingBottom: 60 },

  center: { alignItems: "center", paddingVertical: 48 },
  centerText: { fontSize: 14, fontFamily: font.regular, color: colors.textTertiary, marginTop: 12 },
  errorText: { fontSize: 14, fontFamily: font.regular, color: colors.red, marginBottom: 16 },

  savedReceiptBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radii.lg, borderWidth: 1.5 },
  savedReceiptTitle: { fontSize: 15, fontFamily: font.bold, fontWeight: "700" },
  savedReceiptSub: { fontSize: 13, fontFamily: font.regular, opacity: 0.8 },
  uploadArea: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: 20, paddingVertical: 40, paddingHorizontal: 24, alignItems: "center", backgroundColor: colors.surface },
  uploadIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  uploadTitle: { fontSize: 15, fontFamily: font.semibold, fontWeight: "600", color: colors.text, textAlign: "center" },
  uploadSub: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 4 },
  uploadBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  uploadBtnText: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600" },
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

const smst = StyleSheet.create({
  receiptCard: { borderRadius: radii.lg, padding: 18, borderWidth: 1, gap: 4 },
  receiptMeta: { fontSize: 13, fontFamily: font.regular },
  receiptTotal: { fontSize: 32, fontFamily: font.black, fontWeight: "900", letterSpacing: -1 },
  receiptPaid: { fontSize: 13, fontFamily: font.regular },
  personCard: { borderRadius: radii.lg, padding: 16, borderWidth: 1, gap: 12, ...shadow.md },
  personHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  personName: { fontSize: 16, fontFamily: font.bold, fontWeight: "700" },
  personSub: { fontSize: 12, fontFamily: font.regular, marginTop: 1 },
  personAmount: { fontSize: 20, fontFamily: font.extrabold, fontWeight: "800" },
  personItems: { paddingLeft: 44, gap: 2 },
  personActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  settleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flex: 1, paddingVertical: 12, borderRadius: radii.xl },
  settleBtnText: { fontSize: 14, fontFamily: font.bold, fontWeight: "700" },
  tabBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, flex: 1, paddingVertical: 12, borderRadius: radii.xl, borderWidth: 1.5 },
  tabBtnText: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600" },
  exportRow: { flexDirection: "row", gap: 10 },
  exportBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  exportBtnText: { fontSize: 13, fontFamily: font.semibold, fontWeight: "600" },
  doneBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: radii.xl },
  doneBtnText: { fontSize: 16, fontFamily: font.bold, fontWeight: "700" },
});
