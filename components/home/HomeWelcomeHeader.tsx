import React from "react";
import { View, StyleSheet } from "react-native";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { MemberAvatar } from "../MemberAvatar";
import { SnapPress } from "../ui";
import { useHasUnseenActivity } from "../../hooks/useGroups";
import { CoconutNotificationButton } from "./CoconutNotificationButton";
import {
  HOME_NOTIF_RIGHT,
  homeAvatarTopOffset,
  homeHeaderContentHeight,
  homeNotifTopOffset,
} from "../../lib/home-screen-insets";

/** Figma 138:1934 — 64pt avatar centered; 138:2180 — bell top-right (48pt shell). */
export const HomeWelcomeHeader = React.memo(function HomeWelcomeHeader({
  topInset = 0,
}: {
  topInset?: number;
}) {
  const { user } = useUser();
  const hasUnseen = useHasUnseenActivity();

  const firstName =
    user?.firstName?.trim() ||
    user?.fullName?.split(/\s+/)[0] ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "there";

  return (
    <Animated.View
      entering={FadeInDown.duration(380).delay(40)}
      style={[styles.wrap, { minHeight: homeHeaderContentHeight(topInset) }]}
    >
      <View
        style={[
          styles.notifRow,
          { top: homeNotifTopOffset(topInset), right: HOME_NOTIF_RIGHT },
        ]}
      >
        <CoconutNotificationButton
          hasNotification={hasUnseen}
          onPress={() => router.navigate("/(tabs)/activity")}
        />
      </View>

      <SnapPress
        onPress={() => router.navigate("/(tabs)/settings")}
        style={[styles.avatarWrap, { marginTop: homeAvatarTopOffset(topInset) }]}
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
    zIndex: 1,
  },
  notifRow: {
    position: "absolute",
    zIndex: 2,
  },
  avatarWrap: {},
});
