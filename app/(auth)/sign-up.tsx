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
import { useSignUp } from "@clerk/expo/legacy";
import { useSignInWithGoogle } from "@clerk/expo/google";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";

function getClerkErrorMessage(e: unknown, fallback: string): string {
  const err = e as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
  const first = err?.errors?.[0];
  return first?.longMessage || first?.message || err?.message || fallback;
}

export default function SignUpScreen() {
  const { theme } = useTheme();
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
      const { createdSessionId, setActive } = await startGoogleAuthenticationFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "SIGN_IN_CANCELLED" || err.code === "-5") return;
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
  verifyHint: {
    fontSize: 14,
    marginBottom: 4,
  },
  error: {
    fontSize: 14,
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
});
