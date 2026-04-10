import { useState, useEffect, useRef } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  InteractionManager,
  ScrollView,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { LinkSuccess, LinkExit } from "react-native-plaid-link-sdk";

let _plaid: typeof import("react-native-plaid-link-sdk") | null = null;
async function getPlaid() {
  if (_plaid) return _plaid;
  try {
    _plaid = await import("react-native-plaid-link-sdk");
    if (__DEV__) console.log("[setup:bank] Plaid native SDK loaded ✓");
  } catch (e) {
    _plaid = null;
    console.warn("[setup:bank] Plaid native SDK unavailable, using web fallback:", e);
  }
  return _plaid;
}
const plaidCreate = (...args: Parameters<typeof import("react-native-plaid-link-sdk")["create"]>) =>
  getPlaid().then((p) => p?.create(...args));
const plaidOpen = (...args: Parameters<typeof import("react-native-plaid-link-sdk")["open"]>) =>
  getPlaid().then((p) => p?.open(...args));
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useUser } from "@clerk/expo";
import { useTheme } from "../lib/theme-context";
import { useApiFetch, invalidateApiCache } from "../lib/api";
import { clearMemSummaryCache } from "../hooks/useGroups";
import { useSetup } from "../lib/setup-context";
import { useToast } from "../components/Toast";
import { sendEmailInvite, shareInvite, type InviteLink } from "../lib/invite";
import { font, radii, shadow } from "../lib/theme";
import { CoconutMark } from "../components/brand/CoconutMark";

export const PENDING_FULL_RESET_KEY = "coconut.pending_full_reset";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-app.dev";
const TOTAL_STEPS = 4;

const POLL_ATTEMPTS = 6;
const POLL_INTERVAL = 1500;

async function pollPlaidStatus(
  apiFetch: (path: string) => Promise<Response>,
): Promise<boolean> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    try {
      invalidateApiCache("/api/plaid/status");
      const res = await apiFetch("/api/plaid/status");
      if (res.ok) {
        const data = await res.json();
        if (data?.linked) return true;
      }
    } catch { /* keep polling */ }
    if (i < POLL_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  return false;
}

type Step = "bank" | "splitwise" | "stripe-connect" | "email";
const STEPS: Step[] = ["bank", "splitwise", "stripe-connect", "email"];

// Survives unmount/remount so hot reload preserves the current step.
let _savedSetupStep = 0;

/** Call this before navigating to /setup to force it to start at step 0. */
export function resetSetupStep() {
  _savedSetupStep = 0;
}

