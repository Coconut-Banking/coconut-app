import { Platform, type TextStyle } from "react-native";
import { font } from "./theme";

/** Figma Neue Plak for money — Inter Bold until custom Plak is bundled. */
export const homeMoneyType: TextStyle = {
  fontFamily: font.bold,
  fontWeight: Platform.OS === "ios" ? "700" : "700",
  fontVariant: ["tabular-nums"],
};
