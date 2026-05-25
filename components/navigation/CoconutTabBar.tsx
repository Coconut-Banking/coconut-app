/**
 * Bottom tabs — Figma nav (FINAL HOME TENTATIVE) + Bank as 5th tab.
 */
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions, StackActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect } from "react";
import { font } from "../../lib/theme";
import { useHomePalette } from "../../lib/home-theme";
import { sfx } from "../../lib/sounds";
import { useHasUnseenActivity, markActivitySeen } from "../../hooks/useGroups";

const H_PAD = 8;
const ICON_SIZE = 24;

function tabLabelColor(active: boolean, isHome: boolean, home: ReturnType<typeof useHomePalette>) {
  if (!active) return home.navInactive;
  return isHome ? home.navActiveLabel : home.ink;
}

export function CoconutTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const home = useHomePalette();
  const { width: screenWidth } = useWindowDimensions();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 10 : 8) + 10;
  const current = state.routes[state.index]?.name;
  const hiddenRoutes = new Set(["add-expense", "receipt", "pay", "tap-to-pay-education"]);

  const homeActive = current === "index";
  const bankActive = current === "bank";
  const friendsActive = current === "shared";
  const activityActive = current === "activity";
  const accountActive = current === "settings";
  const iconActive = home.ink;
  const iconInactive = home.navIconInactive;
  const hasUnseen = useHasUnseenActivity();

  useEffect(() => {
    if (activityActive) markActivitySeen();
  }, [activityActive]);

  const goIndex = () => {
    void sfx.tabTap();
    navigation.navigate("index" as never);
  };
  const goBank = () => {
    void sfx.tabTap();
    navigation.navigate("bank" as never);
  };
  const goActivity = () => {
    void sfx.tabTap();
    navigation.navigate("activity" as never);
  };
  const goFriends = () => {
    void sfx.tabTap();
    if (current === "shared") {
      const route = state.routes.find((r) => r.name === "shared");
      if (route?.state && route.state.index !== undefined && route.state.index > 0) {
        navigation.dispatch({ ...StackActions.popToTop(), target: route.state.key });
      }
    } else {
      navigation.dispatch(CommonActions.navigate({ name: "shared", params: {} }));
    }
  };
  const goAccount = () => {
    void sfx.tabTap();
    navigation.navigate("settings" as never);
  };

  if (current && hiddenRoutes.has(current)) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: bottomPad,
          backgroundColor: "#FFFCF6",
          borderTopColor: home.navLine,
        },
      ]}
    >
      <View style={[styles.row, { width: screenWidth - H_PAD * 2 }]}>
        <Pressable
          onPress={goIndex}
          style={styles.side}
          accessibilityRole="button"
          accessibilityState={{ selected: homeActive }}
          accessibilityLabel="Home"
        >
          <Ionicons
            name={homeActive ? "home" : "home-outline"}
            size={ICON_SIZE}
            color={homeActive ? iconActive : iconInactive}
          />
          <Text style={[styles.label, { color: tabLabelColor(homeActive, true, home) }]}>Home</Text>
        </Pressable>

        <Pressable
          onPress={goBank}
          style={styles.side}
          accessibilityRole="button"
          accessibilityState={{ selected: bankActive }}
          accessibilityLabel="Bank"
        >
          <Ionicons
            name={bankActive ? "card" : "card-outline"}
            size={ICON_SIZE}
            color={bankActive ? iconActive : iconInactive}
          />
          <Text style={[styles.label, { color: tabLabelColor(bankActive, false, home) }]}>Bank</Text>
        </Pressable>

        <Pressable
          onPress={goFriends}
          style={styles.side}
          accessibilityRole="button"
          accessibilityState={{ selected: friendsActive }}
          accessibilityLabel="Splits"
        >
          <Ionicons
            name={friendsActive ? "people" : "people-outline"}
            size={ICON_SIZE}
            color={friendsActive ? iconActive : iconInactive}
          />
          <Text style={[styles.label, { color: tabLabelColor(friendsActive, false, home) }]}>Splits</Text>
        </Pressable>

        <Pressable
          onPress={goActivity}
          style={styles.side}
          accessibilityRole="button"
          accessibilityState={{ selected: activityActive }}
          accessibilityLabel="Activity"
        >
          <View>
            <Ionicons
              name={activityActive ? "time" : "time-outline"}
              size={ICON_SIZE}
              color={activityActive ? iconActive : iconInactive}
            />
            {hasUnseen && !activityActive ? <View style={styles.badgeDot} /> : null}
          </View>
          <Text style={[styles.label, { color: tabLabelColor(activityActive, false, home) }]}>
            Activity
          </Text>
        </Pressable>

        <Pressable
          onPress={goAccount}
          style={styles.side}
          accessibilityRole="button"
          accessibilityState={{ selected: accountActive }}
          accessibilityLabel="Account"
        >
          <Ionicons
            name={accountActive ? "settings" : "settings-outline"}
            size={ICON_SIZE}
            color={accountActive ? iconActive : iconInactive}
          />
          <Text style={[styles.label, { color: tabLabelColor(accountActive, false, home) }]}>
            Account
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 2,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    alignSelf: "center",
    minHeight: 56,
    paddingHorizontal: H_PAD,
  },
  side: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 2,
  },
  label: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 0.36,
    textAlign: "center",
    includeFontPadding: false,
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
