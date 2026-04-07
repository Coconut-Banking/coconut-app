import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, fontSize, radii } from "../lib/theme";
import { useTheme } from "../lib/theme-context";
import { getExpensePrefillTarget } from "../lib/add-expense-prefill";
import { sfx } from "../lib/sounds";

const FAB_SIZE = 52;
const FAB_RADIUS = 26;
const ACTION_GAP = 10;
const BOTTOM_OFFSET = 90;
const RIGHT_OFFSET = 20;

const fabShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.18,
  shadowRadius: 8,
  elevation: Platform.OS === "android" ? 8 : undefined,
} as const;

type Props = {
  visible?: boolean;
};

const HIDDEN_ROUTES = new Set(["/add-expense", "/receipt", "/pay", "/tap-to-pay-education"]);

export function FloatingActionButtons({ visible = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  const bottom = insets.bottom + BOTTOM_OFFSET;
  const right = Math.max(insets.right, RIGHT_OFFSET);

  const hideOnRoute = HIDDEN_ROUTES.has(pathname);

  const openMenu = useCallback(() => {
    void sfx.fabPress();
    closingRef.current = false;
    setMenuOpen(true);
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 65,
    }).start();
  }, [progress]);

  const closeMenu = useCallback(
    (afterClose?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        closingRef.current = false;
        if (finished) {
          setMenuOpen(false);
          afterClose?.();
        }
      });
    },
    [progress],
  );

  const onFabPress = useCallback(() => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    openMenu();
  }, [menuOpen, openMenu, closeMenu]);

  const goAddExpense = useCallback(() => {
    void sfx.pop();
    const prefill = getExpensePrefillTarget();
    closeMenu(() => {
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
    });
  }, [closeMenu, router]);

  const goScanReceipt = useCallback(() => {
    void sfx.pop();
    closeMenu(() => {
      router.push("/(tabs)/receipt");
    });
  }, [closeMenu, router]);

  const overlayOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const addExpenseTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });
  const addExpenseFade = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.85, 1],
  });

  const scanTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const scanFade = progress.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, 0.9, 1],
  });

  if (!visible || hideOnRoute) {
    return null;
  }

  return (
    <View style={styles.root} pointerEvents="box-none">
      {menuOpen ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
          pointerEvents={menuOpen ? "auto" : "none"}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
            onPress={() => closeMenu()}
            accessibilityLabel="Dismiss add menu"
          />
        </Animated.View>
      ) : null}

      <View
        style={[styles.cluster, { bottom, right }]}
        pointerEvents="box-none"
      >
        {menuOpen ? (
          <>
            <Animated.View
              style={{
                opacity: addExpenseFade,
                transform: [{ translateY: addExpenseTranslate }],
                marginBottom: ACTION_GAP,
              }}
            >
              <Pressable
                onPress={goAddExpense}
                style={({ pressed }) => [
                  styles.actionPill,
                  pressed && styles.actionPillPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add expense"
              >
                <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionLabel}>Add expense</Text>
              </Pressable>
            </Animated.View>

            <Animated.View
              style={{
                opacity: scanFade,
                transform: [{ translateY: scanTranslate }],
                marginBottom: ACTION_GAP,
              }}
            >
              <Pressable
                onPress={goScanReceipt}
                style={({ pressed }) => [
                  styles.actionPill,
                  pressed && styles.actionPillPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Scan receipt"
              >
                <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionLabel}>Scan receipt</Text>
              </Pressable>
            </Animated.View>
          </>
        ) : null}

        <Pressable
          onPress={onFabPress}
          style={({ pressed }) => [
            styles.fab,
            fabShadow,
            pressed && styles.fabPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={menuOpen ? "Close add menu" : "Open add menu"}
          accessibilityState={{ expanded: menuOpen }}
        >
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  cluster: {
    position: "absolute",
    alignItems: "flex-end",
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
    backgroundColor: "#1F2328",
    alignItems: "center",
    justifyContent: "center",
  },
  fabPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.96 }],
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: radii.xl,
    backgroundColor: "#1F2328",
    ...fabShadow,
  },
  actionPillPressed: {
    opacity: 0.9,
  },
  actionLabel: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
    color: "#FFFFFF",
  },
});
