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
import { useSignIn } from "@clerk/expo/legacy";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { colors, font, radii, shadow } from "../../lib/theme";

function getClerkErrorMessage(e: unknown, fallback: string): string {
  const err = e as { errors?: Array<{ longMessage?: string; message?: string }>; message?: string };
  const first = err?.errors?.[0];
  return first?.longMessage || first?.message || err?.message || fallback;
}

type Step = "email" | "code" | "done";

export default function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const { isLoaded, signIn, setActive } = useSignIn() as unknown as {
    isLoaded: boolean;
    signIn: {
      create: (params: { strategy: string; identifier: string }) => Promise<{ supportedFirstFactors?: Array<{ strategy: string; emailAddressId?: string }> }>;
      prepareFirstFactor: (params: { strategy: string; emailAddressId: string }) => Promise<void>;
      attemptFirstFactor: (params: { strategy: string; code: string; password: string }) => Promise<{ status: string; createdSessionId?: string }>;
    } | undefined;
    setActive: ((opts: { session: string }) => Promise<void>) | undefined;
  };

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (!isLoaded || !signIn) {
      setError("Auth is still loading. Please try again.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      const emailFactor = result.supportedFirstFactors?.find(
        (f) => f.strategy === "reset_password_email_code"
      );
      if (emailFactor?.emailAddressId) {
        await signIn.prepareFirstFactor({
          strategy: "reset_password_email_code",
          emailAddressId: emailFactor.emailAddressId,
        });
      }
      setStep("code");
    } catch (e: unknown) {
      setError(getClerkErrorMessage(e, "Could not send reset code. Check your email and try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!signIn || !setActive) return;
    if (!code.trim()) {
      setError("Enter the verification code.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password: newPassword,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        setStep("done");
      } else {
        setError("Password reset is not complete. Please try again.");
      }
    } catch (e: unknown) {
      setError(getClerkErrorMessage(e, "Reset failed. Check your code and try again."));
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
          <Pressable onPress={() => router.replace("/(auth)/sign-in")} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.primary }]}>Back</Text>
          </Pressable>

          <View style={styles.brand}>
            <Text style={[styles.title, { color: theme.text }]}>Reset password</Text>
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
              {step === "email"
                ? "Enter your email and we'll send a reset code."
                : step === "code"
                ? "Enter the code we sent and your new password."
                : "Your password has been reset!"}
            </Text>
          </View>

          {step === "email" && (
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
              {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }, (loading || formDisabled) && styles.btnDisabled]}
                onPress={handleSendCode}
                disabled={loading || formDisabled}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send reset code</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === "code" && (
            <View style={styles.form}>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.inputText }]}
                placeholder="Verification code"
                placeholderTextColor={theme.inputPlaceholder}
                value={code}
                onChangeText={setCode}
                autoCapitalize="none"
                keyboardType="number-pad"
                autoComplete="one-time-code"
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBackground, borderColor: theme.border, color: theme.inputText }]}
                placeholder="New password (8+ characters)"
                placeholderTextColor={theme.inputPlaceholder}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoComplete="password-new"
              />
              {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }, loading && styles.btnDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Reset password</Text>
                )}
              </TouchableOpacity>
              <Pressable onPress={handleSendCode} disabled={loading}>
                <Text style={[styles.resendText, { color: theme.primary }]}>Resend code</Text>
              </Pressable>
            </View>
          )}

          {step === "done" && (
            <View style={styles.form}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.replace("/(tabs)")}
              >
                <Text style={styles.primaryBtnText}>Continue to app</Text>
              </TouchableOpacity>
            </View>
          )}
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
    paddingTop: 16,
    paddingBottom: 32,
    minHeight: "100%",
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginBottom: 8,
  },
  backText: {
    fontSize: 16,
    fontFamily: font.medium,
    fontWeight: "500",
  },
  brand: {
    alignItems: "center",
    marginBottom: 36,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: font.bold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.textTertiary,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 16,
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
  resendText: {
    fontSize: 14,
    fontFamily: font.medium,
    textAlign: "center",
    marginTop: 8,
  },
});
