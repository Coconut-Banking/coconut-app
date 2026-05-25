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

export const HomeWelcomeHeader = React.memo(function HomeWelcomeHeader({
  topInset = 0,
  horizontalPad = 22,
}: {
  topInset?: number;
  horizontalPad?: number;
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
      style={[styles.wrap, { minHeight: HOME_HERO_WAVE_HEIGHT }]}
    >
      <View
        style={[
          styles.notifRow,
          { top: topInset + 6, right: horizontalPad },
        ]}
      >
        <CoconutNotificationButton
          hasNotification={hasUnseen}
          onPress={() => router.navigate("/(tabs)/activity")}
        />
      </View>

      <SnapPress
        onPress={() => router.navigate("/(tabs)/settings")}
        style={[styles.avatarWrap, { marginTop: topInset + 28 }]}
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
    paddingBottom: 10,
    zIndex: 1,
  },
  notifRow: {
    position: "absolute",
    zIndex: 2,
  },
  avatarWrap: {},
});
