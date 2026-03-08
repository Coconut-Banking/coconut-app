import { View, Text, StyleSheet } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coconut</Text>
      <Text style={styles.subtitle}>Personal finance & shared expenses</Text>
      <Text style={styles.hint}>Same features as the web app — receipts, splits, settle up.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 24,
  },
  hint: {
    fontSize: 14,
    color: "#9CA3AF",
    lineHeight: 20,
  },
});
