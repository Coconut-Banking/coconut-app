import React, { useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { font } from "../../lib/theme";
import { useHomePalette } from "../../lib/home-theme";
import { sfx } from "../../lib/sounds";
import { HOME_TX_ROW_HEIGHT } from "../../lib/home-tx-row";

/** Figma split strip width (~67pt visible + rounded left). */
const SPLIT_ACTION_WIDTH = 72;

type SplitSwipeRowProps = {
  children: React.ReactNode;
  onSplit: () => void;
  enabled?: boolean;
};

function SplitRevealPanel({
  progress,
  onPress,
  actionColor,
  labelColor,
}: {
  progress: SharedValue<number>;
  onPress: () => void;
  actionColor: string;
  labelColor: string;
}) {
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 0.7], [0, 0.75, 1]),
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [10, 0]),
      },
    ],
  }));

  return (
    <View style={[styles.actionShell, { width: SPLIT_ACTION_WIDTH }]}>
      <Pressable
        style={[styles.actionFill, { backgroundColor: actionColor }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Split transaction"
      >
        <Animated.View style={[styles.labelWrap, labelStyle]}>
          <Text style={[styles.splitLabel, { color: labelColor }]}>SPLIT</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

export const SplitSwipeRow = React.memo(function SplitSwipeRow({
  children,
  onSplit,
  enabled = true,
}: SplitSwipeRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const splitTriggeredRef = useRef(false);
  const home = useHomePalette();

  const goSplit = useCallback(() => {
    if (splitTriggeredRef.current) return;
    splitTriggeredRef.current = true;
    void sfx.pop();
    swipeRef.current?.close();
    onSplit();
    setTimeout(() => {
      splitTriggeredRef.current = false;
    }, 500);
  }, [onSplit]);

  const onSwipeOpen = useCallback(
    (direction: SwipeDirection.LEFT | SwipeDirection.RIGHT) => {
      if (direction === SwipeDirection.RIGHT) goSplit();
    },
    [goSplit],
  );

  const renderLeftActions = useCallback(
    (progress: SharedValue<number>) => (
      <SplitRevealPanel
        progress={progress}
        onPress={goSplit}
        actionColor={home.splitAction}
        labelColor={home.splitActionText}
      />
    ),
    [goSplit, home.splitAction, home.splitActionText],
  );

  if (!enabled) {
    return <View style={styles.wrap}>{children}</View>;
  }

  return (
    <View style={styles.wrap}>
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={2}
        overshootFriction={8}
        overshootLeft={false}
        leftThreshold={SPLIT_ACTION_WIDTH * 0.55}
        dragOffsetFromLeftEdge={12}
        enableTrackpadTwoFingerGesture
        renderLeftActions={renderLeftActions}
        onSwipeableOpen={onSwipeOpen}
        containerStyle={styles.swipeContainer}
        childrenContainerStyle={styles.swipeChild}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
});

export const SPLIT_SWIPE_ROW_HEIGHT = HOME_TX_ROW_HEIGHT;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 0,
  },
  swipeContainer: {
    overflow: "hidden",
    borderRadius: 4,
  },
  swipeChild: {
    backgroundColor: "transparent",
  },
  actionShell: {
    height: HOME_TX_ROW_HEIGHT,
    justifyContent: "center",
    marginRight: 0,
  },
  actionFill: {
    flex: 1,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  labelWrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  splitLabel: {
    fontSize: 16,
    fontFamily: font.bold,
    letterSpacing: 0.48,
  },
});
