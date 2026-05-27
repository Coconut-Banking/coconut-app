import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { font, radii, space } from "../../lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-app.dev";

type Member = { id: string; displayName: string };

export default function CollectPayScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/collect/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Invalid link");
          return;
        }
        setMembers(data.members ?? []);
      } catch {
        setError("Could not load");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const claim = useCallback(
    async (memberId: string) => {
      if (!token) return;
      setClaiming(memberId);
      try {
        const res = await fetch(`${API_URL}/api/collect/${encodeURIComponent(token)}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId }),
        });
        const data = await res.json();
        if (!res.ok) {
          Alert.alert("Error", data.error ?? "Could not continue");
          return;
        }
        if (data.payUrl) await Linking.openURL(data.payUrl);
      } catch {
        Alert.alert("Error", "Network error");
      } finally {
        setClaiming(null);
      }
    },
    [token],
  );

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.error, textAlign: "center", marginTop: 40 }}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={[s.title, { color: theme.text }]}>Who are you?</Text>
        <Text style={[s.sub, { color: theme.textTertiary }]}>
          Tap your name to pay your share
        </Text>
        <View style={s.grid}>
          {members.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[s.nameBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => void claim(m.id)}
              disabled={claiming !== null}
            >
              {claiming === m.id ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <Text style={[s.nameBtnText, { color: theme.text }]}>{m.displayName}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  pad: { padding: space.lg },
  title: { fontFamily: font.bold, fontSize: 22 },
  sub: { fontFamily: font.regular, fontSize: 14, marginTop: 6, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nameBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    minWidth: "45%",
    alignItems: "center",
  },
  nameBtnText: { fontFamily: font.semibold, fontSize: 15 },
});
