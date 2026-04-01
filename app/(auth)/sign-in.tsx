import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSignIn } from "@clerk/expo/legacy";
import { useSSO } from "@clerk/expo";
import { useSignInWithGoogle } from "@clerk/expo/google";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { useDemoMode } from "../../lib/demo-mode-context";
import { clerkRejectedGoogleOneTap } from "../../lib/clerk-google";
import { colors, font, fontSize, shadow, radii } from "../../lib/theme";
import { CoconutMark } from "../../components/brand/CoconutMark";

const SIGN_IN_TIMEOUT_MS = 20000;
/** Browser OAuth can take longer than native Google. */
const GOOGLE_OAUTH_FALLBACK_TIMEOUT_MS = 120000;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-app.dev";

function getClerkErrorMessage(e: unknown, fallback: string): string {
  const err = e as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
  const first = err?.errors?.[0];
  return first?.longMessage || first?.message || err?.message || fallback;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default function SignInScreen() {
  const { theme } = useTheme();
  const { setIsDemoOn } = useDemoMode();
  // Clerk v3 types changed but runtime still provides these properties
  const { isLoaded, signIn, setActive } = useSignIn() as unknown as {
    isLoaded: boolean;
    signIn: { create: (params: { identifier: string; password: string }) => Promise<{ createdSessionId?: string }> } | undefined;
    setActive: ((opts: { session: string }) => Promise<void>) | undefined;
  };
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const { startSSOFlow } = useSSO();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [clerkStuckHint, setClerkStuckHint] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setClerkStuckHint(true), 8000);
    return () => clearTimeout(t);
  }, [isLoaded]);

  const handleGoogleSignIn = async () => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    setError("");
    setGoogleLoading(true);
    try {
      const result = await withTimeout(
        startSSOFlow({ strategy: "oauth_google" }),
        GOOGLE_OAUTH_FALLBACK_TIMEOUT_MS,
        "Google OAuth (browser)"
      );
      if (result.createdSessionId && result.setActive) {
        await withTimeout(
          result.setActive({ session: result.createdSessionId }),
          SIGN_IN_TIMEOUT_MS,
          "Google OAuth setActive"
        );
        setIsDemoOn(false);
        return;
      }
      setError("Google sign-in did not complete. Try again.");
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "SIGN_IN_CANCELLED" || err.code === "-5") return;
      const msg = getClerkErrorMessage(e, "Google sign-in failed");
      if (msg.toLowerCase().includes("already signed in")) {
        setIsDemoOn(false);
        return;
      }
      if (__DEV__) console.warn("[GoogleSignIn]", msg);
      setError(msg);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!isLoaded || !signIn) {
      setError("Auth is still loading. Please try again.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await withTimeout(
        signIn.create({ identifier: email.trim(), password } as { identifier: string; password: string }),
        SIGN_IN_TIMEOUT_MS,
        "Password sign-in"
      );
      const result = res as { createdSessionId?: string };
      if (result?.createdSessionId && setActive) {
        await withTimeout(
          setActive({ session: result.createdSessionId }),
          SIGN_IN_TIMEOUT_MS,
          "Password setActive"
        );
      } else {
        setError("Sign-in did not create a session. Please try again.");
      }
    } catch (e: unknown) {
      const msg = getClerkErrorMessage(e, "Sign in failed");
      if (msg.toLowerCase().includes("already signed in")) {
        setIsDemoOn(false);
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const webLoginUrl = `${API_URL.replace(/\/$/, "")}/login?redirect_url=${encodeURIComponent(`${API_URL.replace(/\/$/, "")}/auth/return-to-app`)}`;
  const formDisabled = !isLoaded;
  const canAttemptSignIn = email.trim().length > 0 && password.length > 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.decorWrap} pointerEvents="none">
            <View style={[styles.decorBlob, styles.decorBlobA, { backgroundColor: theme.primaryLight }]} />
            <View style={[styles.decorBlob, styles.decorBlobB, { backgroundColor: theme.accentMuted }]} />
          </View>

          {/* Brand */}
          <View style={styles.brand}>
            <CoconutMark size={76} elevated />
            <Text style={[styles.title, { color: theme.text }]}>Coconut</Text>
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>Sign in to your account</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.demoBtn,
              {
                borderColor: theme.accent,
                backgroundColor: theme.surfaceSecondary,
                borderWidth: 2,
              },
            ]}
            onPress={() => {
              setIsDemoOn(true);
              router.replace("/(tabs)");
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.demoIconWrap, { backgroundColor: theme.accentMuted }]}>
              <Ionicons name="sparkles" size={22} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.demoBtnTitle, { color: theme.text }]}>Try demo — no sign-in</Text>
              <Text style={[styles.demoBtnSub, { color: theme.textTertiary }]}>
                Sample friends, splits & add-expense flow (simulator-friendly)
              </Text>
            </View>
            <Text style={[styles.demoBtnChevron, { color: theme.accent }]}>→</Text>
          </TouchableOpacity>

          {/* Primary: Google */}
          {(Platform.OS === "ios" || Platform.OS === "android") && (
            <TouchableOpacity
              style={[styles.googleBtn, { backgroundColor: theme.surface, borderColor: theme.border }, (googleLoading || formDisabled) && styles.btnDisabled]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading || formDisabled}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#5F6368" />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={[styles.googleText, { color: theme.textSecondary }]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textQuaternary }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          {/* Email / Password */}
          <View style={styles.form}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.inputText }]}
              placeholder="Email"
              placeholderTextColor={theme.inputPlaceholder}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!formDisabled}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.inputText }]}
              placeholder="Password"
              placeholderTextColor={theme.inputPlaceholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              editable={!formDisabled}
            />
            {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
            {clerkStuckHint && !isLoaded && (
              <Text style={styles.hint}>
                Auth is loading slowly. Try the browser option below.
              </Text>
            )}
            <Pressable onPress={() => router.push("/(auth)/forgot-password")}>
              <Text style={[styles.forgotText, { color: theme.primary }]}>Forgot password?</Text>
            </Pressable>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primary }, (loading || (formDisabled && !canAttemptSignIn)) && styles.btnDisabled]}
              onPress={handleSignIn}
              disabled={loading || (!canAttemptSignIn && formDisabled)}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Sign in</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Sign up link */}
          <Pressable
            style={styles.swapBtn}
            onPress={() => router.replace("/(auth)/sign-up")}
          >
            <Text style={[styles.swapText, { color: theme.textTertiary }]}>Don't have an account? </Text>
            <Text style={[styles.swapLink, { color: theme.primary }]}>Sign up</Text>
          </Pressable>

          {/* Browser fallback */}
          <Pressable
            style={styles.browserBtn}
            onPress={() => Linking.openURL(webLoginUrl)}
          >
            <Text style={[styles.browserText, { color: theme.textQuaternary }]}>Open login in browser</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 32,
    minHeight: "100%",
    position: "relative",
  },
  decorWrap: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    height: 280,
    overflow: "hidden",
  },
  decorBlob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.9,
  },
  decorBlobA: {
    width: 200,
    height: 200,
    top: -60,
    right: -50,
  },
  decorBlobB: {
    width: 140,
    height: 140,
    top: 40,
    left: -40,
  },
  brand: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    fontFamily: font.bold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.textTertiary,
    marginTop: 6,
  },
  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    marginBottom: 8,
  },
  demoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  demoBtnTitle: { fontSize: 16, fontFamily: font.bold },
  demoBtnSub: { fontSize: 13, fontFamily: font.regular, marginTop: 2, lineHeight: 18 },
  demoBtnChevron: { fontSize: 18, fontFamily: font.semibold },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 24,
    ...shadow.sm,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: "600",
    fontFamily: font.semibold,
    color: colors.blue,
  },
  googleText: {
    fontSize: 16,
    fontWeight: "500",
    fontFamily: font.medium,
    color: colors.textSecondary,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 28,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    fontFamily: font.medium,
    color: colors.textMuted,
    fontWeight: "500",
  },
  form: { gap: 12 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
  },
  error: {
    fontSize: 14,
    fontFamily: font.regular,
    color: colors.red,
    marginTop: 4,
  },
  hint: {
    fontSize: 13,
    fontFamily: font.regular,
    color: colors.amber,
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    ...shadow.md,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: font.semibold,
    color: "#fff",
  },
  btnDisabled: { opacity: 0.6 },
  swapBtn: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 28,
  },
  forgotText: {
    fontSize: 14,
    fontFamily: font.medium,
    textAlign: "right",
    marginTop: 2,
  },
  swapText: { fontSize: 15, fontFamily: font.regular, color: colors.textTertiary },
  swapLink: { fontSize: 15, fontWeight: "600", fontFamily: font.semibold, color: colors.primary },
  browserBtn: {
    marginTop: 24,
    alignSelf: "center",
  },
  browserText: {
    fontSize: 13,
    fontFamily: font.regular,
    color: colors.textMuted,
    textDecorationLine: "underline",
  },
});
