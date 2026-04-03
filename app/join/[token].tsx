import { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useAuth } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApiFetch } from "../../lib/api";
import { useTheme } from "../../lib/theme-context";
import { font, radii, shadow } from "../../lib/theme";

export const PENDING_INVITE_KEY = "coconut.pending_invite_token";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://coconut-app.dev";
const MEMBER_COLORS = ["#4A6CF7", "#E8507A", "#F59E0B", "#8B5CF6", "#64748B", "#334155"];
const GROUP_TYPE_EMOJI: Record<string, string> = {
  trip: "✈️", home: "🏠", couple: "💑", other: "👥",
};

interface GroupPreview {
  groupId: string;
  groupName: string;
  groupType: string;
  memberCount: number;
  inviterName: string;
  members: Array<{ display_name: string; initial: string; is_owner: boolean }>;
  recentExpenses: Array<{ description: string; amount: number }>;
}

export default function JoinGroupScreen() {
  const { theme } = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { isSignedIn, isLoaded } = useAuth();
  const apiFetch = useApiFetch();
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ alreadyMember: boolean; groupId: string } | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/invite/${token}`);
      if (!res.ok) { setError("This invite link is no longer valid."); return; }
      const data = await res.json();
      setPreview(data);
    } catch {
      setError("Couldn't load group info. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  useEffect(() => {
    if (!token || !isLoaded) return;
    if (!isSignedIn) { AsyncStorage.setItem(PENDING_INVITE_KEY, token); }
  }, [token, isLoaded, isSignedIn]);

  const handleJoin = async () => {
    if (!token || joining || !isLoaded) return;
    if (!isSignedIn) {
      await AsyncStorage.setItem(PENDING_INVITE_KEY, token);
      router.replace("/(auth)/sign-in");
      return;
    }
    setJoining(true);
    try {
      const res = await apiFetch(`/api/invite/${token}/join`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to join group"); return; }
      setResult({ alreadyMember: data.alreadyMember, groupId: data.groupId });
      await AsyncStorage.removeItem(PENDING_INVITE_KEY);
      DeviceEventEmitter.emit("groups-updated");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setJoining(false);
    }
  };

  const navigateToGroup = (groupId: string) => {
    router.replace({ pathname: "/(tabs)/shared/group", params: { id: groupId } });
  };

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={st.closeBtnTopRight} onPress={dismiss} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={theme.textTertiary} />
        </TouchableOpacity>
        <View style={st.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !preview) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={st.closeBtnTopRight} onPress={dismiss} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={theme.textTertiary} />
        </TouchableOpacity>
        <View style={st.centered}>
          <View style={[st.iconCircle, { backgroundColor: theme.surfaceSecondary }]}>
            <Ionicons name="link-outline" size={32} color={theme.textQuaternary} />
          </View>
          <Text style={[st.title, { color: theme.text }]}>Invalid invite link</Text>
          <Text style={[st.subtitle, { color: theme.textTertiary }]}>
            This link is no longer valid. Ask the group creator for a new one.
          </Text>
          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={dismiss} activeOpacity={0.7}
          >
            <Text style={st.primaryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (result) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={st.closeBtnTopRight} onPress={dismiss} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={theme.textTertiary} />
        </TouchableOpacity>
        <View style={st.centered}>
          <View style={[st.iconCircle, { backgroundColor: theme.primaryLight }]}>
            <Ionicons
              name={result.alreadyMember ? "people" : "checkmark-circle"}
              size={36} color={theme.primary}
            />
          </View>
          <Text style={[st.title, { color: theme.text }]}>
            {result.alreadyMember ? "Already a member" : "You're in!"}
          </Text>
          <Text style={[st.subtitle, { color: theme.textTertiary }]}>
            {result.alreadyMember
              ? `You're already in ${preview?.groupName ?? "this group"}.`
              : `You've joined ${preview?.groupName ?? "the group"}.`}
          </Text>
          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => navigateToGroup(result.groupId)} activeOpacity={0.7}
          >
            <Text style={st.primaryBtnText}>View group</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const emoji = GROUP_TYPE_EMOJI[preview?.groupType ?? "other"] ?? "";

  return (
    <SafeAreaView style={[st.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={st.closeBtn} onPress={dismiss} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={theme.textTertiary} />
        </TouchableOpacity>

        <View style={[st.iconCircle, { backgroundColor: theme.primaryLight, marginBottom: 16 }]}>
          <Text style={{ fontSize: 32 }}>{emoji || "👥"}</Text>
        </View>

        <Text style={[st.label, { color: theme.textTertiary }]}>You're invited to</Text>
        <Text style={[st.groupName, { color: theme.text }]}>{preview?.groupName}</Text>
        <Text style={[st.createdBy, { color: theme.textTertiary }]}>
          Created by {preview?.inviterName}
        </Text>

        <View style={[st.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <Text style={[st.cardLabel, { color: theme.textQuaternary }]}>
            {preview?.memberCount ?? 0} MEMBER{(preview?.memberCount ?? 0) !== 1 ? "S" : ""}
          </Text>
          {(preview?.members ?? []).map((m, i) => (
            <View key={i} style={[st.memberRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.borderLight }]}>
              <View style={[st.avatar, { backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }]}>
                <Text style={st.avatarText}>{m.initial}</Text>
              </View>
              <Text style={[st.memberName, { color: theme.text }]}>{m.display_name}</Text>
              {m.is_owner && <Text style={[st.badge, { color: theme.textQuaternary }]}>Owner</Text>}
            </View>
          ))}
        </View>

        {(preview?.recentExpenses ?? []).length > 0 && (
          <View style={[st.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[st.cardLabel, { color: theme.textQuaternary }]}>RECENT ACTIVITY</Text>
            {(preview?.recentExpenses ?? []).map((e, i) => (
              <View key={i} style={[st.expenseRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.borderLight }]}>
                <Text style={[st.expenseDesc, { color: theme.textSecondary }]}>{e.description}</Text>
                <Text style={[st.expenseAmt, { color: theme.text }]}>${e.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[st.bottomBar, { borderTopColor: theme.borderLight }]}>
        <TouchableOpacity
          style={[st.primaryBtn, { backgroundColor: theme.primary, opacity: (!isLoaded || joining) ? 0.7 : 1 }]}
          onPress={handleJoin} disabled={joining || !isLoaded} activeOpacity={0.7}
        >
          {(joining || !isLoaded)
            ? <ActivityIndicator color="#fff" />
            : <Text style={st.primaryBtnText}>
                {isSignedIn ? `Join ${preview?.groupName ?? "group"}` : "Sign up to join"}
              </Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  scrollContent: { padding: 24, paddingTop: 16, paddingBottom: 120, alignItems: "center" },
  closeBtn: { alignSelf: "flex-end", padding: 4, marginBottom: 8 },
  closeBtnTopRight: { position: "absolute", top: 56, right: 20, zIndex: 10, padding: 4 },
  iconCircle: { width: 64, height: 64, borderRadius: radii.xl, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 13, fontFamily: font.medium, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  groupName: { fontSize: 24, fontWeight: "700", fontFamily: font.bold, marginBottom: 4, textAlign: "center" },
  createdBy: { fontSize: 14, fontFamily: font.regular, marginBottom: 24 },
  card: { width: "100%", borderRadius: radii.lg, padding: 16, marginBottom: 12, ...shadow.sm },
  cardLabel: { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.5, marginBottom: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 13, fontWeight: "700", fontFamily: font.bold },
  memberName: { fontSize: 14, fontFamily: font.medium, flex: 1 },
  badge: { fontSize: 11, fontFamily: font.regular },
  expenseRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  expenseDesc: { fontSize: 13, fontFamily: font.regular, flex: 1 },
  expenseAmt: { fontSize: 13, fontWeight: "600", fontFamily: font.semibold },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: 36, borderTopWidth: 1,
    backgroundColor: "rgba(245,243,242,0.95)",
  },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600", fontFamily: font.semibold },
  title: { fontSize: 20, fontWeight: "700", fontFamily: font.bold, marginBottom: 8, marginTop: 16 },
  subtitle: { fontSize: 14, fontFamily: font.regular, textAlign: "center", marginBottom: 24 },
});
