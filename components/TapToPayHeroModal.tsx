import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  AppState,
  DeviceEventEmitter,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { font, radii } from "../lib/theme";
import { useTheme } from "../lib/theme-context";
import { TapToPayButtonIcon } from "./TapToPayButtonIcon";
import { hasSeenTapToPayHeroModal, markTapToPayHeroModalSeen } from "../lib/tap-to-pay-onboarding";
import {
  TTP_ENABLE_REQUESTED_EVENT,
  TTP_EDUCATION_READY_EVENT,
} from "./StripeTerminalEagerConnect";

/**
 * One-time full-screen surface for Tap to Pay discovery (Apple checklist 3.1 / 3.2 style).
 * Shown after the user reaches main tabs; dismissed permanently once seen.
 */
export function TapToPayHeroModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { theme } = useTheme();
  const { isSignedIn, isLoaded } = useAuth();
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enablingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasSignedInRef = useRef(false);
  // Track the last time the app became active so we can measure elapsed time
  const lastActivatedAtRef = useRef<number>(Date.now());

  const scheduleCheck = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Face ID fires when app becomes active and takes ~1–1.5s to scan + animate.
    // We measure how long ago "active" was set and pad to 2s total from that point.
    const elapsed = Date.now() - lastActivatedAtRef.current;
    const remaining = Math.max(0, 2000 - elapsed);
    timerRef.current = setTimeout(async () => {
      if (Platform.OS === "web") return;
      const seen = await hasSeenTapToPayHeroModal();
      if (!seen) setVisible(true);
      setReady(true);
    }, remaining);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (wasSignedInRef.current) return;
    wasSignedInRef.current = true;

    // Schedule based on how long ago the app became active
    scheduleCheck();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        lastActivatedAtRef.current = Date.now();
        scheduleCheck();
      }
    });

    return () => {
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoaded, isSignedIn, scheduleCheck]);

  const dismiss = useCallback(async () => {
    await markTapToPayHeroModalSeen();
    if (enablingTimeoutRef.current) clearTimeout(enablingTimeoutRef.current);
    setEnabling(false);
    setVisible(false);
  }, []);

  // Listen for education screen ready — dismiss modal in sync with navigation
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TTP_EDUCATION_READY_EVENT, () => {
      if (enablingTimeoutRef.current) clearTimeout(enablingTimeoutRef.current);
      setEnabling(false);
      setVisible(false);
    });
    return () => sub.remove();
  }, []);

  const enableTapToPay = useCallback(async () => {
    await markTapToPayHeroModalSeen();
    // Stay visible with loading state — modal dismisses when education screen is ready
    setEnabling(true);
    // Safety fallback: dismiss after 15s if TTP_EDUCATION_READY_EVENT never fires
    enablingTimeoutRef.current = setTimeout(() => {
      setEnabling(false);
      setVisible(false);
    }, 15_000);
    DeviceEventEmitter.emit(TTP_ENABLE_REQUESTED_EVENT);
  }, []);

  const openEducation = useCallback(async () => {
    await markTapToPayHeroModalSeen();
    setVisible(false);
    router.push("/(tabs)/tap-to-pay-education");
  }, [router]);

  if (!ready || !visible) return null;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={dismiss}>
      <View style={[styles.root, { paddingTop: insets.top, minHeight: height, backgroundColor: theme.background }]}>
        <Pressable style={styles.closeHit} onPress={dismiss} accessibilityLabel="Close">
          <TapToPayButtonIcon color={theme.textTertiary} size={28} />
        </Pressable>

        <View style={styles.hero}>
          <View style={[styles.iconWrap, { backgroundColor: theme.primaryLight }]}>
            <TapToPayButtonIcon color={theme.primary} size={44} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Tap to Pay on iPhone</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            Accept contactless cards and digital wallets on your iPhone — no extra hardware needed.
            Tap below to enable and accept the Terms and Conditions.
          </Text>
        </View>

        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
          {/* Primary CTA — explicitly triggers Apple T&C (checklist §3.5) */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary, opacity: enabling ? 0.85 : 1 }]}
            onPress={enableTapToPay}
            activeOpacity={0.9}
            disabled={enabling}
          >
            {enabling ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <TapToPayButtonIcon color="#fff" size={20} />
                <Text style={[styles.primaryBtnText, { marginLeft: 8 }]}>Enable Tap to Pay on iPhone</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={openEducation} activeOpacity={0.85}>
            <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>How it works</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismiss} style={styles.tertiaryWrap} hitSlop={12}>
            <Text style={[styles.tertiary, { color: theme.textTertiary }]}>Set up later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: font.bold,
    fontWeight: "700",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 17,
    fontFamily: font.regular,
    lineHeight: 26,
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: radii.xl,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: radii.xl,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
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
  },
});
