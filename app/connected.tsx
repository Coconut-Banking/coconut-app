import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useApiFetch } from "../lib/api";

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 45000; // Give auth/token + first sync enough time
const SHOW_SKIP_AFTER_MS = 8000; // Show manual continue after 8s

/**
 * Handles coconut://connected deep link from web connect flow.
 * Polls /api/plaid/status until linked, then navigates to Home.
 */
export default function ConnectedScreen() {
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
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {status === "polling" && <ActivityIndicator size="large" color="#3D8E62" />}
        <Text style={styles.text}>Bank connected!</Text>
        <Text style={styles.subtext}>{subtext}</Text>
        {(showSkip || status === "timeout") && (
          <TouchableOpacity style={styles.skipBtn} onPress={goHome}>
            <Text style={styles.skipBtnText}>Continue to app</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EEF7F2",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  text: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
  },
  subtext: {
    fontSize: 14,
    color: "#6B7280",
  },
  skipBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
  },
  skipBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
});
