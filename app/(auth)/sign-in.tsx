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
} from "react-native";
import { useSignIn } from "@clerk/expo";
import { useSignInWithGoogle } from "@clerk/expo/google";
import { router } from "expo-router";

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
  // Clerk v3 types changed but runtime still provides these properties
  const { isLoaded, signIn, setActive } = useSignIn() as unknown as {
    isLoaded: boolean;
    signIn: { create: (params: { identifier: string; password: string }) => Promise<{ createdSessionId?: string }> } | undefined;
    setActive: ((opts: { session: string }) => Promise<void>) | undefined;
  };
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const [email, setEmail] = useState("");

  useEffect(() => {
    console.log("[SignInScreen] mounted isLoaded=", isLoaded);
  }, [isLoaded]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    setError("");
    setGoogleLoading(true);
    console.log("[auth-mobile] google_sign_in_start");
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
        console.log("[auth-mobile] google_sign_in_success");
      } else {
        console.warn("[auth-mobile] google_sign_in_missing_session");
        setError("Google sign-in returned no session. Please try again.");
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "SIGN_IN_CANCELLED" || err.code === "-5") return;
      console.error("[auth-mobile] google_sign_in_error", e);
      setError(getClerkErrorMessage(e, "Google sign-in failed"));
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
    console.log("[auth-mobile] password_sign_in_start", { email: email.trim().toLowerCase() });
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
        console.log("[auth-mobile] password_sign_in_success");
      } else {
        console.warn("[auth-mobile] password_sign_in_missing_session");
        setError("Sign-in did not create a session. Please try again.");
      }
    } catch (e: unknown) {
      console.error("[auth-mobile] password_sign_in_error", e);
      setError(getClerkErrorMessage(e, "Sign in failed"));
    } finally {
      setLoading(false);
    }
  };

  const webLoginUrl = `${API_URL.replace(/\/$/, "")}/login`;
  const formDisabled = !isLoaded;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Text style={styles.title}>Coconut</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      {/* Always-available escape: Clerk SignIn can stay loading indefinitely on some devices */}
      <TouchableOpacity
        onPress={() => Linking.openURL(webLoginUrl)}
        style={{
          backgroundColor: "#3D8E62",
          paddingVertical: 14,
          paddingHorizontal: 24,
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16, textAlign: "center" }}>
          Open login in browser
        </Text>
      </TouchableOpacity>
      <Text style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center", marginBottom: 16 }}>
        Or sign in below
      </Text>

      {(Platform.OS === "ios" || Platform.OS === "android") && (
        <>
          <TouchableOpacity
            style={[styles.googleButton, (googleLoading || formDisabled) && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={googleLoading || formDisabled}
          >
            {googleLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </TouchableOpacity>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.button, (loading || formDisabled) && styles.buttonDisabled]}
        onPress={handleSignIn}
        disabled={loading || formDisabled}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => router.replace("/(auth)/sign-up")}
      >
        <Text style={styles.linkText}>
          Don&apos;t have an account? Sign up
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F7FAF8",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  error: {
    color: "#DC2626",
    fontSize: 14,
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#3D8E62",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    marginTop: 16,
    alignSelf: "center",
  },
  linkText: {
    color: "#3D8E62",
    fontSize: 14,
    fontWeight: "500",
  },
  googleButton: {
    backgroundColor: "#4285F4",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  googleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    marginHorizontal: 12,
    color: "#6B7280",
    fontSize: 14,
  },
});