export default function SetupScreen() {
  const { theme } = useTheme();
  const { markSetupComplete } = useSetup();
  const apiFetch = useApiFetch();
  const [currentStep, setCurrentStep] = useState(_savedSetupStep);
  const [resetting, setResetting] = useState(false);
  const didCheckReset = useRef(false);

  useEffect(() => {
    if (didCheckReset.current) return;
    didCheckReset.current = true;
    SecureStore.getItemAsync(PENDING_FULL_RESET_KEY).then(async (val) => {
      if (val !== "true") return;
      setResetting(true);
      try {
        // Phase 1: clear groups/splits/settlements first (removes FK references)
        await apiFetch("/api/groups/clear-all", { method: "POST" }).catch(() => {});

        // Phase 2: clear service connections + data (FK-safe now)
        await Promise.allSettled([
          apiFetch("/api/plaid/wipe", { method: "POST" }),
          apiFetch("/api/splitwise/clear", { method: "POST", body: { disconnectToken: true } }),
          apiFetch("/api/gmail/disconnect", { method: "POST" }),
          apiFetch("/api/paypal/disconnect", { method: "POST" }),
        ]);

        // Phase 3: invalidate all API caches
        invalidateApiCache("/api/plaid/status");
        invalidateApiCache("/api/plaid/transactions");
        invalidateApiCache("/api/plaid/accounts");
        invalidateApiCache("/api/splitwise/status");
        invalidateApiCache("/api/gmail/status");
        invalidateApiCache("/api/groups/summary");
        invalidateApiCache("/api/groups/recent-activity");
        invalidateApiCache("/api/groups/person");
        clearMemSummaryCache();

        // Phase 4: clear all local caches
        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const coconutKeys = allKeys.filter((k) => k.startsWith("coconut."));
          if (coconutKeys.length) await AsyncStorage.multiRemove(coconutKeys);
        } catch { /* best effort */ }
      } catch (e) {
        if (__DEV__) console.warn("[setup] full reset failed:", e);
      } finally {
        await SecureStore.deleteItemAsync(PENDING_FULL_RESET_KEY);
        setResetting(false);
        _savedSetupStep = 0;
        setCurrentStep(0);
      }
    }).catch(() => {});
  }, [apiFetch]);

  const handleComplete = () => {
    _savedSetupStep = 0;
    markSetupComplete();
    router.replace("/(tabs)");
  };

  const goBack = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      _savedSetupStep = prev;
      setCurrentStep(prev);
    }
  };

  const goNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      const next = currentStep + 1;
      _savedSetupStep = next;
      setCurrentStep(next);
    } else {
      handleComplete();
    }
  };

  const step = STEPS[currentStep];
  const progress = (currentStep + 1) / TOTAL_STEPS;

  if (resetting) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
        <View style={styles.centerFull}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.successTitle, { color: theme.text, marginTop: 16 }]}>
            Resetting your account...
          </Text>
          <Text style={[styles.successSub, { color: theme.textTertiary }]}>
            Disconnecting services and clearing data
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
        <Animated.View
          style={[styles.progressFill, { backgroundColor: theme.primary, width: `${progress * 100}%` }]}
        />
      </View>

      {/* Nav row */}
      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={goBack}
          style={[styles.navBtn, currentStep === 0 && { opacity: 0 }]}
          disabled={currentStep === 0}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        {step !== "stripe-connect" && (
          <TouchableOpacity onPress={goNext} style={styles.navBtn} hitSlop={12}>
            <Text style={[styles.navSkip, { color: theme.textTertiary }]}>Skip</Text>
          </TouchableOpacity>
        )}
        {step === "stripe-connect" && <View style={styles.navBtn} />}
      </View>

      {step === "bank" && <BankStep onDone={goNext} onSkip={goNext} />}
      {step === "splitwise" && <SplitwiseStep onDone={goNext} onSkip={goNext} />}
      {step === "stripe-connect" && <StripeConnectStep onContinue={goNext} />}
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
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkedCount, setLinkedCount] = useState(0);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefetchedToken = useRef<string | null>(null);
  const prefetchedSdk = useRef<typeof import("react-native-plaid-link-sdk") | null>(null);
  const prefetching = useRef(false);

  useEffect(() => {
    if (prefetching.current) return;
    prefetching.current = true;
    (async () => {
      const [sdk] = await Promise.all([
        getPlaid(),
        apiFetch("/api/plaid/create-link-token", {
          method: "POST",
          body: { redirect_path: "/plaid-oauth" },
        })
          .then(async (res) => {
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            const token = (data as { link_token?: string }).link_token;
            if (token) {
              prefetchedToken.current = token;
              if (__DEV__) console.log("[setup:bank] link token pre-fetched");
            }
          })
          .catch(() => {}),
      ]);
      prefetchedSdk.current = sdk;
    })();
  }, [apiFetch]);

  const connectBank = async () => {
    setConnecting(true);
    setError(null);
    try {
      const plaid = prefetchedSdk.current ?? (await getPlaid());

      if (!plaid) {
        if (__DEV__) console.log("[setup:bank] Native SDK not available → opening web browser");
        const base = API_URL.replace(/\/$/, "");
        const rawScheme = Constants.expoConfig?.scheme;
        const scheme =
          typeof rawScheme === "string"
            ? rawScheme
            : Array.isArray(rawScheme)
              ? rawScheme[0] ?? "coconut"
              : "coconut";
        const connectUrl = `${base}/connect?from_app=1&scheme=${scheme}`;
        const callbackUrl = `${scheme}://connected`;
        await WebBrowser.openAuthSessionAsync(connectUrl, callbackUrl);
        const linked = await pollPlaidStatus(apiFetch);
        if (linked) {
          setSuccess(true);
          setLinkedCount((c) => c + 1);
          toast.show("Bank connected!", "success");
        } else {
          setError("Bank connection not detected. Please try again.");
        }
        setConnecting(false);
        return;
      }

      let linkToken = prefetchedToken.current;
      prefetchedToken.current = null;

      if (!linkToken) {
        const tokenRes = await apiFetch("/api/plaid/create-link-token", {
          method: "POST",
          body: { redirect_path: "/plaid-oauth" },
        });
        if (!tokenRes.ok) {
          const data = await tokenRes.json().catch(() => ({}));
          setError((data as { error?: string }).error ?? "Failed to start bank connection");
          setConnecting(false);
          return;
        }
        const tokenData = await tokenRes.json();
        linkToken = (tokenData as { link_token?: string }).link_token ?? null;
      }

      if (!linkToken) {
        setError("Server did not return a link token");
        setConnecting(false);
        return;
      }

      if (__DEV__) console.log("[setup:bank] Opening native Plaid Link with token:", linkToken.slice(0, 20) + "...");
      await plaidCreate({ token: linkToken });

      const onSuccess = async (success: LinkSuccess) => {
        if (__DEV__) console.log("[setup:bank] plaid link success:", success.publicToken);
        try {
          const exchangeRes = await apiFetch("/api/plaid/exchange-token", {
            method: "POST",
            body: { public_token: success.publicToken },
          });
          if (!exchangeRes.ok) {
            const data = await exchangeRes.json().catch(() => ({}));
            if ((data as { code?: string }).code === "DUPLICATE_INSTITUTION") {
              setIsDuplicate(true);
              setSuccess(true);
              setConnecting(false);
              toast.show("Already connected!", "success");
              return;
            }
            setError((data as { error?: string }).error ?? "Failed to connect bank");
            setConnecting(false);
            return;
          }

          invalidateApiCache("/api/plaid/status");
          invalidateApiCache("/api/plaid/transactions");
          invalidateApiCache("/api/plaid/accounts");
          setSuccess(true);
          setConnecting(false);
          setLinkedCount((c) => c + 1);
          toast.show("Bank connected!", "success");
        } catch (e) {
          if (__DEV__) console.warn("[setup:bank] exchange error:", e);
          setError("Failed to save bank connection. Please try again.");
          setConnecting(false);
        }
      };

      const onExit = (exit: LinkExit) => {
        if (__DEV__) console.log("[setup:bank] plaid link exit:", exit);
        setConnecting(false);
        if (exit.error) {
          const msg = exit.error.displayMessage || exit.error.errorMessage || "Bank connection failed";
          setError(msg);
        }
      };

      await plaidOpen({ onSuccess, onExit });
    } catch (e) {
      if (__DEV__) console.warn("[setup:bank]", e);
      setError("Something went wrong. Please try again.");
      setConnecting(false);
    }
  };

  if (success) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.stepContainer}>
        <View style={styles.centerFull}>
          <Animated.View entering={FadeIn.duration(400)}>
            <View style={[styles.successCircle, { borderColor: theme.primary }]}>
              <Ionicons name="checkmark-circle" size={56} color={theme.primary} />
            </View>
          </Animated.View>
          <Text style={[styles.successTitle, { color: theme.text }]}>
            {isDuplicate
              ? "Already connected!"
              : linkedCount === 1 ? "Bank connected!" : `${linkedCount} banks connected!`}
          </Text>
          <Text style={[styles.successSub, { color: theme.textTertiary }]}>
            {isDuplicate
              ? "This bank is already syncing your transactions."
              : "Your accounts are syncing. Add another bank or continue."}
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={onDone}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setSuccess(false); setError(null); setIsDuplicate(false); }}
            style={[styles.secondaryBtn, { flexDirection: "row", gap: 6, justifyContent: "center" }]}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
            <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
              Add another bank
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  if (error) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.stepContainer}>
        <View style={styles.centerFull}>
          <View style={[styles.successCircle, { borderColor: theme.textTertiary }]}>
            <Ionicons name="alert-circle" size={56} color={theme.textTertiary} />
          </View>
          <Text style={[styles.successTitle, { color: theme.text }]}>
            Connection failed
          </Text>
          <Text style={[styles.successSub, { color: theme.textTertiary }]}>
            {error}
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary }, connecting && styles.disabled]}
            onPress={connectBank}
            disabled={connecting}
            activeOpacity={0.9}
          >
            {connecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Try again</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} style={styles.secondaryBtn} hitSlop={8}>
            <Text style={[styles.secondaryBtnText, { color: theme.textTertiary }]}>
              Skip for now
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.stepContainer}>
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

