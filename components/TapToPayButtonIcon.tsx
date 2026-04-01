import { Platform, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";

/** Apple Tap to Pay checklist 5.5 — SF Symbol wave.3.right.circle.fill on iOS. */
export function TapToPayButtonIcon({ color, size = 22 }: { color: string; size?: number }) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name="wave.3.right.circle.fill"
        size={size}
        tintColor={color}
        type="monochrome"
        fallback={<Ionicons name="radio-outline" size={size} color={color} />}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="radio-outline" size={size} color={color} />
    </View>
  );
}
