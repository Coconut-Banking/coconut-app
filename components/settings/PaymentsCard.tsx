import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useTheme } from "../../lib/theme-context";
import { useApiFetch } from "../../lib/api";
import { settingsStyles as s } from "./styles";

export function PaymentsCard() {
  const { theme } = useTheme();
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const isFocused = useIsFocused();
  const router = useRouter();
  const params = useLocalSearchParams<{ stripe_connect?: string }>();
  const connectReturnHandled = useRef(false);

  const [connectStatus, setConnectStatus] = useState<{
    hasAccount: boolean;
    onboardingComplete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requiresVerification?: boolean;
  } | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectActionLoading, setConnectActionLoading] = useState(false);

  const fetchConnectStatus = useCallback(async () => {
    if (!user) return;
    setConnectLoading(true);
    try {
      const res = await apiFetch("/api/stripe/connect/status");
      if (!res.ok) {
        setConnectStatus(null);
        return;
      }
      const data = await res.json();
      setConnectStatus(data as typeof connectStatus);
    } catch {
      setConnectStatus(null);
    } finally {
      setConnectLoading(false);
    }
  }, [user, apiFetch]);

  useEffect(() => {
    if (!user || !isFocused) return;
    void fetchConnectStatus();
  }, [isFocused, user, fetchConnectStatus]);

  const startConnectOnboarding = useCallback(async () => {
    setConnectActionLoading(true);
    try {
      const endpoint = connectStatus?.hasAccount
        ? "/api/stripe/connect/onboarding-link"
        : "/api/stripe/connect/create-account";
      const rawScheme = Constants.expoConfig?.scheme;
      const scheme =
        typeof rawScheme === "string"
          ? rawScheme
          : Array.isArray(rawScheme)
            ? rawScheme[0] ?? "coconut"
            : "coconut";
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: { scheme },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert(
          "Error",
          (data as { error?: string }).error ?? "Could not start setup",
        );
        return;
      }
      const data = await res.json();
      const url = (data as { url?: string }).url;
      if (!url) {
        Alert.alert("Error", "Could not get onboarding URL");
        return;
      }
      await WebBrowser.openAuthSessionAsync(
        url,
        `${scheme}://stripe-connect-return`,
      );
      void fetchConnectStatus();
    } catch {
      Alert.alert(
        "Error",
        "Could not start payment setup. Check your connection.",
      );
    } finally {
      setConnectActionLoading(false);
    }
  }, [connectStatus?.hasAccount, apiFetch, fetchConnectStatus]);

  useEffect(() => {
    if (!user) return;
    if (connectReturnHandled.current) return;
    const sc = params?.stripe_connect;
    if (sc === "complete") {
      connectReturnHandled.current = true;
      void fetchConnectStatus();
      router.replace("/(tabs)/settings");
    } else if (sc === "refresh") {
      connectReturnHandled.current = true;
      void startConnectOnboarding();
      router.replace("/(tabs)/settings");
    }
  }, [params?.stripe_connect, user, fetchConnectStatus, startConnectOnboarding, router]);

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <Text style={[s.sectionTitle, { color: theme.text }]}>Payments</Text>
      <Text style={[s.sectionBlurb, { color: theme.textTertiary }]}>
        Set up payments to receive Tap to Pay funds directly in your bank
        account.
      </Text>

      {connectLoading && connectStatus === null ? (
        <ActivityIndicator style={{ marginTop: 14 }} color={theme.text} />
      ) : connectStatus?.onboardingComplete && !connectStatus?.requiresVerification ? (
        <View
          style={[
            s.resultBox,
            { backgroundColor: theme.primaryLight, borderColor: theme.border },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={theme.positive}
            />
            <Text style={[s.resultTitle, { color: theme.text }]}>
              Payments enabled
            </Text>
          </View>
          <Text style={[s.resultDetail, { color: theme.textQuaternary }]}>
            Tap to Pay funds will be deposited directly to your bank account.
          </Text>
        </View>
      ) : connectStatus?.requiresVerification ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <View
            style={[
              s.resultBox,
              {
                backgroundColor: theme.surfaceTertiary,
                borderColor: theme.warning,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="warning-outline" size={20} color={theme.warning} />
              <Text style={[s.resultTitle, { color: theme.text }]}>
                Identity verification required
              </Text>
            </View>
            <Text style={[s.resultDetail, { color: theme.textQuaternary }]}>
              Stripe needs to verify your identity before funds can be paid out to your bank.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              s.primaryBtn,
              { backgroundColor: theme.primary },
              connectActionLoading && s.disabled,
            ]}
            onPress={startConnectOnboarding}
            disabled={connectActionLoading}
          >
            {connectActionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>Verify identity</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : connectStatus?.hasAccount ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <View
            style={[
              s.resultBox,
              {
                backgroundColor: theme.surfaceTertiary,
                borderColor: theme.warning,
              },
            ]}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Ionicons name="time-outline" size={20} color={theme.warning} />
              <Text style={[s.resultTitle, { color: theme.text }]}>
                Setup incomplete
              </Text>
            </View>
            <Text style={[s.resultDetail, { color: theme.textQuaternary }]}>
              Finish setting up your account to receive payments.
            </Text>
          </View>
          <TouchableOpacity
            style={[
              s.primaryBtn,
              { backgroundColor: theme.primary },
              connectActionLoading && s.disabled,
            ]}
            onPress={startConnectOnboarding}
            disabled={connectActionLoading}
          >
            {connectActionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>Continue setup</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 12, marginTop: 4 }}>
          <TouchableOpacity
            style={[
              s.primaryBtn,
              { backgroundColor: theme.primary },
              connectActionLoading && s.disabled,
            ]}
            onPress={startConnectOnboarding}
            disabled={connectActionLoading}
          >
            {connectActionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>Set up payments</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
