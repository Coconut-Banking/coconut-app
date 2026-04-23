import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Completes the in-app browser session when Clerk redirects back with
 * `scheme://sso-callback?...` (see useSSO / oauth_google fallback).
 */
export default function SsoCallbackScreen() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
});
