import { Tabs } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { font } from "../../lib/theme";
import { CoconutTabBar } from "../../components/navigation/CoconutTabBar";
import { TapToPayHeroModal } from "../../components/TapToPayHeroModal";
import { StripeTerminalRoot } from "../../components/StripeTerminalRoot";

/** Split-first nav — Home · + · Activity (custom bar = Figma-style centered FAB). */
export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <>
      <TapToPayHeroModal />
    <StripeTerminalRoot>
    <Tabs
      tabBar={(props) => <CoconutTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: theme.primaryLight },
        headerTintColor: theme.text,
        headerTitleStyle: { fontFamily: font.semibold },
        tabBarStyle: {
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerShown: false }} />
      <Tabs.Screen name="add-expense" options={{ title: "Add", headerShown: false }} />
      <Tabs.Screen name="activity" options={{ title: "Activity", headerShown: false }} />
      <Tabs.Screen name="settings" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="shared" options={{ href: null, headerShown: false }} />

      <Tabs.Screen name="insights" options={{ href: null }} />
      <Tabs.Screen name="receipt" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="pay" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="tap-to-pay-education" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="email-receipts" options={{ href: null, headerShown: false }} />
    </Tabs>
    </StripeTerminalRoot>
    </>
  );
}
