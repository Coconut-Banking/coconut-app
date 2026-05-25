import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "../../lib/theme-context";
import { font } from "../../lib/theme";
import { HomeSpeedDialSearch, type DateFilterPreset } from "./HomeSpeedDialSearch";
import { TransactionSourceTabs } from "../transactions/TransactionSourceTabs";
import type { TxSourceTab } from "../../lib/transaction-filters";
import type { TextInput } from "react-native";

/** Pinned search + filters while filtering home transactions (keyboard open). */
export const HomeTransactionSearchHeader = React.memo(function HomeTransactionSearchHeader({
  searchInputRef,
  query,
  onQueryChange,
  dateFilter,
  onDateFilterChange,
  txSource,
  onTxSourceChange,
  onSubmitSearch,
  onDone,
}: {
  searchInputRef: React.RefObject<TextInput | null>;
  query: string;
  onQueryChange: (q: string) => void;
  dateFilter: DateFilterPreset;
  onDateFilterChange: (p: DateFilterPreset) => void;
  txSource: TxSourceTab;
  onTxSourceChange: (tab: TxSourceTab) => void;
  onSubmitSearch?: () => void;
  onDone: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: theme.text }]}>Bank transactions</Text>
        <TouchableOpacity onPress={onDone} hitSlop={12} style={styles.doneBtn}>
          <Text style={[styles.doneText, { color: theme.text }]}>Done</Text>
        </TouchableOpacity>
      </View>
      <TransactionSourceTabs value={txSource} onChange={onTxSourceChange} />
      <HomeSpeedDialSearch
        inputRef={searchInputRef}
        query={query}
        onQueryChange={onQueryChange}
        dateFilter={dateFilter}
        onDateFilterChange={onDateFilterChange}
        onSubmitSearch={onSubmitSearch}
        autoFocus
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    fontSize: 17,
    fontFamily: font.semibold,
    letterSpacing: -0.2,
  },
  doneBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  doneText: {
    fontSize: 16,
    fontFamily: font.semibold,
  },
});
