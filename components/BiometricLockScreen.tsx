import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBiometricLock } from "../lib/biometric-lock-context";
import { authenticate, getBiometricLabel } from "../lib/biometric-lock";
import { useTheme } from "../lib/theme-context";
import { font } from "../lib/theme";
import { CoconutMark } from "./brand/CoconutMark";

export function BiometricLockScreen() {
  const { theme } = useTheme();
  const { unlock, biometricType } = useBiometricLock();
  const label = getBiometricLabel(biometricType);
  const autoTriggered = useRef(false);

  const handleUnlock = async () => {
    const result = await authenticate(`Unlock Coconut with ${label}`);
    if (result.success) unlock();
  };

  useEffect(() => {
    if (autoTriggered.current) return;
    autoTriggered.current = true;
    const timer = setTimeout(handleUnlock, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <CoconutMark size={72} elevated />
        <Text style={[styles.title, { color: theme.text }]}>Coconut</Text>
        <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
          Tap to unlock with {label}
        </Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]} onPress={handleUnlock}>
          <Ionicons
            name={biometricType === "facial" ? "scan-outline" : "finger-print-outline"}
            size={24}
            color="#fff"
          />
          <Text style={styles.buttonText}>Unlock</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontFamily: font.bold,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: font.regular,
    marginBottom: 24,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonText: {
    fontSize: 17,
    fontFamily: font.semibold,
    fontWeight: "600",
    color: "#fff",
  },
});
