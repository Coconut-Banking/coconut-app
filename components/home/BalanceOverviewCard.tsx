import React, { useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { GroupsSummary } from "../../hooks/useGroups";
import { MemberAvatar } from "../MemberAvatar";
import { font } from "../../lib/theme";
import { useTheme } from "../../lib/theme-context";
import { useHomePalette } from "../../lib/home-theme";
import { friendBalanceLines, groupBalanceLines } from "../../lib/format-split-money";
import { formatHomeMoney } from "../../lib/home-format";
import { homeMoneyType } from "../../lib/home-money-type";
import { Image as ExpoImage } from "expo-image";

const EXPAND_TRANSITION = LinearTransition.duration(220);
const BAND_HEIGHT = 40;
const BAND_RADIUS = 8;

type OweRow = {
  key: string;
  title: string;
  subtitle: string;
  lines: { currency: string; amount: number }[];
  imageUrl?: string | null;
  isGroup?: boolean;
  onPress: () => void;
};

function partitionSummary(summary: GroupsSummary | null, defaultCurrency: string) {
  const owedToYou: OweRow[] = [];
  const youOwe: OweRow[] = [];

  for (const f of summary?.friends ?? []) {
    const lines = friendBalanceLines(f, defaultCurrency).filter((l) => Math.abs(l.amount) >= 0.005);
    if (lines.length === 0) continue;
    const net = lines.reduce((s, l) => s + l.amount, 0);
    const row: OweRow = {
      key: `f-${f.key}`,
      title: f.displayName,
      subtitle: net > 0 ? "owes you" : "you owe",
      lines: lines.map((l) => ({ currency: l.currency, amount: Math.abs(l.amount) })),
      imageUrl: f.image_url,
      onPress: () =>
        router.navigate({ pathname: "/(tabs)/shared/person", params: { key: f.key, source: "home" } }),
    };
    if (net > 0.005) owedToYou.push(row);
    else if (net < -0.005) youOwe.push(row);
  }

  for (const g of summary?.groups ?? []) {
    const lines = groupBalanceLines(g, defaultCurrency).filter((l) => Math.abs(l.amount) >= 0.005);
    if (lines.length === 0) continue;
    const net = lines.reduce((s, l) => s + l.amount, 0);
    const row: OweRow = {
      key: `g-${g.id}`,
      title: g.name,
      subtitle: `${g.memberCount} members`,
      lines: lines.map((l) => ({ currency: l.currency, amount: Math.abs(l.amount) })),
      imageUrl: g.imageUrl,
      isGroup: true,
      onPress: () =>
        router.navigate({ pathname: "/(tabs)/shared/group", params: { id: g.id, source: "home" } }),
    };
    if (net > 0.005) owedToYou.push(row);
    else if (net < -0.005) youOwe.push(row);
  }

  return { owedToYou, youOwe };
}

type CurrencyTotals = { currency: string; owedToMe: number; iOwe: number; net: number };

function pickPrimaryRow(rows: CurrencyTotals[], defaultCurrency: string) {
  if (rows.length === 0) return null;
  return rows.find((r) => r.currency === defaultCurrency) ?? rows[0];
}

function headlineAmount(
  row: CurrencyTotals | null,
  field: "owedToMe" | "iOwe",
  fallback: number | null,
) {
  if (row) return row[field];
  if (fallback != null) return fallback;
  return 0;
}

function FigmaOweBand({
  tone,
  collapsedLabel,
  amount,
  currency,
  expanded,
  onToggle,
  rows,
}: {
  tone: "in" | "out";
  collapsedLabel: string;
  amount: number;
  currency: string;
  expanded: boolean;
  onToggle: () => void;
  rows: OweRow[];
}) {
  const { theme } = useTheme();
  const home = useHomePalette();
  const isIn = tone === "in";
  const hidden = amount < 0.005 && rows.length === 0;
  if (hidden) return null;

  const faceBg = isIn ? home.moneyInSoft : home.moneyOutSoft;
  const shadowBg = isIn ? home.moneyInShadow : home.moneyOutShadow;
  const textColor = isIn ? home.moneyInText : home.moneyOutText;

  return (
    <View style={styles.bandWrap}>
      <View style={styles.bandStack}>
        <View style={[styles.bandShadow, { backgroundColor: shadowBg }]} />
        <TouchableOpacity
          style={[styles.bandFace, { backgroundColor: faceBg }]}
          onPress={onToggle}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${collapsedLabel}, ${formatHomeMoney(amount, currency)}`}
        >
          <Text style={[styles.bandAmount, homeMoneyType, { color: textColor }]}>
            {formatHomeMoney(amount, currency)}
          </Text>
          <Text style={[styles.bandLabel, { color: textColor }]} numberOfLines={1}>
            {collapsedLabel}
          </Text>
          <Ionicons name="chevron-forward" size={22} color={textColor} />
        </TouchableOpacity>
      </View>

      {expanded && rows.length > 0 ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(160)}
          layout={EXPAND_TRANSITION}
          style={[styles.expandedList, { borderColor: theme.borderLight, backgroundColor: home.boxFill }]}
        >
          {rows.map((r, i) => (
            <TouchableOpacity
              key={r.key}
              style={[
                styles.oweRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight },
              ]}
              onPress={r.onPress}
              activeOpacity={0.75}
            >
              {r.isGroup ? (
                r.imageUrl ? (
                  <ExpoImage source={{ uri: r.imageUrl }} style={styles.groupIcon} cachePolicy="disk" />
                ) : (
                  <View style={[styles.groupIcon, styles.groupIconPh]}>
                    <Ionicons name="people" size={16} color={theme.textSecondary} />
                  </View>
                )
              ) : (
                <MemberAvatar name={r.title} size={40} imageUrl={r.imageUrl ?? null} variant="soft" />
              )}
              <View style={styles.oweBody}>
                <Text style={[styles.oweName, { color: theme.text }]} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[styles.oweSub, { color: theme.textTertiary }]} numberOfLines={1}>
                  {r.subtitle}
                </Text>
              </View>
              <View style={styles.oweAmts}>
                {r.lines.map((l) => (
                  <Text
                    key={l.currency}
                    style={[styles.oweAmt, { color: isIn ? home.moneyInText : home.moneyOutText }]}
                  >
                    {formatHomeMoney(l.amount, l.currency)}
                  </Text>
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

export const BalanceOverviewCard = React.memo(function BalanceOverviewCard({
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

  const rows = summary?.totalsByCurrency ?? [];
  const primary = pickPrimaryRow(rows, defaultCurrency);
  const { owedToYou, youOwe } = useMemo(
    () => partitionSummary(summary, defaultCurrency),
    [summary, defaultCurrency],
  );

  const currency = primary?.currency ?? defaultCurrency;
  const owedTotal = headlineAmount(primary, "owedToMe", summary?.totalOwedToMe ?? null);
  const oweTotal = headlineAmount(primary, "iOwe", summary?.totalIOwe ?? null);

  const net = useMemo(() => {
    if (primary) return primary.net;
    if (summary?.netBalance != null) return summary.netBalance;
    return owedTotal - oweTotal;
  }, [primary, summary?.netBalance, owedTotal, oweTotal]);

  const netPositive = net >= 0;
  const settled = Math.abs(net) < 0.005 && owedToYou.length === 0 && youOwe.length === 0;

  const toggleOwed = useCallback(() => {
    setOwedOpen((v) => !v);
    if (!owedOpen) setOweOpen(false);
  }, [owedOpen]);

  const toggleOwe = useCallback(() => {
    setOweOpen((v) => !v);
    if (!oweOpen) setOwedOpen(false);
  }, [oweOpen]);

  return (
    <View style={styles.card}>
      <Text style={[styles.cardLabel, { color: home.balanceLabel }]}>BALANCE OVERVIEW</Text>

      {settled ? (
        <Text style={[styles.netAmount, homeMoneyType, { color: home.inkMuted }]}>
          {formatHomeMoney(0, currency)}
        </Text>
      ) : (
        <Text style={[styles.netAmount, homeMoneyType, { color: home.ink }]}>
          {`${netPositive ? "+" : "-"}${formatHomeMoney(Math.abs(net), currency)}`}
        </Text>
      )}

      {settled ? (
        <Text style={[styles.netCaption, { color: theme.textTertiary }]}>All settled up</Text>
      ) : null}

      <View style={styles.bands}>
        <FigmaOweBand
          tone="in"
          collapsedLabel="owed to you"
          amount={owedTotal}
          currency={currency}
          expanded={owedOpen}
          onToggle={toggleOwed}
          rows={owedToYou}
        />
        <FigmaOweBand
          tone="out"
          collapsedLabel="owed"
          amount={oweTotal}
          currency={currency}
          expanded={oweOpen}
          onToggle={toggleOwe}
          rows={youOwe}
        />
      </View>

    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    marginBottom: 8,
    maxWidth: 322,
    alignSelf: "center",
    width: "100%",
  },
  cardLabel: {
    fontSize: 16,
    fontFamily: font.bold,
    textTransform: "uppercase",
    letterSpacing: 0.48,
    textAlign: "center",
    marginBottom: 2,
  },
  netAmount: {
    fontSize: 32,
    textAlign: "center",
    letterSpacing: 0.96,
    lineHeight: 45,
    marginBottom: 12,
  },
  netCaption: {
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: "center",
    marginTop: -6,
    marginBottom: 12,
  },
  bands: {
    gap: 8,
    width: "100%",
  },
  bandWrap: {
    gap: 4,
  },
  bandStack: {
    height: BAND_HEIGHT + 4,
    position: "relative",
  },
  bandShadow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 4,
    height: BAND_HEIGHT,
    borderRadius: BAND_RADIUS,
  },
  bandFace: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: BAND_HEIGHT,
    borderRadius: BAND_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  bandAmount: {
    fontSize: 16,
    letterSpacing: 0.48,
    minWidth: 72,
  },
  bandLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: font.regular,
    letterSpacing: 0.32,
    textAlign: "center",
    textTransform: "lowercase",
  },
  expandedList: {
    marginTop: 2,
    borderRadius: BAND_RADIUS,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  oweRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  oweBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  oweName: {
    fontSize: 16,
    fontFamily: font.semibold,
  },
  oweSub: {
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 2,
  },
  oweAmts: {
    alignItems: "flex-end",
  },
  oweAmt: {
    fontSize: 15,
    fontFamily: font.bold,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  groupIconPh: {
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
});
