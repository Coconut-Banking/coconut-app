import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { font } from "../../lib/theme";
import { useCoconutShell } from "../../lib/coconut-shell";
import { getExpensePrefillTarget } from "../../lib/add-expense-prefill";
import { sfx } from "../../lib/sounds";

/** Two-tap entry: manual expense vs scan receipt — same coconut shell styling. */
export function ExpensePathPicker() {
  const shell = useCoconutShell();

  const goManual = () => {
    void sfx.pop();
    const prefill = getExpensePrefillTarget();
    router.push({
      pathname: "/(tabs)/add-expense",
      params: {
        prefillNonce: String(Date.now()),
        prefillDesc: "",
        prefillAmount: "",
        prefillPersonKey: prefill?.key ?? "",
        prefillPersonName: prefill?.name ?? "",
        prefillPersonType: prefill?.type ?? "",
      },
    } as Href);
  };

  const goReceipt = () => {
    void sfx.pop();
    router.push("/scan-receipt" as Href);
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={goManual}
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: shell.moneyInSoft, borderColor: shell.moneyInShadow },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: shell.moneyInShadow }]}>
          <Ionicons name="create-outline" size={22} color="#FFFFFF" />
        </View>
        <Text style={[styles.title, { color: shell.moneyInText }]}>Manual</Text>
        <Text style={[styles.sub, { color: shell.moneyInText }]}>Amount & split</Text>
      </Pressable>

      <Pressable
        onPress={goReceipt}
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: shell.mintWash, borderColor: shell.waveBottom },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: shell.cta }]}>
          <Ionicons name="scan-outline" size={22} color="#FFFFFF" />
        </View>
        <Text style={[styles.title, { color: shell.ink }]}>Receipt</Text>
        <Text style={[styles.sub, { color: shell.inkMuted }]}>Scan & assign</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  tile: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 8,
    minHeight: 120,
    justifyContent: "center",
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontFamily: font.bold,
  },
  sub: {
    fontSize: 12,
    fontFamily: font.medium,
    opacity: 0.85,
  },
});
