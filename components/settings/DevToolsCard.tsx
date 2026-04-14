import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useUser, useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { useApiFetch, invalidateApiCache } from "../../lib/api";
import { useSetup } from "../../lib/setup-context";
import { resetSetupStep } from "../../app/setup";
import { settingsStyles as s } from "./styles";

export function DevToolsCard() {
  const { theme } = useTheme();
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const apiFetch = useApiFetch();
  const { resetSetup } = useSetup();
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailHasScanned, setGmailHasScanned] = useState(false);
  const [gmailScanning, setGmailScanning] = useState(false);

  const [rematching, setRematching] = useState(false);
  const [rematchResult, setRematchResult] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    if (!user || !devToolsOpen) return;
    const fetchGmailStatus = async () => {
      try {
        const res = await apiFetch("/api/gmail/status");
        if (res.ok) {
          const data = (await res.json()) as {
            connected: boolean;
            lastScanAt: string | null;
          };
          setGmailConnected(data.connected);
          setGmailHasScanned(Boolean(data.lastScanAt));
        }
      } catch {
        /* served from cache when available */
      }
    };
    void fetchGmailStatus();
  }, [user, devToolsOpen, apiFetch]);

  const scanGmail90 = async () => {
    setGmailScanning(true);
    try {
      await apiFetch("/api/gmail/scan", {
        method: "POST",
        body: { daysBack: 90 },
      });
    } catch {
      /* best effort */
    } finally {
      setGmailScanning(false);
    }
  };

  const rematchReceipts = async () => {
    setRematching(true);
    setRematchResult(null);
    try {
      const res = await apiFetch("/api/email-receipts/rematch", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (res.ok) {
        setRematchResult(
          `✓ ${data.matched ?? 0} matched · ${data.cleared ?? 0} wrong matches cleared`,
        );
      } else {
        setRematchResult(
          `Error: ${(data as { error?: string }).error ?? res.status}`,
        );
      }
    } catch {
      setRematchResult("Failed — check connection");
    } finally {
      setRematching(false);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear all data?",
      "This permanently deletes ALL your groups, expenses, settlements, and receipts from Coconut. Your bank connections and account stay intact.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            setClearingAll(true);
            try {
              const res = await apiFetch("/api/groups/clear-all", {
                method: "POST",
              });
              if (res.ok) {
                const data = await res.json();
                const details = [
                  `${data.deletedGroups} group(s) deleted`,
                  data.foreignMembershipsRemoved > 0
                    ? `${data.foreignMembershipsRemoved} foreign link(s) removed`
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n");
                Alert.alert(
                  "All data cleared",
                  details || "Everything wiped.",
                );
                try {
                  const allKeys = await AsyncStorage.getAllKeys();
                  const staleKeys = allKeys.filter((k) =>
                    k.startsWith("coconut.optimistic.friends."),
                  );
                  if (staleKeys.length)
                    await AsyncStorage.multiRemove(staleKeys);
                } catch {
                  /* best effort */
                }
                DeviceEventEmitter.emit("groups-updated");
              } else {
                const errData = await res.json().catch(() => null);
                Alert.alert(
                  "Error",
                  errData?.error ?? "Could not clear data.",
                );
              }
            } catch {
              Alert.alert("Error", "Network error.");
            } finally {
              setClearingAll(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <TouchableOpacity
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
        onPress={() => setDevToolsOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons
            name="construct-outline"
            size={18}
            color={theme.textSecondary}
          />
          <Text
            style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}
          >
            Developer Tools
          </Text>
        </View>
        <Ionicons
          name={devToolsOpen ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.textTertiary}
        />
      </TouchableOpacity>

      {devToolsOpen ? (
        <View style={{ gap: 10, marginTop: 14 }}>
          {gmailConnected && gmailHasScanned ? (
            <TouchableOpacity
              style={[
                s.disconnectBtn,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surfaceSecondary,
                },
              ]}
              onPress={scanGmail90}
              disabled={gmailScanning}
            >
              <Text
                style={[
                  s.disconnectBtnText,
                  { color: theme.textSecondary, fontSize: 14 },
                ]}
              >
                Scan last 90 days
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              s.disconnectBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
            onPress={rematchReceipts}
            disabled={rematching || gmailScanning}
          >
            {rematching ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Text
                style={[
                  s.disconnectBtnText,
                  { color: theme.textSecondary, fontSize: 14 },
                ]}
              >
                Re-match receipts to transactions
              </Text>
            )}
          </TouchableOpacity>
          {rematchResult ? (
            <Text
              style={[
                s.muted,
                {
                  color: theme.textTertiary,
                  fontSize: 12,
                  textAlign: "center",
                },
              ]}
            >
              {rematchResult}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[
              s.disconnectBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
            onPress={() => {
              Alert.alert(
                "Reset Tap to Pay intro?",
                "Clears the 'seen' flag so the full-screen intro modal shows again on next app launch. Use this for recording the Existing User Flow demo video.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Reset",
                    onPress: async () => {
                      try {
                        await AsyncStorage.multiRemove([
                          "coconut_ttp_hero_modal_seen_v1",
                          "coconut_ttp_education_completed_v1",
                        ]);
                        Alert.alert("Done", "Tap to Pay intro will show on next launch.");
                      } catch {
                        Alert.alert("Error", "Could not clear flags.");
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Text style={[s.disconnectBtnText, { color: theme.textSecondary, fontSize: 14 }]}>
              Reset Tap to Pay intro modal
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.disconnectBtn,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
            onPress={() => {
              Alert.alert(
                "Re-run onboarding?",
                "This will take you back to the start of the setup flow. Your data stays intact.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Re-run setup",
                    onPress: () => {
                      resetSetupStep();
                      resetSetup();
                      router.replace("/setup");
                    },
                  },
                ]
              );
            }}
          >
            <Text style={[s.disconnectBtnText, { color: theme.textSecondary, fontSize: 14 }]}>
              Re-run onboarding
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.disconnectBtn,
              {
                borderColor: theme.warning,
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
            onPress={() => {
              Alert.alert(
                "Sign out & restart?",
                "Signs you out completely and resets the onboarding flow so you can test the full new user experience.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign out & restart",
                        style: "destructive",
                        onPress: async () => {
                          invalidateApiCache();
                          resetSetup();
                          // Also reset the one-time TTP modal so the full intro
                          // shows again on next login (new user experience)
                          await AsyncStorage.multiRemove([
                            "coconut_ttp_hero_modal_seen_v1",
                            "coconut_ttp_education_completed_v1",
                          ]).catch(() => {});
                          await signOut();
                        },
                  },
                ]
              );
            }}
          >
            <Text style={[s.disconnectBtnText, { color: theme.warning, fontSize: 14 }]}>
              Sign out &amp; restart as new user
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
            onPress={handleClearAll}
            disabled={clearingAll}
          >
            {clearingAll ? (
              <ActivityIndicator size="small" color={theme.error} />
            ) : (
              <Text
                style={[
                  s.disconnectBtnText,
                  { color: theme.error, fontSize: 14 },
                ]}
              >
                Clear all data
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
