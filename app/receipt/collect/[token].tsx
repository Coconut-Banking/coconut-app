import { useLocalSearchParams } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../../lib/theme-context";
import { font } from "../../../lib/theme";

export default function ReceiptCollectScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[s.root, { backgroundColor: theme.background }]}>
      <Text style={[s.title, { color: theme.text }]}>Pick your items</Text>
      <Text style={{ color: theme.textSecondary }}>Receipt collect — coming soon in app UI</Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 24 },
  title: { fontFamily: font.bold, fontSize: 22 },
});
