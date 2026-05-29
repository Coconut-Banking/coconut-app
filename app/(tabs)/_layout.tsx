import React, { useState, useEffect, type ComponentType, type ReactNode } from "react";
import { Tabs } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { font } from "../../lib/theme";
import { CoconutTabBar } from "../../components/navigation/CoconutTabBar";
import { FloatingActionButtons } from "../../components/FloatingActionButtons";
import { FabScrollProvider } from "../../lib/fab-scroll-context";
import { TapToPayHeroModal } from "../../components/TapToPayHeroModal";
import { usePrefetchContactsSummary, usePrefetchActivity } from "../../hooks/useGroups";
import { usePrefetchTransactions } from "../../hooks/useTransactions";
import { CANVAS_BOTTOM } from "../../components/home/HomeScreenBackground";
import { NavigationThemeBridge } from "../../components/NavigationThemeBridge";

export default function TabLayout() {
  const { theme } = useTheme();
  usePrefetchContactsSummary(500);
  usePrefetchActivity(0);
  usePrefetchTransactions();
  const [StripeRoot, setStripeRoot] = useState<ComponentType<{ children: ReactNode }> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      import("../../components/StripeTerminalRoot").then((mod) => {
        setStripeRoot(() => mod.StripeTerminalRoot as ComponentType<{ children: ReactNode }>);
      }).catch(() => {});
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const Wrapper = StripeRoot ?? React.Fragment;

  return (
    <>
      <Wrapper>
        <NavigationThemeBridge>
        <FabScrollProvider>
        <TapToPayHeroModal />
        <Tabs
          tabBar={(props) => <CoconutTabBar {...props} />}
          screenOptions={{
            lazy: true,
            headerShown: false,
            headerStyle: { backgroundColor: theme.primaryLight },
            headerTintColor: theme.text,
            headerTitleStyle: { fontFamily: font.semibold },
            animation: "shift",
            sceneStyle: { backgroundColor: CANVAS_BOTTOM },
            tabBarStyle: {
              backgroundColor: "transparent",
              borderTopWidth: 0,
              elevation: 0,
              shadowOpacity: 0,
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              headerShown: false,
              sceneStyle: { backgroundColor: CANVAS_BOTTOM },
            }}
          />
          <Tabs.Screen name="bank" options={{ title: "Bank", headerShown: false, sceneStyle: { backgroundColor: CANVAS_BOTTOM } }} />
          <Tabs.Screen name="shared" options={{ title: "Shared", headerShown: false, sceneStyle: { backgroundColor: CANVAS_BOTTOM } }} />
          <Tabs.Screen name="activity" options={{ title: "Activity", headerShown: false, sceneStyle: { backgroundColor: CANVAS_BOTTOM } }} />
          <Tabs.Screen name="settings" options={{ title: "Account", headerShown: false, sceneStyle: { backgroundColor: CANVAS_BOTTOM } }} />

          <Tabs.Screen name="add-expense" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="insights" options={{ href: null }} />
          <Tabs.Screen name="receipt" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="pay" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="tap-to-pay-education" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="email-receipts" options={{ href: null, headerShown: false }} />
        </Tabs>
        <FloatingActionButtons />
        </FabScrollProvider>
        </NavigationThemeBridge>
      </Wrapper>
    </>
  );
}
