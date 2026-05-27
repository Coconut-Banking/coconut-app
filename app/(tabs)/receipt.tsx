import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  DeviceEventEmitter,
  Keyboard,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { receiptImagePickerOptions } from "../../lib/receipt-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "@clerk/expo";
import { useApiFetch, SKIP_AUTH } from "../../lib/api";
import { useReceiptSplitWithOptions, type Step } from "../../hooks/useReceiptSplit";
import { useTheme } from "../../lib/theme-context";
import { colors, font, fontSize, shadow, radii, space } from "../../lib/theme";
import { CoconutScreen } from "../../components/shell/CoconutScreen";
import { CoconutFlowHeader } from "../../components/shell/CoconutFlowHeader";
import { CoconutProgressSteps } from "../../components/shell/CoconutProgressSteps";
import { useCoconutShell } from "../../lib/coconut-shell";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useDemoData } from "../../lib/demo-context";
import { sfx } from "../../lib/sounds";
import { exportReceiptPdf } from "../../lib/receipt-pdf";
import {
  deliverPaymentLink,
  findSettlementForPerson,
} from "../../lib/payment-link";
import { takePendingReceiptScan } from "../../lib/pending-receipt-scan";
import {
  TAP_TO_PAY_SETTLED_EVENT,
  type TapToPaySettledPayload,
} from "../../lib/tap-to-pay-events";
import { dedupePeopleList } from "../../lib/group-people-dedupe";
import {
  receiptPersonAccent,
  receiptPersonAvatarBg,
  receiptPersonTint,
} from "../../lib/receipt-person-palette";
import { ReceiptUploadFailure } from "../../components/receipt/ReceiptUploadFailure";
import { ReceiptTableCollect } from "../../components/receipt/ReceiptTableCollect";
import { LinkQrSheet } from "../../components/share/LinkQrSheet";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "assign", label: "Assign" },
  { key: "summary", label: "Summary" },
];

function normalizePersonName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

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
  tableBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  tableBannerTitle: { fontSize: 15, fontFamily: font.bold },
  tableBannerSub: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  uploadCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  uploadIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  uploadTitle: { fontSize: 18, fontFamily: font.bold, textAlign: "center" },
  uploadSub: { fontSize: 13, fontFamily: font.regular, textAlign: "center", marginBottom: 8 },
  uploadPrimary: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: radii.lg,
    marginTop: 4,
  },
  uploadPrimaryText: { fontSize: 16, fontFamily: font.semibold },
  uploadSecondary: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: 4,
  },
  uploadSecondaryText: { fontSize: 14, fontFamily: font.semibold },
  uploadProgress: { paddingVertical: 32, alignItems: "center" },
  uploadProgressCard: {
    alignSelf: "stretch",
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 10,
  },
  uploadProgressTitle: { fontSize: 17, fontFamily: font.bold, marginTop: 8 },
  uploadProgressSub: { fontSize: 14, fontFamily: font.regular },

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

  // Assign — people (inline chip row)
  peopleCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  peopleInlineRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  peopleInlineLabel: { fontSize: 14, fontFamily: font.medium, lineHeight: 26, marginTop: 1 },
  peopleChipsWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  personChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  personAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  personAvatarText: { fontSize: 8, fontFamily: font.bold, fontWeight: "700" },
  personChipText: { fontFamily: font.semibold, fontWeight: "600", fontSize: 13 },
  peopleInlineInput: {
    flex: 1,
    minWidth: 96,
    fontSize: 14,
    fontFamily: font.regular,
    paddingVertical: 4,
  },
  duplicateHint: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  addPersonRow: { flexDirection: "row", gap: 8 },
  searchInput: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: font.regular, color: colors.text },
  addBtn: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  dropdown: { borderRadius: radii.md, overflow: "hidden", marginTop: 4, borderWidth: 1 },
  dropdownRow: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  dropdownName: { fontSize: 15, fontFamily: font.medium, fontWeight: "500", color: colors.text, flex: 1 },
  dropdownEmail: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted },
  dropdownAdd: { fontSize: 14, fontFamily: font.semibold, color: colors.primary, fontWeight: "600" },
  dropdownDisabled: { fontSize: 13, fontFamily: font.regular, fontStyle: "italic" },

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
  personActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 11,
    borderRadius: radii.xl,
    borderWidth: 1.5,
  },
  actionBtnPrimary: { borderWidth: 0 },
  actionBtnText: { fontSize: 13, fontFamily: font.semibold, fontWeight: "600" },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  exportBtnText: { fontSize: 14, fontFamily: font.semibold, fontWeight: "600" },
  doneBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: radii.xl },
  doneBtnText: { fontSize: 16, fontFamily: font.bold, fontWeight: "700" },
});

