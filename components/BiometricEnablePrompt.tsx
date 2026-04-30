import { useState } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Alert, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBiometricLock } from "../lib/biometric-lock-context";
import { authenticate, checkBiometricStatus, getBiometricLabel } from "../lib/biometric-lock";
import { useTheme } from "../lib/theme-context";
import { font, radii, shadow } from "../lib/theme";

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /** Called only when user explicitly declines (taps "Not now"). */
  onDecline?: () => void;
}

export function BiometricEnablePrompt({ visible, onDismiss, onDecline }: Props) {
  const { theme } = useTheme();
  const { setEnabled, biometricType } = useBiometricLock();
  const label = getBiometricLabel(biometricType);
  const [trying, setTrying] = useState(false);

  const handleEnable = async () => {
    setTrying(true);

    const status = await checkBiometricStatus();
    if (!status.available) {
      setTrying(false);
      const reason = !status.hasHardware
        ? `This device doesn't support ${label}.`
        : `${label} is not set up on this device. Go to Settings → Face ID & Passcode to enroll.`;
      Alert.alert(`${label} unavailable`, reason, [
        { text: "Open Settings", onPress: () => Linking.openSettings() },
        { text: "OK", style: "cancel" },
      ]);
      return;
    }

    // Use biometricOnly to trigger the actual Face ID/Touch ID prompt
    // (not the passcode fallback). On first use, iOS will show the
    // system permission dialog for NSFaceIDUsageDescription.
    const result = await authenticate(`Allow Coconut to use ${label}`, { biometricOnly: true });
    setTrying(false);

    if (result.success) {
      setEnabled(true);
      onDismiss();
      return;
    }

    console.log("[biometric-prompt] enable failed:", result.error, result.errorCode);

    // User cancelled — don't show an alert, just close
    if (result.error === "user_cancel" || result.errorCode === "user_cancel") {
      return;
    }

    const iosMessage =
      `${label} didn't respond. This can happen if:\n\n` +
      `• ${label} permission is disabled for this app — check Settings → Coconut → ${label}\n` +
      `• You're running in Expo Go, which may not support ${label} — use a development build instead`;

    Alert.alert(
      `${label} didn't work`,
      Platform.OS === "ios" ? iosMessage : "Make sure biometrics are set up on your device.",
      [
        { text: "Open Settings", onPress: () => Linking.openSettings() },
        { text: "Try Again", onPress: handleEnable },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.surfaceSecondary }]}>
            <Ionicons
              name={biometricType === "facial" ? "scan-outline" : "finger-print-outline"}
              size={32}
              color={theme.primary}
            />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Enable {label}?</Text>
          <Text style={[styles.body, { color: theme.textTertiary }]}>
            Lock the app when you leave and unlock instantly with {label}.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.primary }, trying && { opacity: 0.6 }]}
            onPress={handleEnable}
            disabled={trying}
          >
            <Text style={styles.primaryBtnText}>Enable {label}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onDecline ?? onDismiss}>
            <Text style={[styles.secondaryBtnText, { color: theme.textTertiary }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    ...shadow.lg,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: font.bold,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  primaryBtn: {
    width: "100%",
    height: 50,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: font.semibold,
    fontWeight: "600",
    color: "#fff",
  },
  secondaryBtn: {
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: font.medium,
    fontWeight: "500",
  },
});
