import { useEffect } from "react";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSetup } from "../lib/setup-context";

/**
 * Handles coconut://connected deep link from web connect flow.
 *
 * During setup the auth session auto-dismisses (openAuthSessionAsync detects
 * the callback URL), so this route is mainly a no-op — the setup screen's
 * BankStep resumes via the resolved promise. We still dismiss any lingering
 * browser as a safety net.
 *
 * After setup (e.g. reconnecting from Settings): dismisses browser and
 * navigates to the home tabs.
 */
export default function ConnectedScreen() {
  const { setupComplete } = useSetup();

  useEffect(() => {
    WebBrowser.dismissBrowser().catch(() => {});

    if (setupComplete) {
      router.replace("/(tabs)");
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/setup");
    }
  }, [setupComplete]);

  return null;
}
