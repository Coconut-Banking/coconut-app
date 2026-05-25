import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useCoconutShell, coconutBubbleShadow } from "../../lib/coconut-shell";

type Props = ViewProps & {
  children: React.ReactNode;
  tint?: "default" | "mint" | "green" | "coral";
};

export function CoconutBubbleCard({ children, style, tint = "default", ...rest }: Props) {
  const shell = useCoconutShell();
  const bg =
    tint === "mint"
      ? shell.mintWash
      : tint === "green"
        ? shell.moneyInSoft
        : tint === "coral"
          ? shell.moneyOutSoft
          : shell.card;

  return (
    <View style={[styles.card, coconutBubbleShadow, { backgroundColor: bg, borderColor: shell.cardBorder }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
});
