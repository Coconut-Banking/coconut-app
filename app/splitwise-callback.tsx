import { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../lib/theme-context";

/**
 * OAuth return target — URL must stay iOS-Safari-safe (no parentheses in path).
 * Server HTML page links to e.g. coconut-dev:///splitwise-callback?splitwise=connected&import=1
 */
export default function SplitwiseCallbackScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    splitwise?: string;
    import?: string;
    splitwise_error?: string;
  }>();
  const navigated = useRef(false);

  useEffect(() => {
    if (navigated.current) return;
    navigated.current = true;

    const qs = new URLSearchParams();
    if (params.splitwise != null && params.splitwise !== "") qs.set("splitwise", String(params.splitwise));
    if (params.import != null && params.import !== "") qs.set("import", String(params.import));
    if (params.splitwise_error != null && params.splitwise_error !== "") {
      qs.set("splitwise_error", String(params.splitwise_error));
    }
    const suffix = qs.toString();
    router.replace(suffix ? `/(tabs)/settings?${suffix}` : "/(tabs)/settings");
  }, [params.splitwise, params.import, params.splitwise_error]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
});
