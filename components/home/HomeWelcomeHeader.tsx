import React from "react";
import { View, StyleSheet } from "react-native";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { MemberAvatar } from "../MemberAvatar";
import { SnapPress } from "../ui";
import { useHasUnseenActivity } from "../../hooks/useGroups";
import { CoconutNotificationButton } from "./CoconutNotificationButton";
import { HOME_HERO_WAVE_HEIGHT } from "./HomeHeroBackdrop";

export const HomeWelcomeHeader = React.memo(function HomeWelcomeHeader() {
  const { user } = useUser();
  const hasUnseen = useHasUnseenActivity();

  const firstName =
    user?.firstName?.trim() ||
    user?.fullName?.split(/\s+/)[0] ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "there";

  return (
    <Animated.View entering={FadeInDown.duration(380).delay(40)} style={styles.wrap}>
      <View style={styles.notifRow}>
        <CoconutNotificationButton
          hasNotification={hasUnseen}
          onPress={() => router.navigate("/(tabs)/activity")}
        />
      </View>

      <SnapPress
        onPress={() => router.navigate("/(tabs)/settings")}
        style={styles.avatarWrap}
        haptic="light"
      >
        <MemberAvatar
          name={user?.fullName ?? firstName}
          size={64}
          imageUrl={user?.imageUrl ?? null}
          variant="soft"
        />
      </SnapPress>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 8,
    minHeight: HOME_HERO_WAVE_HEIGHT - 48,
    zIndex: 1,
  },
  notifRow: {
    position: "absolute",
    top: 4,
    right: 2,
    zIndex: 2,
  },
  avatarWrap: {
    marginTop: 36,
  },
});
