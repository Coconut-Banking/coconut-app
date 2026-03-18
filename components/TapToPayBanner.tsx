import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { colors, font, radii, shadow } from "../lib/theme";

const TTP_BANNER_SEEN_KEY = "coconut.ttp_banner_seen";

/** Tap to Pay hero banner — shown once to eligible users (checklist 3.2, 6.2) */
export function TapToPayBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(TTP_BANNER_SEEN_KEY).then((v) => {
      setVisible(v !== "true");
    });
  }, []);

  const onPress = async () => {
    await SecureStore.setItemAsync(TTP_BANNER_SEEN_KEY, "true");
    setVisible(false);
    router.push("/(tabs)/pay");
  };

  if (!visible || Platform.OS !== "ios") return null;

  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.iconWrap}>
        <Ionicons name="hardware-chip-outline" size={28} color={colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Tap to Pay on iPhone</Text>
        <Text style={styles.subtitle}>
          Accept contactless payments with your phone. No reader required.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    padding: 16,
    marginBottom: 16,
    ...shadow.sm,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  content: { flex: 1 },
  title: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: font.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: font.regular,
    color: colors.textSecondary,
  },
});
