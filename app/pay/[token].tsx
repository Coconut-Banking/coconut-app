import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { font, radii, shadow } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import {
  fetchPayLinkIntent,
  presentPayLinkPaymentSheet,
} from "../../lib/stripe-payment-sheet";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-app.dev";

type PayPreview = {
  amount: number;
  currency: string;
  payerName: string;
  receiverName: string;
  groupName: string;
  payable: boolean;
  notPayableReason: string | null;
};

export default function PayLinkScreen() {
  const { theme } = useTheme();
  const { token, paid } = useLocalSearchParams<{ token: string; paid?: string }>();
  const [preview, setPreview] = useState<PayPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidSuccess, setPaidSuccess] = useState(paid === "1");
  const sheetAttempted = useRef(false);

  const fetchPreview = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/pay/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid payment link");
        return;
      }
      setPreview(data as PayPreview);
    } catch {
      setError("Could not load payment details");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const startNativePay = useCallback(async () => {
    if (!token || !preview?.payable) return;
    setPayLoading(true);
    setError(null);
    try {
      const intent = await fetchPayLinkIntent(API_URL, token);
      const result = await presentPayLinkPaymentSheet({
        clientSecret: intent.clientSecret,
        payerName: preview.payerName,
        receiverName: preview.receiverName,
      });
      if (result.ok) {
        setPaidSuccess(true);
        return;
      }
      if (!result.cancelled) {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open Apple Pay");
    } finally {
      setPayLoading(false);
    }
  }, [token, preview]);

  // Uber-style: auto-present native sheet once preview is ready.
  useEffect(() => {
    if (
      loading ||
      paidSuccess ||
      !preview?.payable ||
      !token ||
      sheetAttempted.current
    ) {
      return;
    }
    sheetAttempted.current = true;
    void startNativePay();
  }, [loading, paidSuccess, preview, token, startNativePay]);

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  if (loading) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
        <View style={st.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[st.footer, { color: theme.textTertiary, marginTop: 16 }]}>
            Preparing Apple Pay…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !preview) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={st.closeBtn} onPress={dismiss}>
          <Ionicons name="close" size={24} color={theme.textTertiary} />
        </TouchableOpacity>
        <View style={st.centered}>
          <View style={[st.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Ionicons name="link-outline" size={32} color="#DC2626" />
            <Text style={[st.title, { color: theme.text }]}>Link unavailable</Text>
            <Text style={[st.sub, { color: theme.textTertiary }]}>{error}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (paidSuccess) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={st.closeBtn} onPress={dismiss}>
          <Ionicons name="close" size={24} color={theme.textTertiary} />
        </TouchableOpacity>
        <View style={st.centered}>
          <View style={[st.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <View style={st.successIcon}>
              <Ionicons name="checkmark-circle" size={40} color="#059669" />
            </View>
            <Text style={[st.title, { color: theme.text }]}>Payment sent</Text>
            {preview ? (
              <Text style={[st.sub, { color: theme.textTertiary }]}>
                {formatSplitCurrencyAmount(preview.amount, preview.currency)} to {preview.receiverName}
              </Text>
            ) : null}
            <TouchableOpacity style={[st.primaryBtn, { backgroundColor: theme.primary }]} onPress={dismiss}>
              <Text style={st.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!preview) return null;

  return (
    <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
      <TouchableOpacity style={st.closeBtn} onPress={dismiss}>
        <Ionicons name="close" size={24} color={theme.textTertiary} />
      </TouchableOpacity>
      <View style={st.centered}>
        <View style={[st.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <Text style={[st.kicker, { color: theme.textTertiary }]}>Pay with Apple Pay</Text>
          <Text style={[st.names, { color: theme.textSecondary }]}>
            {preview.payerName} → {preview.receiverName}
          </Text>
          <Text style={[st.amount, { color: theme.text }]}>
            {formatSplitCurrencyAmount(preview.amount, preview.currency)}
          </Text>
          <Text style={[st.group, { color: theme.textTertiary }]}>{preview.groupName}</Text>

          {!preview.payable && preview.notPayableReason ? (
            <Text style={[st.warn, { color: theme.textSecondary }]}>{preview.notPayableReason}</Text>
          ) : (
            <>
              {error ? <Text style={st.errorText}>{error}</Text> : null}
              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: theme.primary, opacity: payLoading ? 0.7 : 1 }]}
                onPress={() => void startNativePay()}
                disabled={payLoading}
              >
                {payLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={18} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={st.primaryBtnText}>Pay with Apple Pay</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={[st.footer, { color: theme.textTertiary }]}>
                Secure in-app checkout — card also accepted
              </Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  closeBtn: { position: "absolute", top: 56, right: 20, zIndex: 10, padding: 4 },
  card: {
    width: "100%",
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    ...shadow.sm,
  },
  kicker: {
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  names: { fontSize: 14, fontFamily: font.medium, marginBottom: 8 },
  amount: { fontSize: 36, fontFamily: font.bold, letterSpacing: -1 },
  group: { fontSize: 12, fontFamily: font.regular, marginTop: 4, marginBottom: 20 },
  warn: { fontSize: 14, fontFamily: font.regular, textAlign: "center", lineHeight: 20 },
  errorText: { color: "#DC2626", fontSize: 13, fontFamily: font.medium, marginBottom: 12, textAlign: "center" },
  primaryBtn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: font.semibold },
  footer: { fontSize: 11, fontFamily: font.regular, textAlign: "center", marginTop: 12, lineHeight: 16 },
  title: { fontSize: 20, fontFamily: font.bold, marginTop: 16, marginBottom: 8 },
  sub: { fontSize: 14, fontFamily: font.regular, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  successIcon: { marginBottom: 4 },
});
