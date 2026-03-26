/**
 * Bottom tabs matching `MobileAppPage.tsx` / Figma: two equal columns + centered FAB that overlaps the bar.
 */
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, fontSize } from "../../lib/theme";
import { useState } from "react";

export function CoconutTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 22 : 10);
  const current = state.routes[state.index]?.name;
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const hiddenRoutes = new Set(["add-expense", "receipt", "pay", "review", "tap-to-pay-education"]);

  const triggerMediumHaptic = () => {
    // Some iOS runtimes/simulators expose expo-haptics without native support.
    // Swallow errors so tap actions continue to work.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const goIndex = () => {
    navigation.navigate("index" as never);
  };
  const goActivity = () => {
    navigation.navigate("activity" as never);
  };
  const goFriends = () => {
    navigation.navigate("shared" as never);
  };
  const goAccount = () => {
    navigation.navigate("settings" as never);
  };
  const goAdd = () => {
    triggerMediumHaptic();
    router.push({
      pathname: "/(tabs)/add-expense",
      params: {
        prefillNonce: String(Date.now()),
        prefillDesc: "",
        prefillAmount: "",
      },
    });
  };
  const openAddMenu = () => {
    triggerMediumHaptic();
    setFabMenuOpen(true);
  };

  const homeActive = current === "index";
  const friendsActive = current === "shared";
  const activityActive = current === "activity";
  const accountActive = current === "settings";
  const activeColor = "#1F2328";
  const inactiveColor = "#9AA0A6";

  if (current && hiddenRoutes.has(current)) {
    return null;
  }

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: bottomPad,
          backgroundColor: "rgba(255,255,255,0.97)",
          borderTopColor: "#E6DFDA",
        },
      ]}
    >
      <View style={styles.row}>
          <Pressable
            onPress={goIndex}
            style={({ pressed }) => [styles.side, pressed && { opacity: 0.75 }]}
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
            style={({ pressed }) => [styles.side, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: friendsActive }}
            accessibilityLabel="Friends"
          >
            <Ionicons
              name={friendsActive ? "people" : "people-outline"}
              size={22}
              color={friendsActive ? activeColor : inactiveColor}
            />
            <Text style={[styles.label, { color: friendsActive ? activeColor : inactiveColor }]}>Friends</Text>
          </Pressable>

          <View style={styles.centerSpacer} />

          <Pressable
            onPress={goActivity}
            style={({ pressed }) => [styles.side, pressed && { opacity: 0.75 }]}
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
            style={({ pressed }) => [styles.side, pressed && { opacity: 0.75 }]}
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
        <View style={styles.fabHalo} pointerEvents="none" />
        <Pressable
          onPress={() => {
            openAddMenu();
          }}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: "#1F2328", borderColor: "#FFFFFF" },
            pressed && styles.fabPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add options"
        >
          <View style={styles.fabGloss} pointerEvents="none" />
          <Ionicons name="add" size={32} color="#FFFFFF" style={styles.fabIcon} />
        </Pressable>
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={fabMenuOpen}
        onRequestClose={() => setFabMenuOpen(false)}
      >
        <Pressable style={styles.fabOverlay} onPress={() => setFabMenuOpen(false)}>
          <Pressable style={styles.fabMenu} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.fabMenuTitle}>Add</Text>

            <TouchableOpacity
              style={styles.fabMenuRow}
              onPress={() => {
                setFabMenuOpen(false);
                goAdd();
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="create-outline" size={20} color="#1F2328" />
              <View style={{ flex: 1 }}>
                <Text style={styles.fabMenuRowTitle}>Add expense</Text>
                <Text style={styles.fabMenuRowSub}>Split manually with people</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8A9098" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fabMenuRow}
              onPress={() => {
                setFabMenuOpen(false);
                triggerMediumHaptic();
                router.push("/(tabs)/receipt");
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="scan-outline" size={20} color="#1F2328" />
              <View style={{ flex: 1 }}>
                <Text style={styles.fabMenuRowTitle}>Scan receipt</Text>
                <Text style={styles.fabMenuRowSub}>Parse items, then assign</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8A9098" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fabMenuCancel}
              onPress={() => setFabMenuOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.fabMenuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Slightly larger than before; sits higher so it reads as floating above the bar. */
const FAB = 58;
/** Soft brand glow behind the button (reads as “lift” on dark UI). */
const HALO = 10;
const FAB_TOP = -(FAB / 2) - 10;

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E6DFDA",
    paddingTop: 8,
    position: "relative",
    overflow: "visible",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 10,
  },
  side: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    paddingBottom: 4,
  },
  centerSpacer: {
    width: 64,
    flexShrink: 0,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: fontSize["2xs"],
    letterSpacing: 0.2,
    color: "#8A9098",
  },
  fabWrap: {
    position: "absolute",
    left: "50%",
    top: FAB_TOP - HALO / 2,
    width: FAB + HALO,
    height: FAB + HALO,
    marginLeft: -(FAB + HALO) / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  fabHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: (FAB + HALO) / 2,
    backgroundColor: "rgba(31,35,40,0.08)",
    transform: [{ scale: 1.06 }],
  },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#1F2328",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.9)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
  },
  fabPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.96,
  },
  /** Subtle top highlight — reads as a lit sphere, not a flat disk. */
  fabGloss: {
    position: "absolute",
    top: 0,
    left: "12%",
    right: "12%",
    height: "38%",
    borderTopLeftRadius: FAB / 2,
    borderTopRightRadius: FAB / 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  fabIcon: {
    marginTop: 1,
    /** Crisp + on the gradient fill */
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  fabOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
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