type UninvitedMember = { displayName: string; email: string | null; groupName: string; inviteToken: string | null };

function SplitwiseStep({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { theme } = useTheme();
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [importStats, setImportStats] = useState<{ groups: number; friends: number; expenses: number } | null>(null);

  const [uninvited, setUninvited] = useState<UninvitedMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [selectedInvites, setSelectedInvites] = useState<Set<number>>(new Set());
  const [sendingInvites, setSendingInvites] = useState(false);

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

      // Check if Splitwise is already authorized (avoids forcing re-auth on retries)
      let alreadyConnected = false;
      try {
        const statusRes = await apiFetch("/api/splitwise/status");
        if (statusRes.ok) {
          const sd = (await statusRes.json().catch(() => ({}))) as { connected?: boolean };
          alreadyConnected = Boolean(sd.connected);
        }
      } catch { /* proceed with auth flow */ }

      if (!alreadyConnected) {
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
      }

      setConnecting(false);
      setImporting(true);

      let members: UninvitedMember[] = [];
      const importRes = await apiFetch("/api/splitwise/import", { method: "POST" });
      if (!importRes.ok) {
        const errData = await importRes.json().catch(() => ({}));
        Alert.alert("Import Error", (errData as { error?: string }).error ?? "Import failed. Please try again.");
        return;
      }

      const importData = await importRes.json().catch(() => ({}));
      const d = importData as {
        stats?: { groups?: number; members?: number; expenses?: number };
        totals?: { groups?: number; friends?: number; expenses?: number };
        uninvitedMembers?: UninvitedMember[];
      };
      setImportStats({
        groups: d.totals?.groups ?? d.stats?.groups ?? 0,
        friends: d.totals?.friends ?? d.stats?.members ?? 0,
        expenses: d.totals?.expenses ?? d.stats?.expenses ?? 0,
      });
      members = d.uninvitedMembers ?? [];

      setImporting(false);
      setSuccess(true);

      if (members.length > 0) {
        setUninvited(members);
        setSelectedInvites(new Set(members.map((_, i) => i)));
        setTimeout(() => setShowInvite(true), 1500);
      } else {
        setTimeout(onDone, 1500);
      }
    } catch (e) {
      if (__DEV__) console.warn("[setup:splitwise]", e);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setConnecting(false);
      setImporting(false);
    }
  };

  const toggleInvite = (idx: number) => {
    setSelectedInvites((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedInvites.size === uninvited.length) {
      setSelectedInvites(new Set());
    } else {
      setSelectedInvites(new Set(uninvited.map((_, i) => i)));
    }
  };

  const handleSendInvites = async () => {
    if (selectedInvites.size === 0) return;
    setSendingInvites(true);
    const senderName = user?.fullName || user?.username || undefined;
    const selected = uninvited.filter((_, i) => selectedInvites.has(i));
    const emails = selected.filter((m) => m.email).map((m) => m.email!);

    const seen = new Set<string>();
    const inviteLinks: InviteLink[] = [];
    for (const m of selected) {
      if (m.inviteToken && !seen.has(m.inviteToken)) {
        seen.add(m.inviteToken);
        inviteLinks.push({ groupName: m.groupName, token: m.inviteToken });
      }
    }

    try {
      if (emails.length > 0) {
        await sendEmailInvite(emails, senderName, inviteLinks);
      } else {
        await shareInvite(senderName, inviteLinks);
      }
    } catch {
      /* user cancelled compose — non-fatal */
    } finally {
      setSendingInvites(false);
      onDone();
    }
  };

  if (showInvite) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={styles.stepContainer}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.stepTitle, { color: theme.text, marginTop: 8 }]}>
            Invite friends to Coconut
          </Text>
          <Text style={[styles.stepDesc, { color: theme.textTertiary }]}>
            {uninvited.length} {uninvited.length === 1 ? "person" : "people"} from your Splitwise
            groups {uninvited.length === 1 ? "isn't" : "aren't"} on Coconut yet.
          </Text>

          <TouchableOpacity
            style={styles.inviteSelectAll}
            onPress={toggleAll}
            activeOpacity={0.7}
          >
            <Ionicons
              name={selectedInvites.size === uninvited.length ? "checkbox" : "square-outline"}
              size={22}
              color={selectedInvites.size === uninvited.length ? theme.primary : theme.textTertiary}
            />
            <Text style={[styles.inviteSelectAllTxt, { color: theme.text }]}>
              {selectedInvites.size === uninvited.length ? "Deselect all" : "Select all"}
            </Text>
          </TouchableOpacity>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {uninvited.map((m, i) => {
              const checked = selectedInvites.has(i);
              return (
                <TouchableOpacity
                  key={`${m.email ?? m.displayName}-${i}`}
                  style={[styles.inviteRow, { borderBottomColor: theme.borderLight }]}
                  onPress={() => toggleInvite(i)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={checked ? theme.primary : theme.textTertiary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inviteName, { color: theme.text }]}>{m.displayName}</Text>
                    <Text style={[styles.inviteMeta, { color: theme.textQuaternary }]}>
                      {m.email ?? "No email"} · {m.groupName}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ gap: 8, paddingTop: 12 }}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: theme.primary },
              (selectedInvites.size === 0 || sendingInvites) && styles.disabled,
            ]}
            onPress={handleSendInvites}
            disabled={selectedInvites.size === 0 || sendingInvites}
            activeOpacity={0.9}
          >
            {sendingInvites ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                Invite {selectedInvites.size > 0 ? `${selectedInvites.size} ` : ""}
                {selectedInvites.size === 1 ? "person" : "people"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onDone} style={styles.secondaryBtn} hitSlop={8}>
            <Text style={[styles.secondaryBtnText, { color: theme.textTertiary }]}>
              Skip for now
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

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
// STEP 3: STRIPE CONNECT — receive tap-to-pay directly to your bank
// ────────────────────────────────────────────────────────────────────────────

const POLL_CONNECT_ATTEMPTS = 6;
const POLL_CONNECT_INTERVAL = 1500;

async function pollConnectStatus(
  apiFetch: (path: string) => Promise<Response>,
): Promise<boolean> {
  for (let i = 0; i < POLL_CONNECT_ATTEMPTS; i++) {
    try {
      const res = await apiFetch("/api/stripe/connect/status");
      if (res.ok) {
        const data = await res.json();
        if ((data as { onboardingComplete?: boolean }).onboardingComplete) return true;
      }
    } catch { /* keep polling */ }
    if (i < POLL_CONNECT_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, POLL_CONNECT_INTERVAL));
  }
  return false;
}

