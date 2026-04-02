import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  InteractionManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTheme } from "../lib/theme-context";
import { useApiFetch } from "../lib/api";
import { useSetup } from "../lib/setup-context";
import { font, radii, shadow } from "../lib/theme";
import { CoconutMark } from "../components/brand/CoconutMark";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-app.dev";
const TOTAL_STEPS = 4;

type Step = "bank" | "splitwise" | "tap-to-pay" | "email";
const STEPS: Step[] = ["bank", "splitwise", "tap-to-pay", "email"];

const POLL_ATTEMPTS = 4;
const POLL_INTERVAL = 1500;

async function pollPlaidStatus(
  apiFetch: (path: string) => Promise<Response>,
): Promise<boolean> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    try {
      const res = await apiFetch("/api/plaid/status");
      if (res.ok) {
        const data = await res.json();
        if (data?.linked) return true;
      }
    } catch {
      // keep polling
    }
    if (i < POLL_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }
  }
  return false;
}

export default function SetupScreen() {
  const { theme } = useTheme();
  const { markSetupComplete } = useSetup();
  const [currentStep, setCurrentStep] = useState(0);

  const handleComplete = () => {
    markSetupComplete();
  };

  const goNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleComplete();
    }
  };

  const step = STEPS[currentStep];
  const progress = (currentStep + 1) / TOTAL_STEPS;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
        <Animated.View
          style={[styles.progressFill, { backgroundColor: theme.primary, width: `${progress * 100}%` }]}
        />
      </View>

      {step === "bank" && <BankStep onDone={goNext} onSkip={goNext} />}
      {step === "splitwise" && <SplitwiseStep onDone={goNext} onSkip={goNext} />}
      {step === "tap-to-pay" && <TapToPayStep onContinue={goNext} />}
      {step === "email" && <EmailStep onComplete={handleComplete} />}
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 1: BANK CONNECTION
// ────────────────────────────────────────────────────────────────────────────

function BankStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [connecting, setConnecting] = useState(false);
  const [success, setSuccess] = useState(false);

  const connectBank = async () => {
    setConnecting(true);
    try {
      const base = API_URL.replace(/\/$/, "");
      const rawScheme = Constants.expoConfig?.scheme;
      const scheme =
        typeof rawScheme === "string"
          ? rawScheme
          : Array.isArray(rawScheme)
            ? rawScheme[0] ?? "coconut"
            : "coconut";
      const connectUrl = `${base}/connect?from_app=1&scheme=${scheme}`;

      await WebBrowser.openAuthSessionAsync(
        connectUrl,
        `${scheme}://connected`,
        { preferEphemeralSession: false }
      );

      // Always check if the bank was linked after the browser closes — for
      // OAuth banks (Chase etc.) the auth session may dismiss without
      // returning a success callback, but the web flow may have completed.
      const linked = await pollPlaidStatus(apiFetch);
      if (linked) {
        setSuccess(true);
        setTimeout(onDone, 1200);
        return;
      }
    } catch (e) {
      if (__DEV__) console.warn("[setup:bank]", e);
    } finally {
      setConnecting(false);
    }
  };

  if (success) {
    return (
      <View style={styles.centerFull}>
        <Animated.View entering={FadeIn.duration(400)}>
          <View style={[styles.successCircle, { borderColor: theme.primary }]}>
            <Ionicons name="checkmark-circle" size={56} color={theme.primary} />
          </View>
        </Animated.View>
        <Text style={[styles.successTitle, { color: theme.text }]}>Bank connected!</Text>
        <Text style={[styles.successSub, { color: theme.textTertiary }]}>
          Your accounts are now syncing...
        </Text>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.stepContainer}>
      <TouchableOpacity onPress={onSkip} style={styles.skipBtn} hitSlop={12}>
        <Text style={[styles.skipText, { color: theme.textTertiary }]}>Skip for now</Text>
      </TouchableOpacity>

      <View style={styles.illustrationWrap}>
        <View style={[styles.iconBox, { backgroundColor: theme.primary }]}>
          <Ionicons name="business-outline" size={48} color="#fff" />
        </View>
      </View>

      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Connect your bank accounts</Text>
        <Text style={[styles.stepDesc, { color: theme.textTertiary }]}>
          Automatically split charges from your debit and credit cards.
        </Text>

        <View style={styles.benefits}>
          <BenefitRow icon="card-outline" text="Auto-split transactions from your cards" theme={theme} />
          <BenefitRow icon="search-outline" text="Search with plain English" theme={theme} />
          <BenefitRow icon="shield-checkmark-outline" text="Read-only · Powered by Plaid" theme={theme} />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: theme.primary }, connecting && styles.disabled]}
        onPress={connectBank}
        disabled={connecting}
        activeOpacity={0.9}
      >
        {connecting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>Connect Bank Account</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 2: SPLITWISE IMPORT
// ────────────────────────────────────────────────────────────────────────────

function SplitwiseStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [importStats, setImportStats] = useState<{ groups: number; friends: number; expenses: number } | null>(null);

  const connectSplitwise = async () => {
    setConnecting(true);
    try {
      const rawScheme = Constants.expoConfig?.scheme;
      const scheme =
        typeof rawScheme === "string"
          ? rawScheme
          : Array.isArray(rawScheme)
            ? rawScheme[0] ?? "coconut"
            : "coconut";
      const qs = new URLSearchParams({ app: "1", scheme });
      const res = await apiFetch(`/api/splitwise/auth-url?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const serverErr = (data as { error?: string }).error?.trim();
        if (serverErr?.toLowerCase().includes("not configured")) {
          Alert.alert("Splitwise not configured", "The server doesn't have Splitwise API keys set up yet.");
        } else {
          Alert.alert("Error", serverErr ?? "Could not connect to Splitwise.");
        }
        return;
      }

      const url = (data as { url?: string }).url;
      if (!url || typeof url !== "string") {
        Alert.alert("Error", "Server did not return an authorization URL.");
        return;
      }

      const callbackUrl = `${scheme}://splitwise-callback`;
      await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));

      let result: WebBrowser.WebBrowserAuthSessionResult;
      try {
        result = await WebBrowser.openAuthSessionAsync(url, callbackUrl, {
          preferEphemeralSession: true,
        });
      } catch {
        Alert.alert("Error", "Could not open Splitwise authorization.");
        return;
      }

      if (result.type !== "success") return;

      try {
        const returned = new URL(result.url);
        if (returned.searchParams.get("error")) {
          Alert.alert("Splitwise", "Authorization was cancelled or denied.");
          return;
        }
      } catch {
        /* ignore */
      }

      setConnecting(false);
      setImporting(true);

      const importRes = await apiFetch("/api/splitwise/import", { method: "POST" });
      if (importRes.ok) {
        const importData = await importRes.json().catch(() => ({}));
        const stats = importData as { groups?: number; friends?: number; expenses?: number };
        setImportStats({
          groups: stats.groups ?? 0,
          friends: stats.friends ?? 0,
          expenses: stats.expenses ?? 0,
        });
      }

      setImporting(false);
      setSuccess(true);
      setTimeout(onDone, 1500);
    } catch (e) {
      if (__DEV__) console.warn("[setup:splitwise]", e);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setConnecting(false);
      setImporting(false);
    }
  };

  if (success) {
    return (
      <View style={styles.centerFull}>
        <Animated.View entering={FadeIn.duration(400)}>
          <View style={[styles.successCircle, { borderColor: theme.primary }]}>
            <Ionicons name="checkmark-circle" size={56} color={theme.primary} />
          </View>
        </Animated.View>
        <Text style={[styles.successTitle, { color: theme.text }]}>Import complete!</Text>
        <Text style={[styles.successSub, { color: theme.textTertiary }]}>
          Successfully imported from Splitwise
        </Text>
        {importStats && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.statsRow}>
            <StatBadge value={String(importStats.friends)} label="Friends" theme={theme} />
            <StatBadge value={String(importStats.groups)} label="Groups" theme={theme} />
            <StatBadge value={String(importStats.expenses)} label="Expenses" theme={theme} />
          </Animated.View>
        )}
      </View>
    );
  }

  if (importing) {
    return (
      <View style={styles.centerFull}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.successTitle, { color: theme.text, marginTop: 16 }]}>
          Importing from Splitwise...
        </Text>
        <Text style={[styles.successSub, { color: theme.textTertiary }]}>
          Syncing your groups, friends, and balances
        </Text>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.stepContainer}>
      <TouchableOpacity onPress={onSkip} style={styles.skipBtn} hitSlop={12}>
        <Text style={[styles.skipText, { color: theme.textTertiary }]}>Skip for now</Text>
      </TouchableOpacity>

      <View style={styles.illustrationWrap}>
        <View style={[styles.iconRow]}>
          <View style={[styles.iconBoxSmall, { backgroundColor: "#5BC5A7" }]}>
            <Text style={styles.splitwiseLogo}>S</Text>
          </View>
          <Ionicons name="arrow-forward" size={24} color={theme.textQuaternary} style={{ marginHorizontal: 12 }} />
          <View style={[styles.iconBoxSmall, { backgroundColor: theme.primary }]}>
            <CoconutMark size={32} />
          </View>
        </View>
      </View>

      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Already use Splitwise?</Text>
        <Text style={[styles.stepDesc, { color: theme.textTertiary }]}>
          Import all your groups, friends, and balances in seconds.
        </Text>

        <View style={styles.benefits}>
          <BenefitRow icon="people-outline" text="All your friends and contacts" theme={theme} />
          <BenefitRow icon="home-outline" text="Groups with full history" theme={theme} />
          <BenefitRow icon="cash-outline" text="Current balances and IOUs" theme={theme} />
          <BenefitRow icon="sync-outline" text="Automatic two-way sync" theme={theme} />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.primary }, connecting && styles.disabled]}
          onPress={connectSplitwise}
          disabled={connecting}
          activeOpacity={0.9}
        >
          {connecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Import from Splitwise</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onSkip} style={styles.secondaryBtn} hitSlop={8}>
          <Text style={[styles.secondaryBtnText, { color: theme.textTertiary }]}>
            I don't use Splitwise
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 3: TAP TO PAY
// ────────────────────────────────────────────────────────────────────────────

