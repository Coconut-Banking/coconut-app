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
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { font, radii, space } from "../../lib/theme";
import { LinkQrSheet } from "../share/LinkQrSheet";
import {
  closeReceiptCollect,
  fetchCollectStatus,
  startReceiptCollectAuto,
} from "../../lib/receipt-collect";
import { invalidateApiCache } from "../../lib/api";
import { sfx } from "../../lib/sounds";

type ApiFetch = (
  path: string,
  opts?: { method?: string; body?: object },
) => Promise<Response>;

type Props = {
  receiptId: string;
  merchantName: string;
  total: number;
  apiFetch: ApiFetch;
  onSplitMyself: () => void;
  onDone: () => void;
};

export function ReceiptSplitChoose({
  receiptId,
  merchantName,
  total,
  apiFetch,
  onSplitMyself,
  onDone,
}: Props) {
  const { theme } = useTheme();
  const [collectUrl, setCollectUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [startingQr, setStartingQr] = useState(false);
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof fetchCollectStatus>>>(null);
  const [tableActive, setTableActive] = useState(false);

  const refresh = useCallback(async () => {
    const s = await fetchCollectStatus(apiFetch, receiptId);
    if (s?.collecting) {
      setTableActive(true);
      setStatus(s);
    }
  }, [apiFetch, receiptId]);

  useEffect(() => {
    void refresh();
    if (!tableActive) return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh, tableActive]);

  const startTableLink = async () => {
    setStartingQr(true);
    const result = await startReceiptCollectAuto(apiFetch, receiptId, merchantName);
    setStartingQr(false);
    if (!result.ok) {
      Alert.alert("Share link", result.error);
      return;
    }
    setCollectUrl(result.collectUrl);
    setTableActive(true);
    setShowQr(true);
    sfx.pop();
  };

  const finishTable = async () => {
    const pending = (status?.totalCount ?? 0) - (status?.submittedCount ?? 0);
    if (pending > 0) {
      Alert.alert(
        "Close bill?",
        `${pending} ${pending === 1 ? "person hasn't" : "people haven't"} picked items yet.`,
        [
          { text: "Keep open", style: "cancel" },
          { text: "Close & send requests", style: "destructive", onPress: () => void doClose() },
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
    onDone();
    router.replace("/(tabs)/shared");
  };

  return (
    <View style={{ gap: space.lg }}>
      <View style={[s.hero, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
        <Text style={[s.heroMerchant, { color: theme.text }]}>{merchantName || "Receipt"}</Text>
        <Text style={[s.heroTotal, { color: theme.text }]}>${total.toFixed(2)}</Text>
        <Text style={[s.heroSub, { color: theme.textTertiary }]}>
          How do you want to split this?
        </Text>
      </View>

      <TouchableOpacity
        style={[s.option, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
        onPress={onSplitMyself}
        activeOpacity={0.85}
      >
        <View style={[s.optionIcon, { backgroundColor: theme.primaryLight }]}>
          <Ionicons name="hand-left-outline" size={22} color={theme.primary} />
        </View>
        <View style={s.optionBody}>
          <Text style={[s.optionTitle, { color: theme.text }]}>Tag items myself</Text>
          <Text style={[s.optionSub, { color: theme.textTertiary }]}>
            Just you, or add a few names — no group needed
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.option, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
        onPress={() => void startTableLink()}
        disabled={startingQr}
        activeOpacity={0.85}
      >
        <View style={[s.optionIcon, { backgroundColor: `${theme.primary}14` }]}>
          {startingQr ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <Ionicons name="qr-code-outline" size={22} color={theme.primary} />
          )}
        </View>
        <View style={s.optionBody}>
          <Text style={[s.optionTitle, { color: theme.text }]}>Share a link</Text>
          <Text style={[s.optionSub, { color: theme.textTertiary }]}>
            Everyone scans, picks their items, then you close the bill
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
      </TouchableOpacity>

      {tableActive ? (
        <View style={[s.statusCard, { backgroundColor: theme.surfaceSecondary, borderColor: theme.borderLight }]}>
          <Text style={[s.statusLabel, { color: theme.textTertiary }]}>
            Link open · {status?.submittedCount ?? 0} picked items
          </Text>
          <View style={s.statusActions}>
            <TouchableOpacity
              style={[s.secondaryBtn, { borderColor: theme.border }]}
              onPress={() => setShowQr(true)}
            >
              <Ionicons name="qr-code-outline" size={16} color={theme.primary} />
              <Text style={[s.secondaryBtnText, { color: theme.primary }]}>Show QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: theme.primary }, closing && { opacity: 0.6 }]}
              onPress={() => void finishTable()}
              disabled={closing}
            >
              {closing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.primaryBtnText}>Close bill</Text>
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => {
              onDone();
              router.replace("/(tabs)/shared");
            }}
            style={s.exitRow}
          >
            <Text style={[s.exitText, { color: theme.textTertiary }]}>
              Leave — finish later in Shared
            </Text>
            <Ionicons name="arrow-forward" size={14} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>
      ) : null}

      {collectUrl ? (
        <LinkQrSheet
          visible={showQr}
          url={collectUrl}
          title="Scan to pick items"
          subtitle="Works in any browser — guests type their name"
          onClose={() => setShowQr(false)}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: space.lg,
    alignItems: "center",
  },
  heroMerchant: { fontFamily: font.semibold, fontSize: 15 },
  heroTotal: { fontFamily: font.black, fontSize: 36, marginTop: 4, letterSpacing: -1 },
  heroSub: { fontFamily: font.regular, fontSize: 14, marginTop: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  optionBody: { flex: 1, gap: 2 },
  optionTitle: { fontFamily: font.bold, fontSize: 16 },
  optionSub: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  statusCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: space.md,
    gap: 12,
  },
  statusLabel: { fontFamily: font.semibold, fontSize: 12, textTransform: "uppercase" },
  statusActions: { flexDirection: "row", gap: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  secondaryBtnText: { fontFamily: font.semibold, fontSize: 14 },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.lg,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontFamily: font.semibold, fontSize: 14 },
  exitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 4,
  },
  exitText: { fontFamily: font.medium, fontSize: 14 },
});
