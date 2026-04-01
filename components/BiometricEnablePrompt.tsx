import { Modal, View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBiometricLock } from "../lib/biometric-lock-context";
import { authenticate, getBiometricLabel } from "../lib/biometric-lock";
import { useTheme } from "../lib/theme-context";
import { font, radii, shadow } from "../lib/theme";

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function BiometricEnablePrompt({ visible, onDismiss }: Props) {
  const { theme } = useTheme();
  const { setEnabled, biometricType } = useBiometricLock();
  const label = getBiometricLabel(biometricType);

  const handleEnable = async () => {
    const result = await authenticate(`Enable ${label} for Coconut`);
    if (result.success) {
      setEnabled(true);
    }
    onDismiss();
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
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={handleEnable}>
            <Text style={styles.primaryBtnText}>Enable {label}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onDismiss}>
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