function StripeConnectStep({ onContinue }: { onContinue: () => void }) {
  const { theme } = useTheme();
  const apiFetch = useApiFetch();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startOnboarding = async () => {
    setLoading(true);
    setError(null);
    try {
      const rawScheme = Constants.expoConfig?.scheme;
      const scheme =
        typeof rawScheme === "string"
          ? rawScheme
          : Array.isArray(rawScheme)
            ? rawScheme[0] ?? "coconut"
            : "coconut";

      const res = await apiFetch("/api/stripe/connect/create-account", {
        method: "POST",
        body: { scheme },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string }).error ?? "Could not start setup";
        if (msg.toLowerCase().includes("not configured")) {
          // Stripe not set up in this environment — skip silently
          onContinue();
          return;
        }
        setError(msg);
        setLoading(false);
        return;
      }

      const data = await res.json();
      const url = (data as { url?: string }).url;
      if (!url) {
        setError("Could not get onboarding link. Try again.");
        setLoading(false);
        return;
      }

      // Open Stripe's hosted onboarding in-app
      await WebBrowser.openAuthSessionAsync(url, `${scheme}://stripe-connect-return`);

      // Poll for completion whether the user finished or closed early
      const complete = await pollConnectStatus(apiFetch);
      if (complete) {
        setSuccess(true);
        setTimeout(onContinue, 1400);
      } else {
        // Not complete yet — they can finish later in Settings
        setLoading(false);
      }
    } catch (e) {
      if (__DEV__) console.warn("[setup:stripe-connect]", e);
      setError("Something went wrong. Please try again.");
      setLoading(false);
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
        <Text style={[styles.successTitle, { color: theme.text }]}>Payouts set up!</Text>
        <Text style={[styles.successSub, { color: theme.textTertiary }]}>
          Tap-to-pay payments will be deposited directly to your bank.
        </Text>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(500)} style={styles.stepContainer}>
      <View style={styles.illustrationWrap}>
        <View style={[styles.phoneFrame, { backgroundColor: theme.primary, borderColor: theme.primary, height: 160, width: 110 }]}>
          <View style={[styles.phoneScreen, { backgroundColor: theme.background }]}>
            <Text style={[styles.phoneLabel, { color: theme.textTertiary }]}>Received</Text>
            <Text style={[styles.phoneAmount, { color: theme.text, fontSize: 24, marginBottom: 10 }]}>$24.50</Text>
            <View style={[styles.phoneNfc, { backgroundColor: theme.primary, width: 36, height: 36, borderRadius: 18 }]}>
              <Ionicons name="arrow-down" size={18} color="#fff" />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Get paid directly</Text>
        <Text style={[styles.stepDesc, { color: theme.textTertiary }]}>
          When friends tap to pay you, the money goes straight to your bank account.
        </Text>

        <View style={styles.benefits}>
          <BenefitRow icon="card-outline" text="Accept any card or Apple Pay" theme={theme} />
          <BenefitRow icon="phone-portrait-outline" text="No card reader needed" theme={theme} />
          <BenefitRow icon="flash-outline" text="Deposits in 1–2 business days" theme={theme} />
          <BenefitRow icon="shield-checkmark-outline" text="Powered by Stripe — bank-grade security" theme={theme} />
        </View>

        {error && (
          <Text style={{ color: theme.error ?? "#D32F2F", fontSize: 14, fontFamily: font.medium, marginTop: 8, textAlign: "center" }}>
            {error}
          </Text>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.primary }, loading && styles.disabled]}
          onPress={startOnboarding}
          disabled={loading}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="wallet-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Set up payouts</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onContinue} style={styles.secondaryBtn} hitSlop={8}>
          <Text style={[styles.secondaryBtnText, { color: theme.textTertiary }]}>
            I&apos;ll do this later
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// STEP 4: EMAIL RECEIPTS
// ────────────────────────────────────────────────────────────────────────────

