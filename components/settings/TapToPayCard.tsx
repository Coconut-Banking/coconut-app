import { View, Text, TouchableOpacity, Platform } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { TapToPayButtonIcon } from "../TapToPayButtonIcon";
import { settingsStyles as s } from "./styles";

export function TapToPayCard() {
  const { theme } = useTheme();

  if (Platform.OS === "web") return null;

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <View style={s.sectionHeader}>
        <TapToPayButtonIcon color={theme.text} size={24} />
        <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
          Tap to Pay on iPhone
        </Text>
      </View>
      <Text style={[s.sectionBlurb, { color: theme.textTertiary }]}>
        Accept contactless cards and digital wallets on your iPhone — no extra
        hardware needed. You can collect after you add an expense or settle up
        with someone.
      </Text>
      <TouchableOpacity
        style={s.linkRow}
        onPress={() => router.push("/(tabs)/tap-to-pay-education")}
      >
        <Ionicons name="book-outline" size={16} color={theme.text} />
        <Text style={[s.linkInline, { color: theme.accent }]}>
          How Tap to Pay works
        </Text>
      </TouchableOpacity>
    </View>
  );
}
