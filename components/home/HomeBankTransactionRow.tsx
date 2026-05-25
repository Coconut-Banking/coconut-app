import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MerchantLogo } from "../merchant/MerchantLogo";
import { SplitSwipeRow } from "../gestures/SplitSwipeRow";
import { font } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";
import { formatHomeMoney } from "../../lib/home-format";
import { homeMoneyType } from "../../lib/home-money-type";

export type HomeTransactionListItem = {
  id: string;
  merchant: string;
  dateLine: string;
  dateIso?: string;
  amount: number;
  logoUrl?: string | null;
  category?: string | null;
  alreadySplit?: boolean;
  isPending?: boolean;
  hasEmailReceipt?: boolean;
  purchaseLocation?: string | null;
};

import { HOME_TX_ROW_HEIGHT } from "../../lib/home-tx-row";

export { HOME_TX_ROW_HEIGHT };

export const HomeBankTransactionRow = React.memo(function HomeBankTransactionRow({
  item,
  onPress,
  onSplit,
}: {
  item: HomeTransactionListItem;
  onPress: () => void;
  onSplit: () => void;
}) {
  const { theme } = useTheme();
  const home = useHomePalette();

  const row = (
    <Pressable
      style={[styles.row, { backgroundColor: home.boxFill }]}
      onPress={onPress}
    >
      <View style={styles.logoWrap}>
        <MerchantLogo
          merchantName={item.merchant}
          size={32}
          logoUrl={item.logoUrl}
          category={item.category}
          backgroundColor="transparent"
          borderColor="transparent"
        />
      </View>
      <View style={styles.mid}>
        <Text style={[styles.merchant, { color: home.txAmount }]} numberOfLines={1}>
          {item.merchant}
        </Text>
        <Text style={[styles.date, { color: home.txAmount }]} numberOfLines={1}>
          {item.dateLine}
        </Text>
      </View>
      <View style={styles.amountCol}>
        <Text
          style={[
            styles.amount,
            homeMoneyType,
            { color: item.isPending ? theme.textTertiary : home.txAmount },
          ]}
          numberOfLines={1}
        >
          {formatHomeMoney(item.amount)}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <SplitSwipeRow onSplit={onSplit} enabled={!item.alreadySplit}>
        {row}
      </SplitSwipeRow>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: HOME_TX_ROW_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  logoWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mid: {
    flex: 1,
    minWidth: 0,
    marginLeft: 8,
    marginRight: 6,
    justifyContent: "center",
  },
  merchant: {
    fontSize: 12,
    fontFamily: font.regular,
    letterSpacing: 0.36,
  },
  date: {
    fontSize: 10,
    fontFamily: font.medium,
    marginTop: 2,
    letterSpacing: 0.3,
    opacity: 0.85,
  },
  amountCol: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 72,
    maxWidth: 120,
  },
  amount: {
    fontSize: 16,
    letterSpacing: 0.48,
    textAlign: "right",
  },
});
