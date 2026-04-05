import React, { useRef, useCallback, useEffect } from "react";
import {
  Pressable,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Animated,
  Easing,
} from "react-native";
import { useTheme } from "../lib/theme-context";
import { colors, font, radii, shadow } from "../lib/theme";

let Haptics: any = null;
try {
  Haptics = require("expo-haptics");
} catch {}

const canHaptic = !!Haptics?.impactAsync;

// ─── Pressable with spring scale + haptic feedback (RN Animated — no Reanimated/Worklets) ───

interface SnapPressProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
  haptic?: "light" | "medium" | "heavy" | "none";
  scaleDown?: number;
}

export const SnapPress = React.memo(function SnapPress({
  onPress,
  style,
  children,
  disabled = false,
  haptic = "light",
  scaleDown = 0.97,
}: SnapPressProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: scaleDown,
      useNativeDriver: true,
      friction: 5,
      tension: 400,
    }).start();
  }, [scale, scaleDown]);

  const pressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 200,
    }).start();
  }, [scale]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    if (haptic !== "none" && canHaptic) {
      try {
        const style =
          haptic === "heavy"
            ? Haptics.ImpactFeedbackStyle.Heavy
            : haptic === "medium"
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light;
        Haptics.impactAsync(style).catch(() => {});
      } catch {}
    }
    onPress();
  }, [disabled, haptic, onPress]);

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View
        style={[
          style,
          { transform: [{ scale }], opacity: disabled ? 0.4 : 1 },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
});

// ─── Skeleton shimmer placeholder ───

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number | `${number}%`,
          height,
          borderRadius,
          backgroundColor: theme.skeletonBase ?? colors.border,
        },
        { opacity },
        style,
      ]}
    />
  );
}

// ─── Skeleton screens ───

export function SharedSkeletonScreen() {
  const { theme } = useTheme();
  return (
    <View style={[sk.container, { backgroundColor: theme.background }]}>
      <View style={sk.pad}>
        <View style={sk.headerRow}>
          <Skeleton width={100} height={28} borderRadius={8} />
          <Skeleton width={90} height={36} borderRadius={20} />
        </View>
        <View style={[sk.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <View style={sk.cardRow}>
            <Skeleton width={120} height={16} />
            <Skeleton width={80} height={28} borderRadius={6} />
          </View>
          <View style={[sk.cardRow, { marginTop: 16 }]}>
            <View>
              <Skeleton width={70} height={12} />
              <Skeleton width={60} height={18} borderRadius={4} style={{ marginTop: 4 }} />
            </View>
            <View>
              <Skeleton width={50} height={12} />
              <Skeleton width={60} height={18} borderRadius={4} style={{ marginTop: 4 }} />
            </View>
          </View>
        </View>
        <Skeleton width="100%" height={40} borderRadius={12} style={{ marginBottom: 16 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[sk.row, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Skeleton width={120 + i * 10} height={16} />
              <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
            </View>
            <Skeleton width={50} height={18} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function PersonSkeletonScreen() {
  const { theme } = useTheme();
  return (
    <View style={[sk.container, { backgroundColor: theme.background }]}>
      <View style={sk.pad}>
        <View style={[sk.headerRow, { marginBottom: 24 }]}>
          <Skeleton width={56} height={56} borderRadius={28} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Skeleton width={140} height={22} />
            <Skeleton width={100} height={16} style={{ marginTop: 6 }} />
          </View>
        </View>
        <View style={sk.actionRow}>
          <Skeleton width={100} height={40} borderRadius={12} />
          <Skeleton width={110} height={40} borderRadius={12} />
          <Skeleton width={90} height={40} borderRadius={12} />
        </View>
        <Skeleton width={100} height={14} style={{ marginBottom: 12 }} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={sk.txRow}>
            <View style={{ flex: 1 }}>
              <Skeleton width={130 + i * 15} height={16} />
              <Skeleton width={80} height={12} style={{ marginTop: 4 }} />
            </View>
            <Skeleton width={55} height={18} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function HomeSkeletonScreen() {
  const { theme } = useTheme();
  return (
    <View style={[sk.container, { backgroundColor: theme.background }]}>
      <View style={sk.pad}>
        <Skeleton width={200} height={40} borderRadius={8} style={{ marginBottom: 6 }} />
        <Skeleton width={260} height={14} borderRadius={6} style={{ marginBottom: 20 }} />

        {/* Balance hero skeleton */}
        <View style={[sk.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <View style={sk.cardRow}>
            <View>
              <Skeleton width={60} height={12} />
              <Skeleton width={80} height={24} borderRadius={4} style={{ marginTop: 4 }} />
            </View>
            <View>
              <Skeleton width={50} height={12} />
              <Skeleton width={70} height={24} borderRadius={4} style={{ marginTop: 4 }} />
            </View>
          </View>
        </View>

        {/* Bank strip skeleton */}
        <Skeleton width={100} height={12} borderRadius={4} style={{ marginBottom: 10 }} />
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} width={168} height={160} borderRadius={16} />
          ))}
        </View>

        {/* Friends & groups skeleton */}
        <Skeleton width={120} height={12} borderRadius={4} style={{ marginBottom: 10 }} />
        <View style={[{ backgroundColor: theme.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.borderLight, overflow: "hidden" }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }}>
              <Skeleton width={42} height={42} borderRadius={21} />
              <View style={{ flex: 1 }}>
                <Skeleton width={110 + i * 12} height={16} />
                <Skeleton width={70} height={12} style={{ marginTop: 6 }} />
              </View>
              <Skeleton width={50} height={18} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 20 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 18, marginBottom: 16, ...shadow.md },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, padding: 14, borderRadius: radii.lg, marginBottom: 6, ...shadow.sm },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  txRow: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.surface, borderRadius: radii.md, marginBottom: 6, ...shadow.sm },
});

// ─── Haptic helpers ───

const safeHaptic = (fn: () => Promise<void>) => {
  if (!canHaptic) return;
  try {
    fn().catch(() => {});
  } catch {}
};

export const haptic = {
  light: () => safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  selection: () => safeHaptic(() => Haptics.selectionAsync()),
};
