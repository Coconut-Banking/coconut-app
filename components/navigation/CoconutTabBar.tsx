/**
 * Bottom tabs: four tabs + centered FAB that overlaps the bar.
 */
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { StackActions } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, fontSize } from "../../lib/theme";
import { useState } from "react";
import { useTheme } from "../../lib/theme-context";
import { getExpensePrefillTarget } from "../../lib/add-expense-prefill";
import { sfx } from "../../lib/sounds";

export function CoconutTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 22 : 10);
  const current = state.routes[state.index]?.name;
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const hiddenRoutes = new Set(["add-expense", "receipt", "pay", "review", "tap-to-pay-education"]);

  const popTabToRoot = (tabName: string) => {
    const route = state.routes.find((r) => r.name === tabName);
    if (route?.state?.index && route.state.index > 0) {
      navigation.dispatch({
        ...StackActions.popToTop(),
        target: route.state.key,
      });
    }
  };

  const goIndex = () => {
    sfx.tabTap();
    navigation.navigate("index" as never);
  };
  const goActivity = () => {
    sfx.tabTap();
    navigation.navigate("activity" as never);
  };
  const goFriends = () => {
    sfx.tabTap();
    navigation.navigate("shared" as never);
    popTabToRoot("shared");
  };
  const goAccount = () => {
    sfx.tabTap();
    navigation.navigate("settings" as never);
  };
  const goAdd = () => {
    sfx.fabPress();
    const prefill = getExpensePrefillTarget();
    router.push({
      pathname: "/(tabs)/add-expense",
      params: {
        prefillNonce: String(Date.now()),
        prefillDesc: "",
        prefillAmount: "",
        ...(prefill
          ? { prefillPersonKey: prefill.key, prefillPersonName: prefill.name, prefillPersonType: prefill.type }
          : {}),
      },
    });
  };
  const openAddMenu = () => {
    sfx.fabPress();
    setFabMenuOpen(true);
  };

  const homeActive = current === "index";
  const friendsActive = current === "shared";
  const activityActive = current === "activity";
  const accountActive = current === "settings";
  const activeColor = theme.text;
  const inactiveColor = theme.textTertiary;

  if (current && hiddenRoutes.has(current)) {
    return null;
  }

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: bottomPad,
          backgroundColor: theme.surface,
        },
      ]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={goIndex}
          style={({ pressed }) => [styles.side, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityState={{ selected: homeActive }}
          accessibilityLabel="Home"
        >
          <Ionicons
            name={homeActive ? "home" : "home-outline"}
            size={22}
            color={homeActive ? activeColor : inactiveColor}
          />
          <Text style={[styles.label, { color: homeActive ? activeColor : inactiveColor }]}>Home</Text>
        </Pressable>

        <Pressable
          onPress={goFriends}
          style={({ pressed }) => [styles.side, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityState={{ selected: friendsActive }}
          accessibilityLabel="Shared"
        >
          <Ionicons
            name={friendsActive ? "people" : "people-outline"}
            size={22}
            color={friendsActive ? activeColor : inactiveColor}
          />
          <Text style={[styles.label, { color: friendsActive ? activeColor : inactiveColor }]}>Shared</Text>
        </Pressable>

        <View style={styles.centerSpacer} />

        <Pressable
          onPress={goActivity}
          style={({ pressed }) => [styles.side, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityState={{ selected: activityActive }}
          accessibilityLabel="Activity"
        >
          <Ionicons
            name={activityActive ? "time" : "time-outline"}
            size={22}
            color={activityActive ? activeColor : inactiveColor}
          />
          <Text style={[styles.label, { color: activityActive ? activeColor : inactiveColor }]}>Activity</Text>
        </Pressable>

        <Pressable
          onPress={goAccount}
          style={({ pressed }) => [styles.side, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityState={{ selected: accountActive }}
          accessibilityLabel="Account"
        >
          <Ionicons
            name={accountActive ? "person" : "person-outline"}
            size={22}
            color={accountActive ? activeColor : inactiveColor}
          />
          <Text style={[styles.label, { color: accountActive ? activeColor : inactiveColor }]}>Account</Text>
        </Pressable>
      </View>

      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable
          onPress={openAddMenu}
          style={({ pressed }) => [
            styles.fab,
            pressed && styles.fabPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add options"
        >
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </Pressable>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={fabMenuOpen}
        onRequestClose={() => setFabMenuOpen(false)}
      >
        <Pressable style={styles.fabOverlay} onPress={() => setFabMenuOpen(false)}>
          <Pressable style={[styles.fabMenu, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.fabMenuTitle, { color: theme.text }]}>Add</Text>

            <TouchableOpacity
              style={[styles.fabMenuRow, { borderColor: theme.border }]}
              onPress={() => {
                setFabMenuOpen(false);
                goAdd();
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="create-outline" size={20} color={theme.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.fabMenuRowTitle, { color: theme.text }]}>Add expense</Text>
                <Text style={[styles.fabMenuRowSub, { color: theme.textTertiary }]}>Split manually with people</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.fabMenuRow, { borderColor: theme.border }]}
              onPress={() => {
                setFabMenuOpen(false);
                sfx.pop();
                router.push("/(tabs)/receipt");
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="scan-outline" size={20} color={theme.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.fabMenuRowTitle, { color: theme.text }]}>Scan receipt</Text>
                <Text style={[styles.fabMenuRowSub, { color: theme.textTertiary }]}>Parse items, then assign</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fabMenuCancel}
              onPress={() => setFabMenuOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.fabMenuCancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const FAB = 54;
const FAB_TOP = -(FAB / 2) - 4;

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
    paddingTop: 8,
    position: "relative",
    overflow: "visible",
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
    minHeight: 48,
    paddingHorizontal: 8,
  },
  side: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 4,
  },
  centerSpacer: {
    width: FAB + 8,
    flexShrink: 0,
  },
  label: {
    fontFamily: font.medium,
    fontSize: fontSize["2xs"],
    letterSpacing: 0.1,
  },
  fabWrap: {
    position: "absolute",
    left: "50%",
    top: FAB_TOP,
    width: FAB,
    height: FAB,
    marginLeft: -FAB / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F2328",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
  },
  fabPressed: {
    transform: [{ scale: 0.93 }],
  },
  fabOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  fabMenu: {
    margin: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E6DFDA",
    borderRadius: 20,
    padding: 16,
    paddingTop: 10,
  },
  fabMenuTitle: {
    fontFamily: font.bold,
    fontSize: 18,
    color: "#1F2328",
    marginBottom: 10,
  },
  fabMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECE5E0",
    marginBottom: 10,
  },
  fabMenuRowTitle: {
    fontFamily: font.bold,
    fontSize: 15,
    color: "#1F2328",
  },
  fabMenuRowSub: {
    marginTop: 2,
    fontFamily: font.regular,
    fontSize: 12,
    color: "#7A8088",
  },
  fabMenuCancel: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 6,
  },
  fabMenuCancelText: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: "#3F464F",
  },
});
