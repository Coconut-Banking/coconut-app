import React from "react";
import { View, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";

export const HomeActivitySearchBar = React.memo(function HomeActivitySearchBar({
  value,
  onChangeText,
  inputRef,
}: {
  value: string;
  onChangeText: (t: string) => void;
  inputRef?: React.RefObject<TextInput | null>;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Ionicons name="search-outline" size={18} color={theme.textTertiary} />
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: theme.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search activity, bills, people…"
        placeholderTextColor={theme.textTertiary}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={200}
      />
      {value.length > 0 ? (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={10} accessibilityLabel="Clear">
          <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: font.regular,
    paddingVertical: 0,
  },
});
