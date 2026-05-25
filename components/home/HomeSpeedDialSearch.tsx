import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Platform,
  type TextInput as TextInputType,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, radii } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { sfx } from "../../lib/sounds";

export type DateFilterPreset = "week" | "month" | "all";

const FILTER_CHIPS: { id: DateFilterPreset; label: string }[] = [
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "all", label: "All" },
];

export const HomeSpeedDialSearch = React.memo(function HomeSpeedDialSearch({
  query,
  onQueryChange,
  dateFilter,
  onDateFilterChange,
  onSubmitSearch,
  onFocus,
  onBlur,
  inputRef,
  autoFocus,
  variant = "input",
  onActivate,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  dateFilter: DateFilterPreset;
  onDateFilterChange: (p: DateFilterPreset) => void;
  onSubmitSearch?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  inputRef?: React.RefObject<TextInputType | null>;
  autoFocus?: boolean;
  /** `trigger` = tap-to-open bar; `input` = real text field */
  variant?: "input" | "trigger";
  onActivate?: () => void;
}) {
  const { theme } = useTheme();
  const localRef = useRef<TextInputType>(null);

  const setInputRef = useCallback(
    (node: TextInputType | null) => {
      localRef.current = node;
      if (inputRef) inputRef.current = node;
    },
    [inputRef],
  );

  const onChip = useCallback(
    (id: DateFilterPreset) => {
      void sfx.toggle();
      onDateFilterChange(id);
    },
    [onDateFilterChange],
  );

  if (variant === "trigger") {
    return (
      <View style={styles.wrap}>
        <Pressable
          onPress={onActivate}
          style={[styles.searchShell, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
          accessibilityRole="button"
          accessibilityLabel="Search transactions"
        >
          <Ionicons name="search" size={18} color={theme.textTertiary} />
          <Text
            style={[
              styles.triggerLabel,
              { color: query.trim() ? theme.text : theme.textTertiary },
            ]}
            numberOfLines={1}
          >
            {query.trim() || "Search"}
          </Text>
          {query.length > 0 ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                onQueryChange("");
              }}
              hitSlop={10}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </Pressable>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {FILTER_CHIPS.map((chip) => {
            const active = dateFilter === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => onChip(chip.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? theme.text : theme.surface,
                    borderColor: active ? theme.text : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? "#fff" : theme.textSecondary },
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.searchShell, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          ref={setInputRef}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search"
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.text }]}
          returnKeyType="search"
          onSubmitEditing={onSubmitSearch}
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={autoFocus}
          onFocus={onFocus}
          onBlur={onBlur}
          blurOnSubmit={false}
        />
        {query.length > 0 ? (
          <TouchableOpacity
            onPress={() => onQueryChange("")}
            hitSlop={10}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroll}
        keyboardShouldPersistTaps="handled"
      >
        {FILTER_CHIPS.map((chip) => {
          const active = dateFilter === chip.id;
          return (
            <Pressable
              key={chip.id}
              onPress={() => onChip(chip.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.text : theme.surface,
                  borderColor: active ? theme.text : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#fff" : theme.textSecondary },
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 13 : 11,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: font.regular,
    padding: 0,
  },
  triggerLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: font.regular,
  },
  chipScroll: {
    marginTop: 10,
    marginHorizontal: -2,
  },
  chipRow: {
    gap: 8,
    paddingHorizontal: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13,
    fontFamily: font.semibold,
  },
});
