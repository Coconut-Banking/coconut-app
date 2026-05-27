import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font, radii, space } from "../../lib/theme";
import { LinkQrSheet } from "../share/LinkQrSheet";
import {
  closeReceiptCollect,
  fetchCollectStatus,
  startReceiptCollect,
} from "../../lib/receipt-collect";
import { invalidateApiCache } from "../../lib/api";
import { sfx } from "../../lib/sounds";

type Props = {
  receiptId: string;
  groupId: string;
  groupName?: string;
  merchantName?: string;
  apiFetch: (path: string, opts?: { method?: string; body?: object }) => Promise<Response>;
  onClosed: () => void;
  onBack: () => void;
};

export function ReceiptTableCollect({
  receiptId,
  groupId,
  groupName,
  merchantName,
  apiFetch,
  onClosed,
  onBack,
}: Props) {
  const { theme } = useTheme();
  const [collectUrl, setCollectUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [starting, setStarting] = useState(true);
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof fetchCollectStatus>>>(null);

  useEffect(() => {
    void (async () => {
      setStarting(true);
      const result = await startReceiptCollect(apiFetch, receiptId, groupId);
      setStarting(false);
      if (!result.ok) {
        Alert.alert("Table split", result.error);
        onBack();
        return;
      }
      setCollectUrl(result.collectUrl);
      setShowQr(true);
    })();
  }, [apiFetch, receiptId, groupId, onBack]);

  const refresh = useCallback(async () => {
    const s = await fetchCollectStatus(apiFetch, receiptId);
    if (s) setStatus(s);
  }, [apiFetch, receiptId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleClose = async () => {
    const pending = (status?.totalCount ?? 0) - (status?.submittedCount ?? 0);
    if (pending > 0) {
      Alert.alert(
        "Close anyway?",
        `${pending} ${pending === 1 ? "person hasn't" : "people haven't"} submitted yet.`,
        [
          { text: "Keep waiting", style: "cancel" },
          { text: "Close & send bills", style: "destructive", onPress: () => void doClose() },
        ],
      );
      return;
    }
    await doClose();
  };

  const doClose = async () => {
    setClosing(true);
    const result = await closeReceiptCollect(apiFetch, receiptId);
    setClosing(false);
    if (!result.ok) {
      Alert.alert("Error", result.error);
      return;
    }
    invalidateApiCache("/api/bills");
    sfx.success();
    Alert.alert(
      "Bills sent",
      `Created ${result.billsCreated} payment request${result.billsCreated === 1 ? "" : "s"}. Check Shared → Bills.`,
    );
    onClosed();
  };

  if (starting) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={theme.primary} />
        <Text style={[s.sub, { color: theme.textTertiary }]}>Starting table…</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
        <Text style={[s.title, { color: theme.text }]}>
          {merchantName ?? "Receipt"} · Table split
        </Text>
        {groupName ? (
          <Text style={[s.sub, { color: theme.textTertiary }]}>{groupName}</Text>
        ) : null}
        <Text style={[s.hint, { color: theme.textSecondary }]}>
          Everyone scans to pick their items. You can fill in for anyone who&apos;s absent.
        </Text>
        <TouchableOpacity
          style={[s.qrBtn, { backgroundColor: theme.primary }]}
          onPress={() => setShowQr(true)}
        >
          <Ionicons name="qr-code-outline" size={18} color="#fff" />
          <Text style={s.qrBtnText}>Show QR code</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
        <Text style={[s.label, { color: theme.textTertiary }]}>
          Progress · {status?.submittedCount ?? 0}/{status?.totalCount ?? 0} submitted
        </Text>
        {(status?.participants ?? []).map((p) => (
          <View key={p.member_id} style={[s.row, { borderBottomColor: theme.borderLight }]}>
            <Ionicons
              name={p.status === "submitted" ? "checkmark-circle" : "ellipse-outline"}
              size={20}
              color={p.status === "submitted" ? theme.success ?? "#22c55e" : theme.textTertiary}
            />
            <Text style={[s.name, { color: theme.text }]}>{p.display_name}</Text>
          </View>
        ))}
      </View>

      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.navBack}>
          <Ionicons name="chevron-back" size={18} color={theme.textTertiary} />
          <Text style={{ color: theme.textTertiary, fontFamily: font.medium }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.closeBtn, { backgroundColor: theme.primary }, closing && { opacity: 0.6 }]}
          onPress={() => void handleClose()}
          disabled={closing}
        >
          {closing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.closeBtnText}>Close & send bills</Text>
          )}
        </TouchableOpacity>
      </View>

      {collectUrl ? (
        <LinkQrSheet
          visible={showQr}
          url={collectUrl}
          title="Scan to pick items"
          subtitle="Guests can use Coconut or any browser"
          onClose={() => setShowQr(false)}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: "center", paddingVertical: 40, gap: 12 },
  card: { borderRadius: radii.xl, borderWidth: 1, padding: space.md },
  title: { fontFamily: font.bold, fontSize: 18 },
  sub: { fontFamily: font.regular, fontSize: 13, marginTop: 4 },
  hint: { fontFamily: font.regular, fontSize: 14, marginTop: 10, lineHeight: 20 },
  label: { fontFamily: font.semibold, fontSize: 12, textTransform: "uppercase", marginBottom: 8 },
  qrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
  },
  qrBtnText: { color: "#fff", fontFamily: font.semibold, fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontFamily: font.medium, fontSize: 15 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBack: { flexDirection: "row", alignItems: "center", gap: 4 },
  closeBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: radii.lg },
  closeBtnText: { color: "#fff", fontFamily: font.semibold, fontSize: 15 },
});
