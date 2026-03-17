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
import { useSignIn } from "@clerk/expo/legacy";
import { useSignInWithGoogle } from "@clerk/expo/google";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";

const SIGN_IN_TIMEOUT_MS = 20000;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://coconut-lemon.vercel.app";

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
  // Clerk v3 types changed but runtime still provides these properties
  const { isLoaded, signIn, setActive } = useSignIn() as unknown as {
    isLoaded: boolean;
    signIn: { create: (params: { identifier: string; password: string }) => Promise<{ createdSessionId?: string }> } | undefined;
    setActive: ((opts: { session: string }) => Promise<void>) | undefined;
  };
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
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
      const { createdSessionId, setActive } = await withTimeout(
        startGoogleAuthenticationFlow(),
        SIGN_IN_TIMEOUT_MS,
        "Google auth flow"
      );
      if (createdSessionId && setActive) {
        await withTimeout(
          setActive({ session: createdSessionId }),
          SIGN_IN_TIMEOUT_MS,
          "Google setActive"
        );
        router.replace("/(tabs)");
      } else {
        setError("Google sign-in returned no session. Please try again.");
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "SIGN_IN_CANCELLED" || err.code === "-5") return;
      const msg = getClerkErrorMessage(e, "Google sign-in failed");
      if (msg.toLowerCase().includes("already signed in")) {
        router.replace("/(tabs)");
        return;
      }
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
        router.replace("/(tabs)");
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
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.surface }]} edges={["top", "bottom"]}>
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
          {/* Brand */}
          <View style={styles.brand}>
            <Text style={styles.logo}>🥥</Text>
            <Text style={[styles.title, { color: theme.text }]}>Coconut</Text>
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>Sign in to your account</Text>
          </View>

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
  safe: { flex: 1 },
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 32,
    minHeight: "100%",
  },
  brand: {
    alignItems: "center",
    marginBottom: 40,
  },
  logo: { fontSize: 48, marginBottom: 12 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 6,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4285F4",
  },
  googleText: {
    fontSize: 16,
    fontWeight: "500",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 28,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 13,
    fontWeight: "500",
  },
  form: { gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: {
    fontSize: 14,
    marginTop: 4,
  },
  hint: {
    fontSize: 13,
    color: "#B45309",
    marginTop: 4,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  btnDisabled: { opacity: 0.6 },
  swapBtn: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 28,
  },
  swapText: { fontSize: 15 },
  swapLink: { fontSize: 15, fontWeight: "600" },
  browserBtn: {
    marginTop: 24,
    alignSelf: "center",
  },
  browserText: {
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
