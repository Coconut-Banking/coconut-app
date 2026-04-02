import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSignUp } from "@clerk/expo/legacy";
import { useSignInWithGoogle } from "@clerk/expo/google";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { useDemoMode } from "../../lib/demo-mode-context";
import { clerkRejectedGoogleOneTap } from "../../lib/clerk-google";
import { colors, font, fontSize, shadow, radii } from "../../lib/theme";
import { CoconutMark } from "../../components/brand/CoconutMark";

const SIGN_UP_GOOGLE_OAUTH_TIMEOUT_MS = 120000;

const TIMEOUT_MS = 20000;

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

function getClerkErrorMessage(e: unknown, fallback: string): string {
  const err = e as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
  const first = err?.errors?.[0];
  return first?.longMessage || first?.message || err?.message || fallback;
}

export default function SignUpScreen() {
  const { theme } = useTheme();
  const { setIsDemoOn } = useDemoMode();
  // Clerk v3 types changed but runtime still provides these properties
  const { isLoaded, signUp, setActive } = useSignUp() as unknown as {
    isLoaded: boolean;
    signUp: {
      create: (params: { emailAddress: string; password: string }) => Promise<void>;
      prepareEmailAddressVerification: (opts: { strategy: string }) => Promise<void>;
      attemptEmailAddressVerification: (opts: { code: string }) => Promise<{ status: string; createdSessionId?: string }>;
    } | undefined;
    setActive: ((opts: { session: string }) => Promise<void>) | undefined;
  };
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    setError("");
    setGoogleLoading(true);
    try {
      const { createdSessionId, setActive: setActiveGoogle } = await startGoogleAuthenticationFlow();
      if (createdSessionId && setActiveGoogle) {
        await setActiveGoogle({ session: createdSessionId });
        setIsDemoOn(false);
        router.replace("/(tabs)");
        return;
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "SIGN_IN_CANCELLED" || err.code === "-5") return;
      if (clerkRejectedGoogleOneTap(e)) {
        try {
          const fallback = await Promise.race([
            startSSOFlow({ strategy: "oauth_google" }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Google sign-up (browser) timed out")), SIGN_UP_GOOGLE_OAUTH_TIMEOUT_MS)
            ),
          ]);
          if (fallback.createdSessionId && fallback.setActive) {
            await fallback.setActive({ session: fallback.createdSessionId });
            setIsDemoOn(false);
            router.replace("/(tabs)");
            return;
          }
          setError("Google sign-up (browser) did not complete. Try again.");
        } catch (oauthErr: unknown) {
          const o = oauthErr as { code?: string };
          if (o.code === "SIGN_IN_CANCELLED" || o.code === "-5") return;
          setError(getClerkErrorMessage(oauthErr, "Google sign-up (browser) failed"));
        }
        return;
      }
      setError(getClerkErrorMessage(e, "Google sign-up failed"));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!signUp) return;
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (e: unknown) {
      setError(getClerkErrorMessage(e, "Sign up failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!signUp || !setActive) return;
    setError("");
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        setIsDemoOn(false);
      } else {
        setError("Verification is not complete yet. Please try again.");
      }
    } catch (e: unknown) {
      setError(getClerkErrorMessage(e, "Verification failed"));
    } finally {
      setLoading(false);
    }
  };

  const formDisabled = !isLoaded;

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
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>Create your account</Text>
          </View>

          {/* Primary: Google */}
          {(Platform.OS === "ios" || Platform.OS === "android") && (
            <TouchableOpacity
              style={[styles.googleBtn, { backgroundColor: theme.surface, borderColor: theme.border }, (googleLoading || formDisabled) && styles.btnDisabled]}
              onPress={handleGoogleSignUp}
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

          {/* Form */}
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
            {pendingVerification ? (
              <>
                <Text style={[styles.verifyHint, { color: theme.textTertiary }]}>We sent a code to your email.</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.inputText }]}
                  placeholder="Verification code"
                  placeholderTextColor={theme.inputPlaceholder}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="none"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  editable={!formDisabled}
                />
              </>
            ) : (
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.inputText }]}
                placeholder="Password (8+ characters)"
                placeholderTextColor={theme.inputPlaceholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password-new"
                editable={!formDisabled}
              />
            )}
            {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.primary }, (loading || formDisabled) && styles.btnDisabled]}
              onPress={pendingVerification ? handleVerify : handleSignUp}
              disabled={loading || formDisabled || (pendingVerification ? !code : false)}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {pendingVerification ? "Verify email" : "Create account"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Sign in link */}
          <Pressable
            style={styles.swapBtn}
            onPress={() => router.replace("/(auth)/sign-in")}
          >
            <Text style={[styles.swapText, { color: theme.textTertiary }]}>Already have an account? </Text>
            <Text style={[styles.swapLink, { color: theme.primary }]}>Sign in</Text>
          </Pressable>

          <Pressable
            style={styles.demoLink}
            onPress={() => {
              setIsDemoOn(true);
              router.replace("/(tabs)");
            }}
          >
            <Ionicons name="sparkles" size={16} color={theme.accent} style={{ marginRight: 6 }} />
            <Text style={[styles.demoLinkText, { color: theme.accent }]}>Try demo without an account</Text>
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
  verifyHint: {
    fontSize: 14,
    fontFamily: font.regular,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  error: {
    fontSize: 14,
    fontFamily: font.regular,
    color: colors.red,
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
  demoLink: {
    marginTop: 20,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
  },
  demoLinkText: { fontSize: 14, fontFamily: font.medium, textDecorationLine: "underline" },
  swapBtn: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 28,
  },
  swapText: { fontSize: 15, fontFamily: font.regular, color: colors.textTertiary },
  swapLink: { fontSize: 15, fontWeight: "600", fontFamily: font.semibold, color: colors.primary },
});
