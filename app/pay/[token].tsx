import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { font, radii, shadow } from "../../lib/theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";

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
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const startCheckout = async () => {
    if (!token) return;
    setCheckoutLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/pay/${encodeURIComponent(token)}/checkout`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout");
        return;
      }
      await Linking.openURL(data.url as string);
    } catch {
      setError("Could not open checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  if (loading) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
        <View style={st.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
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

  if (paid === "1") {
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
          <Text style={[st.kicker, { color: theme.textTertiary }]}>Pay with Apple Pay or card</Text>
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
                style={[st.primaryBtn, { backgroundColor: theme.primary, opacity: checkoutLoading ? 0.7 : 1 }]}
                onPress={startCheckout}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={st.primaryBtnText}>Continue to pay</Text>
                )}
              </TouchableOpacity>
              <Text style={[st.footer, { color: theme.textTertiary }]}>
                Opens secure Stripe checkout · Apple Pay in Safari
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
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: font.semibold },
  footer: { fontSize: 11, fontFamily: font.regular, textAlign: "center", marginTop: 12, lineHeight: 16 },
  title: { fontSize: 20, fontFamily: font.bold, marginTop: 16, marginBottom: 8 },
  sub: { fontSize: 14, fontFamily: font.regular, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  successIcon: { marginBottom: 4 },
});
