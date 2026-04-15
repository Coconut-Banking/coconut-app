import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { useApiFetch } from "../../lib/api";
import { settingsStyles as s } from "./styles";

export function GmailCard() {
  const { theme } = useTheme();
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const isFocused = useIsFocused();
  const router = useRouter();
  const params = useLocalSearchParams<{
    connected?: string;
    error?: string;
  }>();
  const gmailConnectedHandled = useRef(false);

  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email: string | null;
    lastScanAt: string | null;
  } | null>(null);
  const [gmailScanning, setGmailScanning] = useState(false);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);
  const [gmailScanResult, setGmailScanResult] = useState<{
    ok: boolean;
    emailsFetched?: number;
    inserted?: number;
    matched?: number;
    isFirstScan?: boolean;
    error?: string;
  } | null>(null);

  const fetchGmailStatus = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch("/api/gmail/status");
      if (!res.ok) {
        setGmailStatus(null);
        return;
      }
      const data = await res.json();
      setGmailStatus(
        data as { connected: boolean; email: string | null; lastScanAt: string | null },
      );
    } catch {
      setGmailStatus(null);
    }
  }, [user, apiFetch]);

  useEffect(() => {
    if (!user || !isFocused) return;
    void fetchGmailStatus();
  }, [isFocused, user, fetchGmailStatus]);

  const connectGmail = async () => {
    try {
      const redirect = "coconut://settings";
      const res = await apiFetch(
        `/api/gmail/auth?redirect=${encodeURIComponent(redirect)}`,
      );
      const data = await res.json().catch(() => ({}));
      const authUrl = (data as { authUrl?: string }).authUrl;
      if (authUrl) {
        void Linking.openURL(authUrl);
      } else {
        Alert.alert(
          "Gmail",
          "Could not start Gmail connection. Try again.",
        );
      }
    } catch {
      Alert.alert(
        "Gmail",
        "Could not start Gmail connection. Check your connection.",
      );
    }
  };

  const scanGmail = async (daysBack?: number) => {
    setGmailScanning(true);
    setGmailScanResult(null);
    const isFirstScan = !gmailStatus?.lastScanAt;
    const days = daysBack ?? (isFirstScan ? 90 : 30);
    try {
      const body = { daysBack: days };
      if (__DEV__) console.log("[gmail:scan] starting — daysBack:", days);
      const res = await apiFetch("/api/gmail/scan", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (
          res.status === 403 &&
          (data as { authError?: boolean }).authError
        ) {
          setGmailStatus((prev) =>
            prev ? { ...prev, connected: false } : null,
          );
          Alert.alert("Gmail", "Gmail connection expired. Please reconnect.");
        } else {
          setGmailScanResult({
            ok: false,
            error:
              (data as { error?: string }).error ??
              "Scan failed. Try again.",
          });
        }
      } else {
        const d = data as {
          emailsFetched?: number;
          inserted?: number;
          matched?: number;
          error?: string;
        };
        if (d.error) {
          setGmailScanResult({ ok: false, error: d.error });
        } else {
          setGmailScanResult({
            ok: true,
            emailsFetched: d.emailsFetched,
            inserted: d.inserted ?? 0,
            matched: d.matched ?? 0,
            isFirstScan,
          });
        }
        void fetchGmailStatus();
      }
    } catch {
      setGmailScanResult({
        ok: false,
        error: "Scan failed. Check your connection.",
      });
    } finally {
      setGmailScanning(false);
    }
  };

  const disconnectGmail = () => {
    Alert.alert(
      "Disconnect Gmail?",
      "Removes your Gmail connection. Matched receipts stay in Coconut.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setGmailDisconnecting(true);
            try {
              const res = await apiFetch("/api/gmail/disconnect", {
                method: "POST",
              });
              if (!res.ok) {
                Alert.alert("Error", "Could not disconnect. Try again.");
              } else {
                setGmailStatus({
                  connected: false,
                  email: null,
                  lastScanAt: null,
                });
                setGmailScanResult(null);
              }
            } catch {
              Alert.alert(
                "Error",
                "Could not disconnect. Check your connection.",
              );
            } finally {
              setGmailDisconnecting(false);
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!user) return;
    if (gmailConnectedHandled.current) return;
    if (params?.connected === "true") {
      gmailConnectedHandled.current = true;
      router.replace("/(tabs)/settings");
      fetchGmailStatus().then(() => {
        void scanGmail(90);
      });
    } else if (params?.error === "auth_failed") {
      gmailConnectedHandled.current = true;
      Alert.alert("Gmail", "Could not connect Gmail. Please try again.");
      router.replace("/(tabs)/settings");
    }
  }, [params?.connected, params?.error, user]);

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <Text style={[s.sectionTitle, { color: theme.text }]}>
        Email receipts
      </Text>
      <Text style={[s.sectionBlurb, { color: theme.textTertiary }]}>
        Connect Gmail to automatically match email receipts to your bank
        transactions.
      </Text>

      {gmailScanResult ? (
        <View
          style={[
            s.resultBox,
            {
              backgroundColor: gmailScanResult.ok
                ? theme.primaryLight
                : theme.errorLight,
              borderColor: gmailScanResult.ok ? theme.border : theme.error,
            },
          ]}
        >
          <Text
            style={[
              s.resultTitle,
              {
                color: gmailScanResult.ok ? theme.text : theme.error,
              },
            ]}
          >
            {gmailScanResult.ok
              ? gmailScanResult.inserted === 0
                ? "No new receipts"
                : "Scan complete"
              : "Scan failed"}
          </Text>
          {gmailScanResult.ok ? (
            <Text
              style={[s.resultDetail, { color: theme.textQuaternary }]}
            >
              {gmailScanResult.emailsFetched != null
                ? `${gmailScanResult.emailsFetched} emails scanned · `
                : ""}
              {gmailScanResult.inserted ?? 0} new receipts ·{" "}
              {gmailScanResult.matched ?? 0} matched
              {gmailScanResult.isFirstScan ? " (last 90 days)" : ""}
            </Text>
          ) : gmailScanResult.error ? (
            <Text
              style={[s.resultDetail, { color: theme.textQuaternary }]}
            >
              {gmailScanResult.error}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!gmailStatus?.connected ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={connectGmail}
            disabled={gmailScanning}
          >
            <Text style={s.primaryBtnText}>Connect Gmail</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 12, marginTop: 4 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {gmailStatus.email ? (
              <Text style={[s.muted, { color: theme.textTertiary }]}>
                {gmailStatus.email}
              </Text>
            ) : null}
            {gmailStatus.lastScanAt ? (
              <Text
                style={[
                  s.muted,
                  { color: theme.textQuaternary, fontSize: 12 },
                ]}
              >
                Last scan{" "}
                {new Date(gmailStatus.lastScanAt).toLocaleDateString()}
              </Text>
            ) : (
              <Text
                style={[
                  s.muted,
                  { color: theme.textQuaternary, fontSize: 12 },
                ]}
              >
                Never scanned
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[
              s.primaryBtn,
              { backgroundColor: theme.primary },
              gmailScanning && s.disabled,
            ]}
            onPress={() => scanGmail()}
            disabled={gmailScanning || gmailDisconnecting}
          >
            {gmailScanning ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <ActivityIndicator size="small" color="#fff" />
                <Text style={s.primaryBtnText}>Scanning…</Text>
              </View>
            ) : (
              <Text style={s.primaryBtnText}>
                {!gmailStatus.lastScanAt
                  ? "Scan receipts (last 90 days)"
                  : "Scan new receipts"}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.linkRow}
            onPress={() => router.push("/(tabs)/email-receipts")}
          >
            <Ionicons name="mail-outline" size={16} color={theme.text} />
            <Text style={[s.linkInline, { color: theme.accent }]}>
              View all receipts
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              s.disconnectBtn,
              {
                borderColor: theme.errorLight,
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
            onPress={disconnectGmail}
            disabled={gmailDisconnecting || gmailScanning}
          >
            {gmailDisconnecting ? (
              <ActivityIndicator size="small" color={theme.error} />
            ) : (
              <Text style={[s.disconnectBtnText, { color: theme.error }]}>
                Disconnect Gmail
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
