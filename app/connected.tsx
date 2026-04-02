import { useEffect } from "react";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSetup } from "../lib/setup-context";

/**
 * Handles coconut://connected deep link from web connect flow.
 *
 * During setup: dismisses SFSafariViewController and navigates back so the
 * setup screen (which was pushed underneath) is restored WITHOUT remounting.
 * BankStep's connectBank resumes after openBrowserAsync resolves.
 *
 * After setup: dismisses browser and goes to the home tabs.
 */
export default function ConnectedScreen() {
  const { setupComplete } = useSetup();

  useEffect(() => {
    WebBrowser.dismissBrowser().catch(() => {});

    if (!setupComplete) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/setup");
      }
    } else {
      router.replace("/(tabs)");
    }
  }, [setupComplete]);

  return null;
}
