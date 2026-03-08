import { View, Text, StyleSheet } from "react-native";

export default function SharedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Shared expenses</Text>
      <Text style={styles.subtitle}>Groups & balances</Text>
      <Text style={styles.hint}>Syncs with coconut-web. Coming next.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    marginBottom: 16,
  },
  hint: {
    fontSize: 14,
    color: "#9CA3AF",
  },
});
