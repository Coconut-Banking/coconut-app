import React, { useCallback, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getExpensePrefillTarget } from "../lib/add-expense-prefill";
import { sfx } from "../lib/sounds";
import { useHomePalette } from "../lib/home-theme";

const FAB_SIZE = 50;
const FAB_RADIUS = 25;
const STACK_GAP = 12;
const BOTTOM_OFFSET = 88;
const RIGHT_OFFSET = 14;

const fabShadow = Platform.select({
  ios: {
    shadowColor: "#493D32",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
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
  shellColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  shellColor: string;
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

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.fab,
          fabShadow,
          { backgroundColor: shellColor },
          pressed && styles.fabPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
      >
        <Ionicons name={icon} size={26} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
}

/** Figma stacked FABs — camera (scan) top, receipt/add below. */
export function FloatingActionButtons({ visible = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const home = useHomePalette();

  const bottom = insets.bottom + BOTTOM_OFFSET;
  const right = Math.max(insets.right, RIGHT_OFFSET);
  const hideOnRoute = HIDDEN_ROUTES.has(pathname);

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
          label="Take a picture"
          onPress={goTakePicture}
          testID="fab-camera"
          shellColor={home.coconutShell}
        />
        <View style={{ height: STACK_GAP }} />
        <StackedFab
          icon="document-text-outline"
          label="Add expense"
          onPress={goAddExpense}
          testID="fab-add-expense"
          shellColor={home.coconutShell}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  stack: {
    position: "absolute",
    alignItems: "center",
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  fabPressed: {
    opacity: 0.94,
  },
});
