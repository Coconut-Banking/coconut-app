import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { SnapPress } from "../ui";
import { useHomePalette } from "../../lib/home-theme";

/** Figma notification bell — 48pt shell, straw when unseen. */
export const CoconutNotificationButton = React.memo(function CoconutNotificationButton({
  hasNotification,
  onPress,
}: {
  hasNotification: boolean;
  onPress: () => void;
}) {
  const home = useHomePalette();

  return (
    <SnapPress onPress={onPress} style={styles.hit} haptic="medium">
      <View style={[styles.shell, { backgroundColor: home.coconutShell }]}>
        <Ionicons name="notifications" size={24} color="#FFFFFF" style={styles.bell} />
        {hasNotification ? (
          <Svg width={20} height={24} viewBox="0 0 20 24" style={styles.straw}>
            <Rect x={8} y={1} width={4} height={13} rx={2} fill={home.coconutStraw} />
            <Rect x={8.5} y={1} width={3} height={4} rx={1.5} fill="#FFF8EE" opacity={0.95} />
            <Path
              d="M6 13 C6 17.5 9.5 19.5 10 19.5 C10.5 19.5 14 17.5 14 13"
              stroke={home.coconutStraw}
              strokeWidth={2.8}
              fill="none"
              strokeLinecap="round"
            />
          </Svg>
        ) : null}
      </View>
    </SnapPress>
  );
});

const styles = StyleSheet.create({
  hit: {
    width: 48,
    height: 48,
  },
  shell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  bell: {
    marginTop: 2,
  },
  straw: {
    position: "absolute",
    top: -10,
    right: 2,
    transform: [{ rotate: "28deg" }],
  },
});
