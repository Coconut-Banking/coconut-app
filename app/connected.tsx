import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useApiFetch } from "../lib/api";
import { useTheme } from "../lib/theme-context";
import { colors, font, radii } from "../lib/theme";

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 45000; // Give auth/token + first sync enough time
const SHOW_SKIP_AFTER_MS = 8000; // Show manual continue after 8s

/**
 * Handles coconut://connected deep link from web connect flow.
 * Polls /api/plaid/status until linked, then navigates to Home.
 */
export default function ConnectedScreen() {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [status, setStatus] = useState<"polling" | "linked" | "timeout">("polling");
  const [showSkip, setShowSkip] = useState(false);
  const startRef = useRef(Date.now());

  const goHome = () => router.replace("/(tabs)/");

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let skipId: ReturnType<typeof setTimeout>;

    skipId = setTimeout(() => {
      if (!cancelled) setShowSkip(true);
    }, SHOW_SKIP_AFTER_MS);

    const poll = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - startRef.current;
      if (elapsed >= MAX_WAIT_MS) {
        setStatus("timeout");
        return;
      }
      try {
        const res = await apiFetch("/api/plaid/status");
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        // 425 from app client means auth/token still warming up — keep polling.
        if (res.status === 425) {
          if (!cancelled) timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        if (data?.linked) {
          setStatus("linked");
          goHome();
          return;
        }
      } catch {
        // keep polling
      }
      if (!cancelled) {
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      clearTimeout(skipId);
    };
  }, [apiFetch]);

  const subtext =
    status === "timeout"
      ? "Still syncing. You can continue now, or wait and we'll keep checking."
      : "Importing your transactions…";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.primaryLight }]}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.text, { color: theme.text }]}>Bank connected!</Text>
        <Text style={[styles.subtext, { color: theme.textTertiary }]}>{subtext}</Text>
        {showSkip && status === "polling" && (
          <TouchableOpacity style={[styles.skipBtn, { backgroundColor: theme.border }]} onPress={goHome}>
            <Text style={[styles.skipBtnText, { color: theme.textSecondary }]}>Continue to app</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryLight,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  text: {
    fontFamily: font.semibold,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  subtext: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textTertiary,
  },
  skipBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radii.md,
    backgroundColor: colors.border,
  },
  skipBtnText: {
    fontFamily: font.semibold,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
