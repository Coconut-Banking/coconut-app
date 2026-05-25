import React, { useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { GroupsSummary } from "../../hooks/useGroups";
import type { ThemeColors } from "../../lib/colors";
import { MemberAvatar } from "../MemberAvatar";
import { SnapPress } from "../ui";
import { font, radii, shadow } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import {
  getHomeAccentColor,
  getHomeAmountColor,
  getHomeHeadlineLabel,
  useHomePalette,
} from "../../lib/home-theme";
import { formatSplitCurrencyAmount } from "../../lib/format-split-money";
import {
  computeHomeDisplayTotals,
  partitionSummary,
  type HomeOweRow,
} from "../../lib/home-balance";
import { Image as ExpoImage } from "expo-image";
import { sfx } from "../../lib/sounds";

type OweRow = HomeOweRow & { onPress: () => void };

function withNavigation(
  partition: ReturnType<typeof partitionSummary>,
): { owedToYou: OweRow[]; youOwe: OweRow[] } {
  const owedToYou = partition.owedToYou.map((row) => ({
    ...row,
    onPress: row.isGroup
      ? () => router.navigate({ pathname: "/(tabs)/shared/group", params: { id: row.key.slice(2), source: "home" } })
      : () => router.navigate({ pathname: "/(tabs)/shared/person", params: { key: row.key.slice(2), source: "home" } }),
  }));
  const youOwe = partition.youOwe.map((row) => ({
    ...row,
    onPress: row.isGroup
      ? () => router.navigate({ pathname: "/(tabs)/shared/group", params: { id: row.key.slice(2), source: "home" } })
      : () => router.navigate({ pathname: "/(tabs)/shared/person", params: { key: row.key.slice(2), source: "home" } }),
  }));
  return { owedToYou, youOwe };
}

export const HomeBalanceHero = React.memo(function HomeBalanceHero({
  summary,
  defaultCurrency = "USD",
}: {
  summary: GroupsSummary | null;
  defaultCurrency?: string;
}) {
  const { theme } = useTheme();
  const home = useHomePalette();
  const [owedOpen, setOwedOpen] = useState(false);
  const [oweOpen, setOweOpen] = useState(false);

  const { owedToYou, youOwe, currency, owedTotal, oweTotal, net, settled } = useMemo(() => {
    const part = partitionSummary(summary, defaultCurrency);
    const display = computeHomeDisplayTotals(summary, part, defaultCurrency);
    const nav = withNavigation(part);
    return {
      ...nav,
      currency: display.currency,
      owedTotal: display.owedToMe,
      oweTotal: display.iOwe,
      net: display.net,
      settled: display.settled,
    };
  }, [summary, defaultCurrency]);

  const netPositive = net >= 0;
  const accent = getHomeAccentColor(home, settled, netPositive);
  const amountColor = getHomeAmountColor(home, settled, netPositive);
  const headlineLabel = getHomeHeadlineLabel(settled, netPositive);
  const canExpandIn = owedToYou.length > 0;
  const canExpandOut = youOwe.length > 0;

  const toggleOwed = useCallback(() => {
    void sfx.toggle();
    setOwedOpen((v) => !v);
    if (!owedOpen) setOweOpen(false);
  }, [owedOpen]);

  const toggleOwe = useCallback(() => {
    void sfx.toggle();
    setOweOpen((v) => !v);
    if (!oweOpen) setOwedOpen(false);
  }, [oweOpen]);

  const amountText = settled
    ? formatSplitCurrencyAmount(0, currency)
    : `${netPositive ? "+" : "−"}${formatSplitCurrencyAmount(Math.abs(net), currency)}`;

  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: home.heroSurface, borderColor: home.heroBorder },
        shadow.md,
      ]}
    >
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      <View style={styles.heroTop}>
        <Text style={[styles.headline, { color: accent }]}>{headlineLabel}</Text>
        <SnapPress
          onPress={() => router.navigate("/(tabs)/shared")}
          style={[styles.pillLink, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}
          haptic="light"
        >
          <Text style={[styles.pillLinkText, { color: home.ink }]}>Splits</Text>
          <Ionicons name="arrow-forward" size={14} color={home.inkMuted} />
        </SnapPress>
      </View>

      <Text style={[styles.net, { color: amountColor }]}>{amountText}</Text>

      {!settled ? (
        <>
          <View style={styles.statRow}>
            <Pressable
              onPress={canExpandIn ? toggleOwed : undefined}
              disabled={!canExpandIn}
              style={[
                styles.statBox,
                {
                  backgroundColor: home.moneyInSoft,
                  borderColor: owedOpen ? home.moneyIn : home.boxBorder,
                  borderLeftColor: home.moneyIn,
                },
              ]}
            >
              <View style={styles.statHead}>
                <Text style={[styles.statTitle, { color: home.moneyIn }]}>Owed to you</Text>
                {canExpandIn ? (
                  <Ionicons
                    name={owedOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={home.moneyIn}
                  />
                ) : null}
              </View>
              <Text style={[styles.statAmount, { color: home.ink }]}>
                {formatSplitCurrencyAmount(owedTotal, currency)}
              </Text>
            </Pressable>

            <Pressable
              onPress={canExpandOut ? toggleOwe : undefined}
              disabled={!canExpandOut}
              style={[
                styles.statBox,
                {
                  backgroundColor: home.moneyOutSoft,
                  borderColor: oweOpen ? home.moneyOut : home.boxBorder,
                  borderLeftColor: home.moneyOut,
                },
              ]}
            >
              <View style={styles.statHead}>
                <Text style={[styles.statTitle, { color: home.moneyOut }]}>You owe</Text>
                {canExpandOut ? (
                  <Ionicons
                    name={oweOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={home.moneyOut}
                  />
                ) : null}
              </View>
              <Text style={[styles.statAmount, { color: home.ink }]}>
                {formatSplitCurrencyAmount(oweTotal, currency)}
              </Text>
            </Pressable>
          </View>

          {owedOpen ? (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={[styles.detailCard, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}
            >
              {owedToYou.map((r, i) => (
                <DetailRow key={r.key} row={r} isFirst={i === 0} home={home} theme={theme} tone="in" />
              ))}
            </Animated.View>
          ) : null}

          {oweOpen ? (
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={[styles.detailCard, { backgroundColor: home.boxFill, borderColor: home.boxBorder }]}
            >
              {youOwe.map((r, i) => (
                <DetailRow key={r.key} row={r} isFirst={i === 0} home={home} theme={theme} tone="out" />
              ))}
            </Animated.View>
          ) : null}
        </>
      ) : (
        <View style={[styles.settledRow, { backgroundColor: home.moneyInSoft, borderColor: home.moneyIn }]}>
          <Ionicons name="checkmark-circle" size={20} color={home.moneyIn} />
          <Text style={[styles.settledText, { color: home.moneyIn }]}>All caught up</Text>
        </View>
      )}
    </View>
  );
});

function DetailRow({
  row,
  isFirst,
  home,
  theme,
  tone,
}: {
  row: OweRow;
  isFirst: boolean;
  home: ReturnType<typeof useHomePalette>;
  theme: ThemeColors;
  tone: "in" | "out";
}) {
  const dotColor = tone === "in" ? home.moneyIn : home.moneyOut;
  return (
    <Pressable
      onPress={row.onPress}
      style={[
        styles.detailRow,
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: home.boxBorder },
      ]}
    >
      {row.isGroup ? (
        row.imageUrl ? (
          <ExpoImage source={{ uri: row.imageUrl }} style={styles.avatar} cachePolicy="disk" />
        ) : (
          <View style={[styles.avatar, styles.avatarPh, { backgroundColor: theme.surfaceTertiary }]}>
            <Ionicons name="people" size={16} color={theme.textSecondary} />
          </View>
        )
      ) : (
        <MemberAvatar name={row.title} size={40} imageUrl={row.imageUrl ?? null} variant="soft" />
      )}
      <View style={styles.detailMid}>
        <Text style={[styles.detailName, { color: home.ink }]} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={[styles.detailSub, { color: home.inkMuted }]} numberOfLines={1}>
          {row.subtitle}
        </Text>
      </View>
      <Text style={[styles.detailAmt, { color: dotColor }]}>
        {row.lines.map((l) => formatSplitCurrencyAmount(l.amount, l.currency)).join(" · ")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radii["2xl"],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 0,
    marginBottom: 16,
    overflow: "hidden",
  },
  accentBar: {
    height: 3,
    marginHorizontal: -18,
    marginBottom: 16,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  headline: {
    fontSize: 15,
    fontFamily: font.semibold,
  },
  pillLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillLinkText: {
    fontSize: 12,
    fontFamily: font.semibold,
  },
  net: {
    fontSize: 38,
    fontFamily: font.bold,
    letterSpacing: -1.1,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  statBox: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  statHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  statTitle: {
    fontSize: 13,
    fontFamily: font.semibold,
    flex: 1,
  },
  statAmount: {
    fontSize: 18,
    fontFamily: font.bold,
    letterSpacing: -0.3,
  },
  settledRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  settledText: {
    fontSize: 14,
    fontFamily: font.semibold,
  },
  detailCard: {
    marginTop: 10,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  detailMid: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  detailName: {
    fontSize: 15,
    fontFamily: font.semibold,
  },
  detailSub: {
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 2,
  },
  detailAmt: {
    fontSize: 14,
    fontFamily: font.bold,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPh: {
    alignItems: "center",
    justifyContent: "center",
  },
});
