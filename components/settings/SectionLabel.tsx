import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../lib/theme-context";
import { font } from "../../lib/theme";

export function SectionLabel({ title }: { title: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textTertiary }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10, marginBottom: 6, paddingHorizontal: 4 },
  label: {
    fontSize: 13,
    fontFamily: font.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
