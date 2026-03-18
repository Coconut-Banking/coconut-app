import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  PanResponder,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Insight } from "../hooks/useInsights";
import { haptic } from "./ui";
import { colors, font, fontSize, shadow, radii } from "../lib/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = 320;
const SWIPE_THRESHOLD = 60;

function insightIcon(type: Insight["type"]) {
  switch (type) {
    case "duplicate":
      return { name: "copy-outline" as const, color: colors.amber, bg: colors.amberBg };
    case "anomaly":
      return { name: "alert-circle-outline" as const, color: colors.red, bg: colors.redBg };
    case "price_change":
      return { name: "trending-up" as const, color: colors.purple, bg: colors.purpleBg };
    case "refund":
      return { name: "arrow-down-circle" as const, color: colors.green, bg: colors.greenBg };
    case "new_subscription":
      return { name: "add-circle-outline" as const, color: colors.primary, bg: colors.primaryLight };
    case "trend_up":
      return { name: "trending-up" as const, color: colors.amber, bg: colors.amberBg };
    case "trend_down":
      return { name: "trending-down" as const, color: colors.green, bg: colors.greenBg };
    default:
      return { name: "bulb-outline" as const, color: colors.textTertiary, bg: colors.borderLight };
  }
}

interface InsightsSwipeModalProps {
  visible: boolean;
  insights: Insight[];
  onClose: () => void;
  onSwipeRight?: (insight: Insight) => void;
  onSwipeLeft?: (insight: Insight) => void;
}

export function InsightsSwipeModal({
  visible,
  insights,
  onClose,
  onSwipeRight,
  onSwipeLeft,
}: InsightsSwipeModalProps) {
  const [stack, setStack] = React.useState<Insight[]>([]);
  const stackRef = useRef<Insight[]>([]);
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, SCREEN_WIDTH / 2],
    outputRange: ["-8deg", "8deg"],
    extrapolate: "clamp",
  });

  useEffect(() => {
    stackRef.current = stack;
  }, [stack]);

  useEffect(() => {
    if (visible) {
      const next = [...insights];
      setStack(next);
      stackRef.current = next;
      position.setValue({ x: 0, y: 0 });
    }
  }, [visible, insights, position]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => stackRef.current.length > 0,
      onMoveShouldSetPanResponder: () => stackRef.current.length > 0,
      onPanResponderMove: (_, gestureState) => {
        position.setValue({ x: gestureState.dx, y: gestureState.dy * 0.2 });
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;
        const current = stackRef.current[0];
        if (!current) return;

        const shouldSwipeRight = dx > SWIPE_THRESHOLD || (dx > 0 && vx > 0.5);
        const shouldSwipeLeft = dx < -SWIPE_THRESHOLD || (dx < 0 && vx < -0.5);

        if (shouldSwipeRight) {
          haptic.light();
          onSwipeRight?.(current);
          Animated.timing(position, {
            toValue: { x: SCREEN_WIDTH + 80, y: 0 },
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setStack((s) => s.slice(1));
            position.setValue({ x: 0, y: 0 });
          });
        } else if (shouldSwipeLeft) {
          haptic.light();
          onSwipeLeft?.(current);
          Animated.timing(position, {
            toValue: { x: -SCREEN_WIDTH - 80, y: 0 },
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setStack((s) => s.slice(1));
            position.setValue({ x: 0, y: 0 });
          });
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            friction: 6,
            tension: 100,
          }).start();
        }
      },
    })
  ).current;

  const topCard = stack[0];
  const isFirstCard = stack.length === insights.length && insights.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Review insights</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {stack.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptySub}>
              You've reviewed all your insights.
            </Text>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : topCard ? (
          <>
            {isFirstCard && (
              <View style={styles.hints}>
                <View style={styles.hintPill}>
                  <Ionicons name="arrow-back" size={12} color={colors.textMuted} />
                  <Text style={styles.hintText}>Dismiss</Text>
                </View>
                <View style={styles.hintPill}>
                  <Text style={styles.hintText}>Action</Text>
                  <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                </View>
              </View>
            )}

            <View style={styles.cardWrapper} {...panResponder.panHandlers}>
              <Animated.View
                style={[
                  styles.card,
                  {
                    transform: [
                      { translateX: position.x },
                      { translateY: position.y },
                      { rotate },
                    ],
                  },
                ]}
              >
                {(() => {
                  const icon = insightIcon(topCard.type);
                  return (
                    <>
                      <View style={[styles.cardIconBg, { backgroundColor: icon.bg }]}>
                        <Ionicons name={icon.name} size={28} color={icon.color} />
                      </View>
                      <Text style={styles.cardTitle}>{topCard.title}</Text>
                      <Text style={styles.cardDesc}>{topCard.description}</Text>
                      {topCard.transactions && topCard.transactions.length > 0 && (
                        <View style={styles.txList}>
                          {topCard.transactions.slice(0, 3).map((t) => (
                            <View key={t.id} style={styles.txRow}>
                              <Text style={styles.txMerchant} numberOfLines={1}>
                                {t.merchant}
                              </Text>
                              <Text style={styles.txAmount}>
                                {t.amount < 0 ? "-" : "+"}${Math.abs(t.amount).toFixed(2)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  );
                })()}
              </Animated.View>
            </View>

            <View style={styles.progress}>
              <View style={styles.progressDots}>
                {insights.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i < insights.length - stack.length && styles.dotFilled,
                      i === insights.length - stack.length && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.progressText}>
                {insights.length - stack.length + 1} / {insights.length}
              </Text>
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 17,
    color: colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  hints: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    marginTop: 12,
    marginBottom: 8,
  },
  hintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
    backgroundColor: colors.borderLight,
  },
  hintText: {
    fontFamily: font.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
  cardWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: CARD_WIDTH,
    minHeight: CARD_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: radii["2xl"],
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    ...shadow.lg,
  },
  cardIconBg: {
    width: 56,
    height: 56,
    borderRadius: radii.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: font.semibold,
    fontSize: 17,
    color: colors.text,
    textAlign: "center",
    marginBottom: 6,
  },
  cardDesc: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    color: colors.textTertiary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 14,
  },
  txList: {
    width: "100%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: 12,
  },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  txMerchant: {
    fontFamily: font.regular,
    fontSize: fontSize.base,
    color: colors.textSecondary,
    flex: 1,
  },
  txAmount: {
    fontFamily: font.semibold,
    fontSize: fontSize.base,
    color: colors.text,
  },
  progress: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  progressDots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotFilled: {
    backgroundColor: colors.primary,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressText: {
    fontFamily: font.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: font.semibold,
    fontSize: fontSize["2xl"],
    color: colors.text,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    color: colors.textTertiary,
    textAlign: "center",
    marginBottom: 24,
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  doneBtnText: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    color: colors.surface,
  },
});
