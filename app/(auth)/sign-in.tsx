import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSSO } from "@clerk/expo";
import { useTheme } from "../../lib/theme-context";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useSetup } from "../../lib/setup-context";

import { font, radii } from "../../lib/theme";
import { CoconutMark } from "../../components/brand/CoconutMark";

const GOOGLE_OAUTH_TIMEOUT_MS = 120000;

function getClerkErrorMessage(e: unknown, fallback: string): string {
  const err = e as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
  const first = err?.errors?.[0];
  return first?.longMessage || first?.message || err?.message || fallback;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const googleLogo = require("../../assets/google-g.png") as number;

export default function SignInScreen() {
  const { theme } = useTheme();
  const { setIsDemoOn } = useDemoMode();
  const { resetSetup } = useSetup();
  const { startSSOFlow } = useSSO();
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    setError("");
    setGoogleLoading(true);
    try {
      const result = await withTimeout(
        startSSOFlow({ strategy: "oauth_google" }),
        GOOGLE_OAUTH_TIMEOUT_MS,
        "Google OAuth"
      );
      if (result.createdSessionId && result.setActive) {
        resetSetup();
        await result.setActive({ session: result.createdSessionId });
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: "#fff" }]} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <CoconutMark size={72} />
          <Text style={styles.title}>Sign in to Coconut</Text>
          <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
            We'll automatically attach receipts{"\n"}from your Gmail to transactions
          </Text>
        </View>

        <View style={styles.bottomSection}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <View style={styles.googleIconWrap}>
                  <Image source={googleLogo} style={styles.googleIcon} />
                </View>
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={[styles.terms, { color: theme.textQuaternary }]}>
            By continuing, you agree to our{" "}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {"\n"}and{" "}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 32,
  },
  topSection: {
    alignItems: "center",
    paddingTop: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: font.bold,
    color: "#000",
    letterSpacing: -0.3,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: font.regular,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
  },
  bottomSection: {
    marginTop: "auto",
    paddingBottom: 40,
  },
  error: {
    fontSize: 14,
    fontFamily: font.regular,
    color: "#C94C4C",
    textAlign: "center",
    marginBottom: 16,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#1e2021",
    borderRadius: radii.xl,
    height: 56,
    paddingHorizontal: 24,
  },
  googleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIcon: {
    width: 18,
    height: 18,
  },
  googleText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: font.semibold,
    color: "#fff",
  },
  btnDisabled: { opacity: 0.6 },
  terms: {
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 20,
  },
  termsLink: {
    textDecorationLine: "underline",
  },
});
