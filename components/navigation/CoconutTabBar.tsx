/**
 * Bottom tabs: five equal tabs (Home, Bank, Shared, Activity, Account).
 * Active tab has a black indicator line that slides smoothly between tabs.
 */
import { Animated, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { StackActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, fontSize } from "../../lib/theme";
import { useEffect, useRef } from "react";
import { useTheme } from "../../lib/theme-context";
import { sfx } from "../../lib/sounds";
import { useHasUnseenActivity, markActivitySeen } from "../../hooks/useGroups";

const TAB_COUNT = 5;
const INDICATOR_WIDTH = 24;
const H_PAD = 8;

const TAB_INDEX: Record<string, number> = {
  index: 0,
  bank: 1,
  shared: 2,
  activity: 3,
  settings: 4,
};

export function CoconutTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 22 : 10);
  const current = state.routes[state.index]?.name;
  const hiddenRoutes = new Set(["add-expense", "receipt", "pay", "tap-to-pay-education"]);

  const activeIdx = TAB_INDEX[current ?? ""] ?? 0;
  const indicatorAnim = useRef(new Animated.Value(activeIdx)).current;

  useEffect(() => {
    Animated.spring(indicatorAnim, {
      toValue: activeIdx,
      useNativeDriver: true,
      friction: 20,
      tension: 300,
    }).start();
  }, [activeIdx, indicatorAnim]);

  const tabWidth = (screenWidth - H_PAD * 2) / TAB_COUNT;
  const translateX = indicatorAnim.interpolate({
    inputRange: [0, TAB_COUNT - 1],
    outputRange: [
      H_PAD + (tabWidth - INDICATOR_WIDTH) / 2,
      H_PAD + (TAB_COUNT - 1) * tabWidth + (tabWidth - INDICATOR_WIDTH) / 2,
    ],
  });

  const goIndex = () => { sfx.tabTap(); navigation.navigate("index" as never); };
  const goBank = () => { sfx.tabTap(); navigation.navigate("bank" as never); };
  const goActivity = () => { sfx.tabTap(); navigation.navigate("activity" as never); };
  const goFriends = () => {
    sfx.tabTap();
    const route = state.routes.find((r) => r.name === "shared");
    const nested = route?.state;
    const isDeep = nested?.key && (nested.index ?? 0) > 0;

    if (current === "shared") {
      if (isDeep) {
        navigation.dispatch({ ...StackActions.popToTop(), target: nested!.key });
      }
    } else {
      navigation.navigate("shared" as never);
      if (isDeep) {
        queueMicrotask(() => {
          navigation.dispatch({ ...StackActions.popToTop(), target: nested!.key });
        });
      }
    }
  };
  const goAccount = () => { sfx.tabTap(); navigation.navigate("settings" as never); };

  const homeActive = current === "index";
  const bankActive = current === "bank";
  const friendsActive = current === "shared";
  const activityActive = current === "activity";
  const accountActive = current === "settings";
  const activeColor = theme.text;
  const inactiveColor = theme.textTertiary;
  const hasUnseen = useHasUnseenActivity();

  useEffect(() => {
    if (activityActive) markActivitySeen();
  }, [activityActive]);

  if (current && hiddenRoutes.has(current)) return null;

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad, backgroundColor: theme.surface }]}>
      <Animated.View
        style={[styles.indicator, { backgroundColor: activeColor, transform: [{ translateX }] }]}
      />

      <View style={styles.row}>
        <Pressable onPress={goIndex} style={styles.side} accessibilityRole="button" accessibilityState={{ selected: homeActive }} accessibilityLabel="Home">
          <Ionicons name={homeActive ? "home" : "home-outline"} size={22} color={homeActive ? activeColor : inactiveColor} />
          <Text style={[styles.label, { color: homeActive ? activeColor : inactiveColor }]}>Home</Text>
        </Pressable>

        <Pressable onPress={goBank} style={styles.side} accessibilityRole="button" accessibilityState={{ selected: bankActive }} accessibilityLabel="Bank">
          <Ionicons name={bankActive ? "wallet" : "wallet-outline"} size={22} color={bankActive ? activeColor : inactiveColor} />
          <Text style={[styles.label, { color: bankActive ? activeColor : inactiveColor }]}>Bank</Text>
        </Pressable>

        <Pressable onPress={goFriends} style={styles.side} accessibilityRole="button" accessibilityState={{ selected: friendsActive }} accessibilityLabel="Shared">
          <Ionicons name={friendsActive ? "people" : "people-outline"} size={22} color={friendsActive ? activeColor : inactiveColor} />
          <Text style={[styles.label, { color: friendsActive ? activeColor : inactiveColor }]}>Shared</Text>
        </Pressable>

        <Pressable onPress={goActivity} style={styles.side} accessibilityRole="button" accessibilityState={{ selected: activityActive }} accessibilityLabel="Activity">
          <View>
            <Ionicons name={activityActive ? "time" : "time-outline"} size={22} color={activityActive ? activeColor : inactiveColor} />
            {hasUnseen && !activityActive ? <View style={styles.badgeDot} /> : null}
          </View>
          <Text style={[styles.label, { color: activityActive ? activeColor : inactiveColor }]}>Activity</Text>
        </Pressable>

        <Pressable onPress={goAccount} style={styles.side} accessibilityRole="button" accessibilityState={{ selected: accountActive }} accessibilityLabel="Account">
          <Ionicons name={accountActive ? "person" : "person-outline"} size={22} color={accountActive ? activeColor : inactiveColor} />
          <Text style={[styles.label, { color: accountActive ? activeColor : inactiveColor }]}>Account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 0,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 4,
  },
  indicator: {
    position: "absolute",
    top: 0,
    left: 0,
    width: INDICATOR_WIDTH,
    height: 2.5,
    borderRadius: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    minHeight: 48,
    paddingHorizontal: H_PAD,
    paddingTop: 8,
  },
  side: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontFamily: font.medium,
    fontSize: fontSize["2xs"],
    letterSpacing: 0.1,
  },
  badgeDot: {
    position: "absolute",
    top: -1,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
