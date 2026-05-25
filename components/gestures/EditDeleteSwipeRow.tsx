import React, { useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { font } from "../../lib/theme";

const ACTION_WIDTH = 76;
const ACTION_GAP = 0;

type EditDeleteSwipeRowProps = {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  enabled?: boolean;
};

function RightActions({
  progress,
  onEdit,
  onDelete,
}: {
  progress: SharedValue<number>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const editStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(progress.value, [0, 0.5, 1], [0.88, 0.95, 1]),
      },
    ],
    opacity: interpolate(progress.value, [0, 0.25, 1], [0.4, 0.85, 1]),
  }));

  const deleteStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(progress.value, [0, 0.65, 1], [0.82, 0.92, 1]),
      },
    ],
    opacity: interpolate(progress.value, [0, 0.4, 1], [0.35, 0.8, 1]),
  }));

  return (
    <View style={styles.actions}>
      <Pressable
        style={[styles.edit, { width: ACTION_WIDTH }]}
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel="Edit"
      >
        <Animated.View style={[styles.actionInner, editStyle]}>
          <Ionicons name="pencil" size={18} color="#fff" />
          <Text style={styles.actionText}>Edit</Text>
        </Animated.View>
      </Pressable>
      <Pressable
        style={[styles.delete, { width: ACTION_WIDTH }]}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel="Delete"
      >
        <Animated.View style={[styles.actionInner, deleteStyle]}>
          <Ionicons name="trash" size={18} color="#fff" />
          <Text style={styles.actionText}>Delete</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

export const EditDeleteSwipeRow = React.memo(function EditDeleteSwipeRow({
  children,
  onEdit,
  onDelete,
  enabled = true,
}: EditDeleteSwipeRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);

  const closeAnd = useCallback((fn: () => void) => {
    swipeRef.current?.close();
    fn();
  }, []);

  const renderRightActions = useCallback(
    (progress: SharedValue<number>) => (
      <RightActions
        progress={progress}
        onEdit={() => closeAnd(onEdit)}
        onDelete={() => closeAnd(onDelete)}
      />
    ),
    [closeAnd, onEdit, onDelete],
  );

  if (!enabled) {
    return <>{children}</>;
  }

  const actionsWidth = ACTION_WIDTH * 2 + ACTION_GAP;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      overshootFriction={8}
      overshootRight={false}
      rightThreshold={actionsWidth * 0.45}
      dragOffsetFromRightEdge={12}
      enableTrackpadTwoFingerGesture
      renderRightActions={renderRightActions}
      containerStyle={styles.container}
      childrenContainerStyle={styles.child}
    >
      {children}
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  child: {
    backgroundColor: "transparent",
  },
  actions: {
    flexDirection: "row",
    height: "100%",
    width: ACTION_WIDTH * 2 + ACTION_GAP,
  },
  edit: {
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
  },
  delete: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
  },
  actionInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: font.semibold,
    marginTop: 4,
  },
});
