import React, { useRef, useCallback, useEffect } from "react";
import {
  Pressable,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors, font, radii, shadow } from "../lib/theme";

let Haptics: any = null;
try {
  Haptics = require("expo-haptics");
} catch {}

const canHaptic = !!Haptics?.impactAsync;

// ─── Pressable with spring scale + haptic feedback ───

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
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: disabled ? 0.4 : 1,
  }));

  const pressIn = useCallback(() => {
    scale.value = withSpring(scaleDown, {
      damping: 15,
      stiffness: 400,
    });
  }, [scaleDown]);

  const pressOut = useCallback(() => {
    scale.value = withSpring(1, {
      damping: 12,
      stiffness: 200,
      mass: 0.8,
    });
  }, []);

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
      <Animated.View style={[style, animatedStyle]}>
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
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.border,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

// ─── Skeleton screens ───

export function SharedSkeletonScreen() {
  return (
    <View style={sk.container}>
      <View style={sk.pad}>
        <View style={sk.headerRow}>
          <Skeleton width={100} height={28} borderRadius={8} />
          <Skeleton width={90} height={36} borderRadius={20} />
        </View>
        <View style={sk.card}>
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
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={sk.row}>
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
  return (
    <View style={sk.container}>
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
        {[0, 1, 2, 3].map(i => (
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

const noop = () => {};
const safeHaptic = (fn: () => Promise<void>) => {
  if (!canHaptic) return;
  try { fn().catch(() => {}); } catch {}
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
