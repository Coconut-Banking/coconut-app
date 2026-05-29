import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font } from "../../lib/theme";
import { useCoconutShell } from "../../lib/coconut-shell";

type Props = {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saving?: boolean;
  saveDisabled?: boolean;
  saved?: boolean;
  leftIcon?: "close" | "back";
};

export function CoconutFlowHeader({
  title,
  onClose,
  onSave,
  saveLabel = "Save",
  saving = false,
  saveDisabled = false,
  saved = false,
  leftIcon = "close",
}: Props) {
  const shell = useCoconutShell();

  return (
    <View style={styles.row}>
      <Pressable onPress={onClose} hitSlop={12} style={styles.side} accessibilityRole="button">
        <Ionicons
          name={leftIcon === "back" ? "chevron-back" : "close"}
          size={24}
          color={shell.ink}
        />
      </Pressable>
      <Text style={[styles.title, { color: shell.ink }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.side}>
        {onSave ? (
          <Pressable
            onPress={onSave}
            disabled={saveDisabled || saving}
            hitSlop={10}
            style={({ pressed }) => [
              styles.savePill,
              saveDisabled
                ? { backgroundColor: shell.inputBorder, borderWidth: 1, borderColor: shell.cardBorder }
                : { backgroundColor: shell.cta },
              pressed && !saveDisabled && { backgroundColor: shell.ctaPressed },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={saveDisabled ? shell.inkMuted : "#FFFFFF"} />
            ) : saved ? (
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.saveText,
                  saveDisabled && { color: shell.inkMuted },
                ]}
              >
                {saveLabel}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  side: { width: 72, alignItems: "flex-start", justifyContent: "center" },
  title: {
    flex: 1,
    fontSize: 17,
    fontFamily: font.bold,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  savePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 64,
    alignItems: "center",
  },
  saveText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: font.bold,
  },
});
