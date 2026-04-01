import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { font, radii, colors as palette } from "../lib/theme";
import { hasSeenTapToPayHeroModal, markTapToPayHeroModalSeen } from "../lib/tap-to-pay-onboarding";

/**
 * One-time full-screen surface for Tap to Pay discovery (Apple checklist 3.1 / 3.2 style).
 * Shown after the user reaches main tabs; dismissed permanently once seen.
 */
export function TapToPayHeroModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS === "web") return;
      const seen = await hasSeenTapToPayHeroModal();
      if (!cancelled && !seen) {
        setVisible(true);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(async () => {
    await markTapToPayHeroModalSeen();
    setVisible(false);
  }, []);

  const openAddExpense = useCallback(async () => {
    await markTapToPayHeroModalSeen();
    setVisible(false);
    router.push("/(tabs)/add-expense");
  }, [router]);

  const openEducation = useCallback(async () => {
    await markTapToPayHeroModalSeen();
    setVisible(false);
    router.push("/(tabs)/tap-to-pay-education");
  }, [router]);

  if (!ready || !visible) return null;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={dismiss}>
      <View style={[styles.root, { paddingTop: insets.top, minHeight: height }]}>
        <Pressable style={styles.closeHit} onPress={dismiss} accessibilityLabel="Close">
          <Ionicons name="close" size={28} color={palette.textSecondary} />
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait-outline" size={44} color={palette.primary} />
          </View>
          <Text style={styles.title}>Tap to Pay on iPhone</Text>
          <Text style={styles.body}>
            Accept contactless cards and digital wallets on your iPhone—no extra hardware. Set up payments in
            Settings, then collect when you add an expense or settle up with someone.
          </Text>
        </View>

        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
          <TouchableOpacity style={styles.primaryBtn} onPress={openAddExpense} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>Add an expense</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={openEducation} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>How it works</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismiss} style={styles.tertiaryWrap} hitSlop={12}>
            <Text style={styles.tertiary}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F6F3",
    paddingHorizontal: 24,
  },
  closeHit: {
    alignSelf: "flex-end",
    padding: 8,
    marginBottom: 8,
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 24,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: "#EEF7F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: font.bold,
    fontWeight: "700",
    color: palette.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 17,
    fontFamily: font.regular,
    lineHeight: 26,
    color: palette.textSecondary,
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: palette.primary,
    paddingVertical: 16,
    borderRadius: radii.xl,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderRadius: radii.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C3E0D3",
  },
  secondaryBtnText: {
    color: palette.primary,
    fontSize: 17,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  tertiaryWrap: {
    alignItems: "center",
    paddingVertical: 8,
  },
  tertiary: {
    fontSize: 16,
    fontFamily: font.medium,
    color: palette.textTertiary,
  },
});