function EmailStep({ onComplete }: { onComplete: () => void }) {
  const { theme } = useTheme();
  const { user } = useUser();
  const apiFetch = useApiFetch();
  const [emailScanEnabled, setEmailScanEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasGoogle = user?.externalAccounts?.some(
    (a) => a.provider === "google",
  ) ?? false;

  const handleComplete = async () => {
    if (hasGoogle) {
      setSaving(true);
      try {
        await apiFetch("/api/gmail/toggle", {
          method: "POST",
          body: { enabled: emailScanEnabled },
        });
      } catch {
        // Non-blocking — preference can be changed in Settings
      } finally {
        setSaving(false);
      }
    }
    onComplete();
  };

  if (!hasGoogle) {
    return (
      <Animated.View entering={FadeInDown.duration(500)} style={styles.stepContainer}>
        <View style={styles.illustrationWrap}>
          <View style={[styles.iconBox, { backgroundColor: "#EA4335" }]}>
            <Ionicons name="mail-outline" size={48} color="#fff" />
          </View>
        </View>

        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.text }]}>Email receipts</Text>
          <Text style={[styles.stepDesc, { color: theme.textTertiary }]}>
            Sign in with Google to automatically scan your Gmail for receipts and match them to
            your transactions. You can set this up later in Settings.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          onPress={onComplete}
          activeOpacity={0.9}
        >
          <Ionicons name="sparkles" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>Start Using Coconut</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

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
        <Text style={[styles.stepTitle, { color: theme.text }]}>Email receipts</Text>
        <Text style={[styles.stepDesc, { color: theme.textTertiary }]}>
          Automatically scan your Gmail for receipts and match them to your transactions.
        </Text>

        <View
          style={[
            styles.toggleRow,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.toggleLabel, { color: theme.text }]}>Scan Gmail for receipts</Text>
            <Text style={[styles.toggleSub, { color: theme.textTertiary }]}>
              Only reads receipts and order confirmations
            </Text>
          </View>
          <Switch
            value={emailScanEnabled}
            onValueChange={setEmailScanEnabled}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor="#fff"
          />
        </View>

        <View style={[styles.privacyNote, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={theme.primary} />
          <Text style={[styles.privacyText, { color: theme.textTertiary }]}>
            We only read receipts and order confirmations. All other emails are ignored.
            You can change this anytime in Settings.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: theme.primary }, saving && styles.disabled]}
        onPress={handleComplete}
        disabled={saving}
        activeOpacity={0.9}
      >
        {saving ? (
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
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  navBtn: {
    padding: 4,
  },
  navSkip: {
    fontSize: 15,
    fontFamily: font.medium,
  },
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  toggleSub: {
    fontSize: 13,
    fontFamily: font.regular,
    lineHeight: 17,
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
  inviteSelectAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    marginBottom: 4,
  },
  inviteSelectAllTxt: {
    fontSize: 15,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inviteName: {
    fontSize: 16,
    fontFamily: font.semibold,
    fontWeight: "600",
    marginBottom: 2,
  },
  inviteMeta: {
    fontSize: 13,
    fontFamily: font.regular,
  },
});
