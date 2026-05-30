import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getExpensePrefillTarget } from "../lib/add-expense-prefill";
import { sfx } from "../lib/sounds";
import { useHomePalette } from "../lib/home-theme";
import { useFabScroll } from "../lib/fab-scroll-context";
import { font } from "../lib/theme";
import { FabGlassSurface } from "./FabGlassSurface";

const FAB_SIZE = 50;
const FAB_RADIUS = 25;
const STACK_GAP = 12;
const BOTTOM_OFFSET = 88;
const RIGHT_OFFSET = 14;
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const fabShadow = Platform.select({
  ios: {
    shadowColor: "#493D32",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  android: { elevation: 8 },
  default: {},
}) as object;

type Props = {
  visible?: boolean;
};

const HIDDEN_ROUTES = new Set([
  "/add-expense",
  "/receipt",
  "/(tabs)/receipt",
  "/pay",
  "/(tabs)/pay",
  "/tap-to-pay-education",
  "/(tabs)/tap-to-pay-education",
  "/scan-receipt",
]);

function StackedFab({
  icon,
  label,
  onPress,
  testID,
  inkColor,
  collapsed,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  inkColor: string;
  collapsed: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      friction: 6,
      tension: 200,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 200,
    }).start();
  };

  const shapeStyle = collapsed ? styles.fabCollapsed : styles.fabExpanded;

  return (
    <Animated.View style={[fabShadow, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [pressed && styles.fabPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
      >
        <FabGlassSurface style={shapeStyle}>
          <Ionicons name={icon} size={collapsed ? 24 : 20} color={inkColor} />
          {!collapsed ? (
            <Text style={[styles.fabLabel, { color: inkColor }]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </FabGlassSurface>
      </Pressable>
    </Animated.View>
  );
}

/** Stacked FABs — liquid glass, labels by default; icon-only when the active list scrolls. */
export function FloatingActionButtons({ visible = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const home = useHomePalette();
  const { collapsed: scrollCollapsed, setCollapsed } = useFabScroll();

  const bottom = insets.bottom + BOTTOM_OFFSET;
  const right = Math.max(insets.right, RIGHT_OFFSET);
  const hideOnRoute = HIDDEN_ROUTES.has(pathname);
  const collapsed = scrollCollapsed;

  useEffect(() => {
    setCollapsed(false);
  }, [pathname, setCollapsed]);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [collapsed]);

  const goAddExpense = useCallback(() => {
    void sfx.pop();
    const prefill = getExpensePrefillTarget();
    router.push({
      pathname: "/(tabs)/add-expense",
      params: {
        prefillNonce: String(Date.now()),
        prefillDesc: "",
        prefillAmount: "",
        prefillPersonKey: prefill?.key ?? "",
        prefillPersonName: prefill?.name ?? "",
        prefillPersonType: prefill?.type ?? "",
      },
    });
  }, [router]);

  const goTakePicture = useCallback(() => {
    void sfx.pop();
    router.push("/scan-receipt" as Href);
  }, [router]);

  if (!visible || hideOnRoute) {
    return null;
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={[styles.stack, { bottom, right }]} pointerEvents="box-none">
        <StackedFab
          icon="camera-outline"
          label="Scan receipt"
          onPress={goTakePicture}
          testID="fab-camera"
          inkColor={home.ink}
          collapsed={collapsed}
        />
        <View style={{ height: STACK_GAP }} />
        <StackedFab
          icon="document-text-outline"
          label="Log expense"
          onPress={goAddExpense}
          testID="fab-add-expense"
          inkColor={home.ink}
          collapsed={collapsed}
        />
      </View>
    </View>
  );
}

export { SCROLL_COLLAPSE_THRESHOLD } from "../lib/fab-scroll-context";

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  stack: {
    position: "absolute",
    alignItems: "flex-end",
  },
  fabExpanded: {
    flexDirection: "row",
    height: FAB_SIZE,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: FAB_RADIUS,
    gap: 8,
    minWidth: FAB_SIZE,
  },
  fabCollapsed: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
  },
  fabLabel: {
    fontSize: 11,
    fontFamily: font.semibold,
    letterSpacing: 0.66,
    textTransform: "uppercase",
  },
  fabPressed: {
    opacity: 0.88,
  },
});