export default function ReceiptScreen() {
  const { pendingScanUri, pendingScanMime, pendingScanName } = useLocalSearchParams<{
    pendingScanUri?: string;
    pendingScanMime?: string;
    pendingScanName?: string;
  }>();
  const { theme } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();
  const apiFetch = useApiFetch();
  const { isDemoOn } = useDemoMode();
  const demo = useDemoData();
  const rs = useReceiptSplitWithOptions(apiFetch, { demo: isDemoOn });
  const stepIdx = STEPS.findIndex((s) => s.key === rs.step);
  const scrollRef = useRef<ScrollView>(null);
  const authReady = SKIP_AUTH || isDemoOn || (isLoaded && isSignedIn);
  const pendingUploadRef = useRef<{
    uri: string;
    mimeType: string;
    name: string;
  } | null>(null);

  const runPendingUpload = useCallback(
    (payload: { uri: string; mimeType: string; name: string }) => {
      if (!authReady || rs.uploading) {
        pendingUploadRef.current = payload;
        return;
      }
      pendingUploadRef.current = null;
      void rs.uploadReceipt(payload.uri, {
        mimeType: payload.mimeType,
        name: payload.name,
      });
    },
    [authReady, rs.uploading, rs.uploadReceipt],
  );

  useEffect(() => {
    const pending = pendingUploadRef.current;
    if (!pending || !authReady || rs.uploading) return;
    runPendingUpload(pending);
  }, [authReady, rs.uploading, runPendingUpload]);

  useFocusEffect(
    useCallback(() => {
      if (rs.uploading) return;
      const handoff = takePendingReceiptScan();
      const uri = handoff?.uri ?? pendingScanUri;
      if (!uri) return;
      const mimeType = handoff?.mimeType ?? pendingScanMime ?? "image/jpeg";
      const name =
        handoff?.name ??
        pendingScanName ??
        "receipt.jpg";
      if (pendingScanUri) {
        router.setParams({
          pendingScanUri: undefined,
          pendingScanMime: undefined,
          pendingScanName: undefined,
        });
      }
      runPendingUpload({ uri, mimeType, name });
    }, [
      rs.uploading,
      pendingScanUri,
      pendingScanMime,
      pendingScanName,
      runPendingUpload,
    ])
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  return (
    <CoconutScreen edges={["top", "bottom"]}>
      <CoconutFlowHeader title="Split receipt" onClose={goBack} leftIcon="back" />
      <CoconutProgressSteps steps={STEPS} currentIndex={stepIdx} />

      <Pressable style={st.kv} onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          ref={scrollRef}
          style={[st.scroll, { backgroundColor: theme.background }]}
          contentContainerStyle={st.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >

        {rs.step === "upload" && (
          <UploadStep rs={rs} onGoBack={goBack} onUploadImage={runPendingUpload} />
        )}
        {rs.step === "review" && <ReviewStep rs={rs} />}
        {rs.step === "assign" && <AssignStep rs={rs} apiFetch={apiFetch} isDemoOn={isDemoOn} demo={demo} />}
        {rs.step === "summary" && <SummaryStep rs={rs} apiFetch={apiFetch} isDemoOn={isDemoOn} demo={demo} />}
      </ScrollView>
    </Pressable>
    </CoconutScreen>
  );
}

/* ═══════════════════ Step 1: Upload ═══════════════════ */

function UploadStep({
  rs,
  onGoBack,
  onUploadImage,
}: {
  rs: ReturnType<typeof useReceiptSplitWithOptions>;
  onGoBack: () => void;
  onUploadImage: (payload: { uri: string; mimeType: string; name: string }) => void;
}) {
  const { theme } = useTheme();
  const shell = useCoconutShell();

  const pick = async (camera: boolean) => {
    rs.prepareForNewScan();
    if (camera) {
      router.push("/scan-receipt" as Href);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Allow photo access."); return; }
    const result = await ImagePicker.launchImageLibraryAsync(receiptImagePickerOptions());
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) return;
    const mimeType = asset.mimeType ?? "image/jpeg";
    const ext = (mimeType.split("/")[1] ?? "jpg").replace("heif", "heic");
    onUploadImage({
      uri: asset.uri,
      mimeType,
      name: `receipt.${ext}`,
    });
  };

  if (rs.uploading) {
    const msg = rs.uploadStage === "uploading" ? "Uploading…" : rs.uploadStage === "reading" ? "Reading receipt…" : rs.uploadStage === "extracting" ? "Extracting items…" : "Cleaning up…";
    return (
      <View style={st.uploadProgress}>
        <View style={[st.uploadProgressCard, { backgroundColor: shell.card, borderColor: shell.cardBorder }]}>
          <ActivityIndicator size="large" color={shell.cta} />
          <Text style={[st.uploadProgressTitle, { color: theme.text }]}>Scanning receipt</Text>
          <Text style={[st.uploadProgressSub, { color: theme.textTertiary }]}>{msg}</Text>
        </View>
      </View>
    );
  }

  if (rs.uploadError) {
    return (
      <ReceiptUploadFailure
        code={rs.uploadErrorCode ?? "generic"}
        message={rs.uploadError}
        imageUri={rs.imageUri}
        onScanAgain={() => {
          rs.prepareForNewScan();
          router.push("/scan-receipt" as Href);
        }}
        onPickPhoto={() => {
          rs.prepareForNewScan();
          void pick(false);
        }}
        onGoBack={onGoBack}
      />
    );
  }

  const hasSavedReceipt = Boolean(rs.receiptId && rs.editItems.length > 0);

  return (
    <View style={{ gap: 16 }}>
      {hasSavedReceipt && (
        <TouchableOpacity
          style={[st.savedReceiptBanner, { backgroundColor: shell.moneyInSoft, borderColor: shell.moneyInShadow }]}
          onPress={() => rs.setStep("review")}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.savedReceiptTitle, { color: shell.moneyInText }]}>
              {rs.editMerchant || "Receipt"} · {rs.editItems.length} item{rs.editItems.length !== 1 ? "s" : ""}
            </Text>
            <Text style={[st.savedReceiptSub, { color: shell.moneyInText }]}>
              Tap to continue where you left off
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={shell.moneyInText} />
        </TouchableOpacity>
      )}
      <View style={[st.uploadCard, { backgroundColor: shell.card, borderColor: shell.cardBorder }]}>
        <View style={[st.uploadIcon, { backgroundColor: shell.mintWash }]}>
          <Ionicons name="receipt-outline" size={30} color={shell.cta} />
        </View>
        <Text style={[st.uploadTitle, { color: theme.text }]}>
          {hasSavedReceipt ? "Scan another receipt" : "Add your receipt"}
        </Text>
        <Text style={[st.uploadSub, { color: theme.textQuaternary }]}>
          Paper receipt or photo from your library
        </Text>

        <TouchableOpacity
          style={[st.uploadPrimary, { backgroundColor: shell.cta }]}
          onPress={() => pick(true)}
          activeOpacity={0.88}
        >
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={[st.uploadPrimaryText, { color: "#fff" }]}>Take photo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.uploadSecondary, { backgroundColor: shell.mintWash, borderColor: shell.cardBorder }]}
          onPress={() => pick(false)}
          activeOpacity={0.88}
        >
          <Ionicons name="images-outline" size={18} color={shell.cta} />
          <Text style={[st.uploadSecondaryText, { color: shell.cta }]}>Choose from Photos</Text>
        </TouchableOpacity>
      </View>
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
  const { theme, isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [duplicateHint, setDuplicateHint] = useState<string | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const addedNameKeys = useMemo(
    () => new Set(rs.people.map((p) => normalizePersonName(p.name))),
    [rs.people]
  );

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return rs.itemsWithExtras;
    return rs.itemsWithExtras.filter((item) => item.name.toLowerCase().includes(q));
  }, [rs.itemsWithExtras, itemSearch]);

  useEffect(() => {
    if (isDemoOn) {
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
      setContacts(dedupePeopleList(contactsBuilt));
      return;
    }
    apiFetch("/api/groups/people")
      .then((r) => r.json())
      .then((d) => setContacts(dedupePeopleList((d.people ?? []) as Contact[])))
      .catch(() => {});
  }, [apiFetch, isDemoOn, demo]);

  const availableContacts = useMemo(
    () =>
      contacts.filter(
        (c) => !addedNameKeys.has(normalizePersonName(c.displayName))
      ),
    [contacts, addedNameKeys]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableContacts.slice(0, 6);
    return availableContacts
      .filter((c) => c.displayName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [availableContacts, search]);

  const trimmedSearch = search.trim();
  const searchKey = normalizePersonName(trimmedSearch);
  const searchIsDuplicate = searchKey.length > 0 && addedNameKeys.has(searchKey);
  const exactContactMatch = useMemo(
    () =>
      trimmedSearch
        ? contacts.find(
            (c) => normalizePersonName(c.displayName) === searchKey
          )
        : undefined,
    [contacts, trimmedSearch, searchKey]
  );

  const tryAddPerson = useCallback(
    (
      name: string,
      opts?: {
        memberId?: string | null;
        email?: string | null;
        hasAccount?: boolean;
        groupId?: string | null;
        groupName?: string | null;
      }
    ) => {
      const trimmed = name.trim();
      if (!trimmed) return false;

      const key = normalizePersonName(trimmed);
      if (addedNameKeys.has(key)) {
        setDuplicateHint(`${trimmed} is already at the table`);
        setSearch("");
        Keyboard.dismiss();
        searchInputRef.current?.blur();
        return false;
      }

      const added = rs.addPerson(trimmed, opts);
      setSearch("");
      setDuplicateHint(null);
      Keyboard.dismiss();
      searchInputRef.current?.blur();
      if (!added) {
        setDuplicateHint(`${trimmed} is already at the table`);
      }
      return added;
    },
    [addedNameKeys, rs]
  );

  const addFromContact = (c: Contact) => {
    tryAddPerson(c.displayName, {
      memberId: c.memberId,
      email: c.email,
      hasAccount: c.hasAccount,
      groupId: c.groupId,
      groupName: c.groupName,
    });
  };

  const addNew = () => {
    if (!trimmedSearch) return;
    if (exactContactMatch) {
      addFromContact(exactContactMatch);
      return;
    }
    tryAddPerson(trimmedSearch, { hasAccount: false });
  };

  const [tableMode, setTableMode] = useState(false);
  const [tableGroup, setTableGroup] = useState<{ id: string; name: string } | null>(null);

  const tableGroupId = useMemo(() => {
    const ids = rs.people.map((p) => p.groupId).filter(Boolean) as string[];
    if (ids.length === 0) return null;
    const unique = [...new Set(ids)];
    return unique.length === 1 ? unique[0] : null;
  }, [rs.people]);

  const tableGroupName = useMemo(() => {
    if (!tableGroupId) return null;
    return rs.people.find((p) => p.groupId === tableGroupId)?.groupName ?? null;
  }, [rs.people, tableGroupId]);

  const groupsFromContacts = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts) {
      if (c.groupId && c.groupName) map.set(c.groupId, c.groupName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [contacts]);

  const startTableCollect = useCallback(async () => {
    if (!rs.receiptId) {
      Alert.alert("Save receipt", "Finish review first.");
      return;
    }
    let gid = tableGroupId ?? tableGroup?.id;
    let gname = tableGroupName ?? tableGroup?.name ?? "Group";
    if (!gid) {
      if (groupsFromContacts.length === 1) {
        gid = groupsFromContacts[0].id;
        gname = groupsFromContacts[0].name;
      } else if (groupsFromContacts.length > 1) {
        Alert.alert(
          "Choose a group",
          groupsFromContacts.map((g) => g.name).join(", "),
          [
            ...groupsFromContacts.map((g) => ({
              text: g.name,
              onPress: () => {
                setTableGroup({ id: g.id, name: g.name });
                setTableMode(true);
              },
            })),
            { text: "Cancel", style: "cancel" as const },
          ],
        );
        return;
      } else {
        Alert.alert(
          "Pick a group",
          "Add someone from a group, or create a group in Shared first.",
        );
        return;
      }
    }
    setTableGroup({ id: gid, name: gname });
    setTableMode(true);
  }, [rs.receiptId, tableGroupId, tableGroupName, tableGroup, groupsFromContacts]);

  const unassignedCount = rs.itemsWithExtras.filter(
    (item) => (rs.assignments.get(item.id) ?? []).length === 0
  ).length;
  const allAssigned = unassignedCount === 0 && rs.itemsWithExtras.length > 0;

  const personTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of rs.itemsWithExtras) {
      const assignees = rs.assignments.get(item.id) ?? [];
      if (assignees.length === 0) continue;
      const share = item.finalPrice / assignees.length;
      for (const a of assignees) {
        const key = normalizePersonName(a.name);
        totals.set(key, (totals.get(key) ?? 0) + share);
      }
    }
    return totals;
  }, [rs.itemsWithExtras, rs.assignments]);

  const showSuggestions =
    trimmedSearch.length > 0 &&
    (filtered.length > 0 || (!searchIsDuplicate && trimmedSearch.length > 0));

  if (tableMode && tableGroup && rs.receiptId) {
    return (
      <ReceiptTableCollect
        receiptId={rs.receiptId}
        groupId={tableGroup.id}
        groupName={tableGroup.name}
        merchantName={rs.editMerchant}
        apiFetch={apiFetch}
        onBack={() => setTableMode(false)}
        onClosed={() => {
          setTableMode(false);
          rs.computeSummary();
          rs.setStep("summary");
        }}
      />
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {rs.receiptId ? (
        <TouchableOpacity
          style={[st.tableBanner, { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight }]}
          onPress={() => void startTableCollect()}
          activeOpacity={0.8}
        >
          <Ionicons name="qr-code-outline" size={22} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[st.tableBannerTitle, { color: theme.text }]}>Split with table</Text>
            <Text style={[st.tableBannerSub, { color: theme.textTertiary }]}>
              Everyone scans a QR and picks their items
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      ) : null}

      {/* People section — inline chips like Add expense */}
      <View
        style={[
          st.peopleCard,
          { backgroundColor: theme.surface, borderColor: theme.borderLight },
        ]}
      >
        <Text style={[st.label, { color: theme.textTertiary, marginBottom: 0 }]}>
          People at the table
        </Text>
        <View style={st.peopleInlineRow}>
          <Text style={[st.peopleInlineLabel, { color: theme.textSecondary }]}>
            With{" "}
            <Text style={{ fontFamily: font.bold, color: theme.text }}>you</Text>{" "}
            and:
          </Text>
          <View style={st.peopleChipsWrap}>
            {rs.people.map((p, i) => {
              const accent = receiptPersonAccent(i);
              return (
                <View
                  key={`${normalizePersonName(p.name)}-${i}`}
                  style={[
                    st.personChip,
                    {
                      backgroundColor: receiptPersonTint(accent, isDark),
                      borderColor: `${accent}44`,
                    },
                  ]}
                >
                  <View
                    style={[
                      st.personAvatar,
                      { backgroundColor: receiptPersonAvatarBg(accent, isDark) },
                    ]}
                  >
                    <Text style={[st.personAvatarText, { color: accent }]}>
                      {p.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[st.personChipText, { color: theme.text }]}>
                    {p.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => rs.removePerson(p.name)}
                    hitSlop={6}
                    style={{ padding: 1 }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={14}
                      color={theme.textTertiary}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
            <TextInput
              ref={searchInputRef}
              style={[st.peopleInlineInput, { color: theme.text }]}
              value={search}
              onChangeText={(t) => {
                setSearch(t);
                if (duplicateHint) setDuplicateHint(null);
              }}
              onSubmitEditing={addNew}
              placeholder={
                rs.people.length === 0
                  ? "Search contacts or type a name"
                  : "Add more…"
              }
              placeholderTextColor={theme.inputPlaceholder}
              autoCorrect={false}
              returnKeyType="done"
              blurOnSubmit
              maxLength={500}
            />
          </View>
        </View>
        {duplicateHint ? (
          <Text style={[st.duplicateHint, { color: theme.error }]}>
            {duplicateHint}
          </Text>
        ) : null}
        {showSuggestions ? (
          <View
            style={[
              st.dropdown,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
              },
            ]}
          >
            {filtered.map((c, i) => (
              <TouchableOpacity
                key={`${c.memberId}-${c.email ?? c.displayName}-${i}`}
                style={[st.dropdownRow, { borderBottomColor: theme.borderLight }]}
                onPress={() => addFromContact(c)}
              >
                <View
                  style={[
                    st.personAvatar,
                    {
                      backgroundColor: receiptPersonAvatarBg(
                        receiptPersonAccent(rs.people.length + i),
                        isDark
                      ),
                    },
                  ]}
                >
                  <Text
                    style={[
                      st.personAvatarText,
                      { color: receiptPersonAccent(rs.people.length + i) },
                    ]}
                  >
                    {c.displayName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.dropdownName, { color: theme.text }]}>
                    {c.displayName}
                  </Text>
                  {c.email ? (
                    <Text
                      style={[st.dropdownEmail, { color: theme.textQuaternary }]}
                      numberOfLines={1}
                    >
                      {c.email}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
            {trimmedSearch && !exactContactMatch && !searchIsDuplicate ? (
              <TouchableOpacity
                style={[st.dropdownRow, { borderBottomColor: theme.borderLight }]}
                onPress={() => tryAddPerson(trimmedSearch, { hasAccount: false })}
              >
                <Ionicons name="person-add-outline" size={16} color={theme.accent} />
                <Text style={[st.dropdownAdd, { color: theme.accent }]}>
                  Add "{trimmedSearch}"
                </Text>
              </TouchableOpacity>
            ) : null}
            {searchIsDuplicate ? (
              <View style={[st.dropdownRow, { borderBottomColor: theme.borderLight }]}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={theme.textQuaternary}
                />
                <Text style={[st.dropdownDisabled, { color: theme.textQuaternary }]}>
                  {trimmedSearch} is already at the table
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
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
            <View key={item.id} style={[st.assignCard, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.borderLight }, isAssigned && { borderColor: theme.accent }, isUnassigned && { borderColor: theme.warning, backgroundColor: theme.warningLight }]}>
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
                  <TouchableOpacity
                    style={[
                      st.everyoneBtn,
                      { backgroundColor: theme.accentMuted },
                    ]}
                    onPress={() => rs.assignAll(item.id)}
                  >
                    <Ionicons name="people" size={14} color={theme.accent} />
                    <Text style={[st.everyoneBtnText, { color: theme.accent }]}>
                      All
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {rs.people.length > 0 && (
                <View style={st.assignChips}>
                  {rs.people.map((person, pIdx) => {
                    const accent = receiptPersonAccent(pIdx);
                    const on = assigned.some(
                      (a) =>
                        normalizePersonName(a.name) ===
                        normalizePersonName(person.name)
                    );
                    return (
                      <TouchableOpacity
                        key={`${normalizePersonName(person.name)}-${pIdx}`}
                        style={[
                          st.assignChip,
                          on
                            ? {
                                backgroundColor: accent,
                                borderWidth: 1,
                                borderColor: accent,
                              }
                            : {
                                backgroundColor: theme.surfaceTertiary,
                                borderWidth: 1,
                                borderColor: theme.borderLight,
                              },
                        ]}
                        onPress={() => rs.toggleAssignment(item.id, person)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            st.assignChipText,
                            { color: on ? "#FFFCF6" : theme.textSecondary },
                          ]}
                        >
                          {person.name}
                          {on && assigned.length > 1
                            ? ` $${(item.finalPrice / assigned.length).toFixed(2)}`
                            : ""}
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
            const accent = receiptPersonAccent(i);
            const total = personTotals.get(normalizePersonName(p.name)) ?? 0;
            return (
              <View key={`${normalizePersonName(p.name)}-${i}`} style={st.runningRow}>
                <View style={[st.runningDot, { backgroundColor: accent }]} />
                <Text style={[st.runningName, { color: theme.text }]}>{p.name}</Text>
                <Text style={[st.runningAmount, { color: theme.text }]}>
                  ${total.toFixed(2)}
                </Text>
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
  const [members, setMembers] = useState<Array<{ id: string; displayName: string; email: string | null }>>([]);
  const [tapPaidPeople, setTapPaidPeople] = useState<Set<string>>(new Set());
  const [linkLoadingFor, setLinkLoadingFor] = useState<string | null>(null);
  const [linkQr, setLinkQr] = useState<{ url: string; personName: string } | null>(null);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      TAP_TO_PAY_SETTLED_EVENT,
      (payload: TapToPaySettledPayload) => {
        if (!resolvedGroupId || payload.groupId !== resolvedGroupId) return;
        const name =
          payload.payerName ??
          members.find((m) => m.id === payload.payerMemberId)?.displayName;
        if (name) {
          setTapPaidPeople((prev) => new Set(prev).add(name.toLowerCase()));
        }
      }
    );
    return () => sub.remove();
  }, [resolvedGroupId, members]);

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

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportReceiptPdf(apiFetch, rs.editMerchant, rs.personShares);
    } catch {
      Alert.alert("PDF", "Could not generate PDF. Try again in a moment.");
    } finally {
      setExportingPdf(false);
    }
  };

  const [tabbedPeople, setTabbedPeople] = useState<Set<string>>(new Set());

  const handleTabPerson = (person: typeof rs.personShares[0]) => {
    const key = person.name.toLowerCase();
    if (tabbedPeople.has(key)) return;
    setTabbedPeople((prev) => new Set(prev).add(key));
    sfx.pop();
  };

  const handleTabAll = () => {
    setTabbedPeople(
      new Set(rs.personShares.map((p) => p.name.toLowerCase()))
    );
    sfx.coin();
  };

  const openTapToPay = (person: typeof rs.personShares[0]) => {
    if (!finished || !resolvedGroupId) {
      Alert.alert("Please wait", "Saving receipt split…");
      return;
    }
    const settlement = findSettlementForPerson(
      { name: person.name, memberId: person.memberId, totalOwed: person.totalOwed },
      suggestions,
      members,
    );
    if (!settlement) {
      Alert.alert("Tap to Pay", "Still saving this split. Wait a moment and try again.");
      return;
    }
    sfx.paymentTap();
    router.push({
      pathname: "/(tabs)/pay",
      params: {
        amount: settlement.amount.toFixed(2),
        currency: "USD",
        groupId: resolvedGroupId,
        payerMemberId: settlement.fromMemberId,
        receiverMemberId: settlement.toMemberId,
        returnTo: "receipt-split",
        payerName: person.name,
      },
    });
  };

  const handleSendPaymentLink = async (person: typeof rs.personShares[0]) => {
    if (isDemoOn) {
      Alert.alert("Demo", `Would send payment link to ${person.name}`);
      return;
    }
    if (!resolvedGroupId || !finished) {
      Alert.alert("Please wait", "Saving receipt split…");
      return;
    }
    const settlement = findSettlementForPerson(
      { name: person.name, memberId: person.memberId, totalOwed: person.totalOwed },
      suggestions,
      members,
    );
    if (!settlement) {
      Alert.alert(
        "Payment link",
        "Still saving this split. Wait a moment and try again.",
      );
      return;
    }
    const key = person.name.toLowerCase();
    setLinkLoadingFor(key);
    try {
      const result = await deliverPaymentLink(
        apiFetch,
        {
          amount: settlement.amount,
          currency: "USD",
          groupId: resolvedGroupId,
          payerMemberId: settlement.fromMemberId,
          receiverMemberId: settlement.toMemberId,
        },
        {
          personName: person.name,
          amount: settlement.amount,
          currency: "USD",
          offerShare: true,
        },
      );
      if (!result.ok) {
        Alert.alert("Payment link", result.error);
        return;
      }
      setLinkQr({ url: result.url, personName: person.name });
      sfx.pop();
    } finally {
      setLinkLoadingFor(null);
    }
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
    <View style={{ gap: space.lg }}>
      {/* Receipt summary card */}
      <View style={[smst.receiptCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight }]}>
        <Text style={[smst.receiptMeta, { color: theme.textTertiary }]}>
          {rs.editMerchant || "Receipt"} · {rs.editItems.length} line{rs.editItems.length !== 1 ? "s" : ""}
        </Text>
        <Text style={[smst.receiptTotal, { color: theme.text }]}>${grandTotal.toFixed(2)}</Text>
        <Text style={[smst.receiptPaid, { color: theme.textQuaternary }]}>
          Paid by you · {rs.personShares.length} {rs.personShares.length === 1 ? "person" : "people"}
        </Text>
      </View>

      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[st.label, { color: theme.textTertiary, marginBottom: 0 }]}>They owe you</Text>
          {rs.personShares.length > 1 && !allTabbed && (
            <TouchableOpacity
              onPress={handleTabAll}
              hitSlop={8}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radii.md,
                backgroundColor: theme.surfaceTertiary,
              }}
            >
              <Ionicons name="layers-outline" size={14} color={theme.accent} />
              <Text style={{ fontSize: 12, fontFamily: font.semibold, fontWeight: "600", color: theme.accent }}>
                Tab all
              </Text>
            </TouchableOpacity>
          )}
        </View>

      {rs.personShares.map((person, idx) => {
        const personKey = person.name.toLowerCase();
        const isTabbed = tabbedPeople.has(personKey);
        const isTapPaid = tapPaidPeople.has(personKey);
        const isLinkLoading = linkLoadingFor === personKey;
        const accent = receiptPersonAccent(idx);
        const itemCount = person.items.length;
        return (
          <View key={person.name} style={[smst.personCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <View style={smst.personHeader}>
              <View style={[st.shareAv, { backgroundColor: accent }]}>
                <Text style={st.shareAvText}>{person.name.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[smst.personName, { color: theme.text }]}>{person.name}</Text>
                <Text style={[smst.personSub, { color: theme.textQuaternary }]}>
                  {itemCount} item{itemCount !== 1 ? "s" : ""}
                </Text>
              </View>
              <Text style={[smst.personAmount, { color: theme.positive }]}>
                ${person.totalOwed.toFixed(2)}
              </Text>
            </View>

            <View style={smst.personActions}>
              <TouchableOpacity
                style={[
                  smst.actionBtn,
                  smst.actionBtnPrimary,
                  { backgroundColor: theme.text, flex: 1.4 },
                  (!finished || isLinkLoading) && { opacity: 0.65 },
                ]}
                onPress={() => handleSendPaymentLink(person)}
                disabled={!finished || isLinkLoading}
                activeOpacity={0.85}
              >
                {isLinkLoading ? (
                  <ActivityIndicator size="small" color={theme.surface} />
                ) : (
                  <>
                    <Ionicons name="paper-plane-outline" size={14} color={theme.surface} />
                    <Text style={[smst.actionBtnText, { color: theme.surface }]}>Send link</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  smst.actionBtn,
                  {
                    backgroundColor: isTapPaid ? theme.successLight : theme.surface,
                    borderColor: isTapPaid ? theme.success : theme.border,
                  },
                ]}
                onPress={() => openTapToPay(person)}
                activeOpacity={0.85}
                disabled={isTapPaid}
              >
                {isTapPaid ? (
                  <Ionicons name="checkmark" size={15} color={theme.success} />
                ) : (
                  <Ionicons name="phone-portrait-outline" size={15} color={theme.text} />
                )}
                <Text
                  style={[
                    smst.actionBtnText,
                    { color: isTapPaid ? theme.success : theme.text },
                  ]}
                >
                  {isTapPaid ? "Paid" : "Tap"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  smst.actionBtn,
                  {
                    backgroundColor: isTabbed ? theme.successLight : theme.surface,
                    borderColor: isTabbed ? theme.success : theme.border,
                  },
                ]}
                onPress={() => handleTabPerson(person)}
                disabled={isTabbed}
                activeOpacity={0.85}
              >
                {isTabbed ? (
                  <Ionicons name="checkmark" size={15} color={theme.success} />
                ) : null}
                <Text
                  style={[
                    smst.actionBtnText,
                    { color: isTabbed ? theme.success : theme.textSecondary },
                  ]}
                >
                  {isTabbed ? "Tabbed" : "Tab it"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      </View>

      <TouchableOpacity
        onPress={handleExportPdf}
        style={[smst.exportBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
        activeOpacity={0.85}
        disabled={exportingPdf}
      >
        {exportingPdf ? (
          <ActivityIndicator size="small" color={theme.text} />
        ) : (
          <Ionicons name="document-outline" size={16} color={theme.text} />
        )}
        <Text style={[smst.exportBtnText, { color: theme.text }]}>
          Share breakdown (PDF)
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={[smst.doneBtn, { backgroundColor: theme.text }]} onPress={rs.reset} activeOpacity={0.8}>
        <Text style={[smst.doneBtnText, { color: theme.surface }]}>Done</Text>
      </TouchableOpacity>

      <TouchableOpacity style={{ alignSelf: "center", paddingVertical: 8 }} onPress={() => rs.setStep("assign")}>
        <Text style={{ fontSize: 14, fontFamily: font.medium, fontWeight: "500", color: theme.textTertiary }}>
          <Ionicons name="chevron-back" size={12} color={theme.textTertiary} /> Edit assignments
        </Text>
      </TouchableOpacity>

      {linkQr ? (
        <LinkQrSheet
          visible
          url={linkQr.url}
          title={`Pay ${linkQr.personName}`}
          subtitle="Link copied — scan or share to collect"
          onClose={() => setLinkQr(null)}
        />
      ) : null}
    </View>
  );
}