function TapToPayStep({ onContinue }: { onContinue: () => void }) {
  const { theme } = useTheme();

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.stepContainer}>
      <View style={styles.illustrationWrap}>
        <View style={[styles.phoneFrame, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
          <View style={[styles.phoneScreen, { backgroundColor: theme.background }]}>
            <Text style={[styles.phoneLabel, { color: theme.textTertiary }]}>Amount</Text>
            <Text style={[styles.phoneAmount, { color: theme.text }]}>$24.50</Text>
            <View style={[styles.phoneNfc, { backgroundColor: theme.primary }]}>
              <Ionicons name="phone-portrait-outline" size={24} color="#fff" />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Accept payments anywhere</Text>
        <Text style={[styles.stepDesc, { color: theme.textTertiary }]}>
          Turn your iPhone into a contactless payment terminal. No card reader, no extra hardware.
        </Text>

        <View style={styles.benefits}>
          <BenefitRow icon="phone-portrait-outline" text="No extra hardware needed" theme={theme} />
          <BenefitRow icon="flash-outline" text="Accept payments in seconds" theme={theme} />
          <BenefitRow icon="card-outline" text="All major cards & Apple Pay" theme={theme} />
          <BenefitRow icon="locate-outline" text="Perfect for splitting bills" theme={theme} />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
        onPress={onContinue}
        activeOpacity={0.9}
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
        <Ionicons name="arrow-forward" size={20} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 4: EMAIL RECEIPTS
// ────────────────────────────────────────────────────────────────────────────

function EmailStep({ onComplete }: { onComplete: () => void }) {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [connecting, setConnecting] = useState(false);

  const connectGmail = async () => {
    setConnecting(true);
    try {
      const rawScheme = Constants.expoConfig?.scheme;
      const scheme =
        typeof rawScheme === "string"
          ? rawScheme
          : Array.isArray(rawScheme)
            ? rawScheme[0] ?? "coconut"
            : "coconut";
      const redirect = `${scheme}://settings?connected=true`;
      const res = await apiFetch(`/api/gmail/auth?redirect=${encodeURIComponent(redirect)}`);
      const data = await res.json().catch(() => ({}));
      const authUrl = (data as { authUrl?: string }).authUrl;
      if (authUrl) {
        void Linking.openURL(authUrl);
      } else {
        Alert.alert("Gmail", "Could not start Gmail connection.");
      }
    } catch {
      Alert.alert("Gmail", "Could not start Gmail connection.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.stepContainer}>
      <View style={styles.illustrationWrap}>
        <View style={[styles.iconBox, { backgroundColor: "#EA4335" }]}>
          <Ionicons name="mail-outline" size={48} color="#fff" />
        </View>
        <View style={styles.receiptBadges}>
          {["Amazon", "Uber", "Target"].map((name, i) => (
            <Animated.View
              key={name}
              entering={FadeInDown.delay(200 + i * 100).duration(400)}
              style={[styles.receiptBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Ionicons name="checkmark" size={14} color={theme.primary} />
              <Text style={[styles.receiptBadgeText, { color: theme.text }]}>{name}</Text>
            </Animated.View>
          ))}
        </View>
      </View>

      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Auto-import receipts from Gmail</Text>
        <Text style={[styles.stepDesc, { color: theme.textTertiary }]}>
          We scan your inbox for receipts and automatically attach them to your bank transactions.
        </Text>

        <View style={styles.benefits}>
          <BenefitRow icon="mail-outline" text="Scans your Gmail automatically" theme={theme} />
          <BenefitRow icon="sparkles-outline" text="Smart merchant matching" theme={theme} />
          <BenefitRow icon="attach-outline" text="Auto-attach to transactions" theme={theme} />
        </View>

        <View style={[styles.privacyNote, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.primary} />
          <Text style={[styles.privacyText, { color: theme.textTertiary }]}>
            We only read receipts and order confirmations. All other emails are ignored.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: theme.primary }, connecting && styles.disabled]}
        onPress={() => {
          void connectGmail();
          onComplete();
        }}
        disabled={connecting}
        activeOpacity={0.9}
      >
        {connecting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="sparkles" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Start Using Coconut</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function BenefitRow({
  icon,
  text,
  theme,
}: {
  icon: string;
  text: string;
  theme: { text: string; border: string; surfaceSecondary: string };
}) {
  return (
    <View style={styles.benefitRow}>
      <View style={[styles.benefitIcon, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
        <Ionicons name={icon as any} size={20} color={theme.text} />
      </View>
      <Text style={[styles.benefitText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

function StatBadge({
  value,
  label,
  theme,
}: {
  value: string;
  label: string;
  theme: { text: string; textTertiary: string };
}) {
  return (
    <View style={styles.statBadge}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textTertiary }]}>{label}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STYLES
// ────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  progressTrack: {
    height: 3,
    width: "100%",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 32,
    justifyContent: "flex-end",
  },
  skipBtn: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 15,
    fontFamily: font.medium,
    fontWeight: "500",
  },
  illustrationWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBox: {
    width: 120,
    height: 120,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBoxSmall: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  splitwiseLogo: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
    fontFamily: font.extrabold,
  },
  phoneFrame: {
    width: 140,
    height: 260,
    borderRadius: 28,
    padding: 6,
    overflow: "hidden",
  },
  phoneScreen: {
    flex: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneLabel: {
    fontSize: 11,
    fontFamily: font.medium,
    marginBottom: 4,
  },
  phoneAmount: {
    fontSize: 32,
    fontFamily: font.black,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 16,
  },
  phoneNfc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptBadges: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  receiptBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  receiptBadgeText: {
    fontSize: 12,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  stepContent: {
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: font.bold,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 32,
    marginBottom: 8,
  },
  stepDesc: {
    fontSize: 16,
    fontFamily: font.regular,
    lineHeight: 24,
    marginBottom: 20,
  },
  benefits: {
    gap: 12,
    marginBottom: 8,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    fontSize: 15,
    fontFamily: font.regular,
    flex: 1,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: 16,
  },
  privacyText: {
    fontSize: 13,
    fontFamily: font.regular,
    lineHeight: 18,
    flex: 1,
  },
  primaryBtn: {
    height: 56,
    borderRadius: radii.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...shadow.md,
  },
  primaryBtnText: {
    fontSize: 17,
    fontFamily: font.semibold,
    fontWeight: "600",
    color: "#fff",
  },
  secondaryBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: font.medium,
    fontWeight: "500",
  },
  disabled: { opacity: 0.6 },
  centerFull: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  successCircle: {
    marginBottom: 16,
    alignItems: "center",
  },
  successTitle: {
    fontSize: 22,
    fontFamily: font.bold,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  successSub: {
    fontSize: 15,
    fontFamily: font.regular,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 32,
    marginTop: 24,
  },
  statBadge: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontFamily: font.bold,
    fontWeight: "700",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: font.regular,
  },
});
