import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
  DeviceEventEmitter,
  NativeModules,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { usePathname } from "expo-router";
import { font, radii, colors as palette } from "../lib/theme";
import { useApiFetch } from "../lib/api";
import { useToast } from "./Toast";
import { useShakeDetector } from "../hooks/useShakeDetector";

function getDeviceInfo() {
  const iosVersion = (NativeModules.PlatformConstants as { osVersion?: string } | undefined)?.osVersion;
  return {
    appVersion: Constants.expoConfig?.version ?? "unknown",
    deviceModel: (Constants.deviceName as string | undefined) ?? undefined,
    osVersion: iosVersion
      ? `${Platform.OS} ${iosVersion}`
      : `${Platform.OS} ${Platform.Version}`,
  };
}

type Severity = "low" | "medium" | "high";

const SEVERITY_OPTIONS: { value: Severity; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#059669" },
  { value: "medium", label: "Medium", color: "#D97706" },
  { value: "high", label: "High", color: "#DC2626" },
];

export function BugReportSheet() {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(600)).current;

  const apiFetch = useApiFetch();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();
  const currentRoute = usePathname();

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  useShakeDetector(open);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("open-bug-report", open);
    return () => sub.remove();
  }, [open]);

  useEffect(() => {
    if (visible) {
      setTitle("");
      setDescription("");
      setSeverity("medium");
      setSubmitError(null);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 70,
      }).start();
    } else {
      slideAnim.setValue(600);
    }
  }, [visible, slideAnim]);

  const submit = useCallback(async () => {
    setSubmitError(null);
    if (title.trim().length < 3) {
      setSubmitError("Title must be at least 3 characters.");
      return;
    }
    if (description.trim().length < 10) {
      setSubmitError("Description must be at least 10 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const { appVersion, deviceModel, osVersion } = getDeviceInfo();
      const timeout = new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10_000)
      );
      const res = await Promise.race([
        apiFetch("/api/bug-report", {
          method: "POST",
          body: {
            title: title.trim(),
            description: description.trim(),
            severity,
            appVersion,
            ...(deviceModel ? { deviceModel } : {}),
            ...(osVersion ? { osVersion } : {}),
            currentRoute,
          },
        }),
        timeout,
      ]);
      const data = (await res.json().catch(() => ({}))) as {
        issueNumber?: number;
        error?: string;
      };
      if (res.ok && data.issueNumber) {
        close();
        showToast(`Thanks! Filed as #${data.issueNumber}`, "success");
      } else {
        setSubmitError(data.error ?? "Failed to submit. Please try again.");
      }
    } catch (e) {
      const msg = e instanceof Error && e.message === "timeout"
        ? "Request timed out. Please try again."
        : "Failed to submit. Check your connection.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [title, description, severity, currentRoute, apiFetch, showToast, close]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={close} />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="bug-outline" size={20} color={palette.text} />
              <Text style={styles.headerTitle}>Report a Bug</Text>
            </View>
            <TouchableOpacity onPress={close} hitSlop={12} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={palette.textTertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder='e.g. "App crashed on split screen"'
              placeholderTextColor={palette.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
              returnKeyType="next"
            />

            <Text style={styles.label}>What happened?</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Describe the issue, steps to reproduce, and what you expected…"
              placeholderTextColor={palette.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />

            <Text style={styles.label}>Severity</Text>
            <View style={styles.severityRow}>
              {SEVERITY_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.severityBtn,
                    severity === opt.value && { borderColor: opt.color, backgroundColor: opt.color + "15" },
                  ]}
                  onPress={() => setSeverity(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.severityBtnText,
                      severity === opt.value && { color: opt.color, fontFamily: font.semibold },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={submit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>
                {submitting ? "Submitting…" : "Submit Report"}
              </Text>
            </TouchableOpacity>

            {submitError ? (
              <Text style={styles.errorText}>{submitError}</Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: font.bold,
    fontWeight: "700",
    color: palette.text,
  },
  label: {
    fontSize: 13,
    fontFamily: font.semibold,
    fontWeight: "600",
    color: palette.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: font.regular,
    color: palette.text,
    marginBottom: 16,
  },
  multiline: {
    height: 100,
    paddingTop: 12,
  },
  severityRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  severityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  severityBtnText: {
    fontSize: 14,
    fontFamily: font.medium,
    color: palette.textSecondary,
  },
  submitBtn: {
    backgroundColor: palette.text,
    paddingVertical: 16,
    borderRadius: radii.xl,
    alignItems: "center",
    marginBottom: 8,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    fontFamily: font.medium,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: font.semibold,
    fontWeight: "600",
  },
});
