import React, { useState, useEffect, type ComponentType, type ReactNode } from "react";
import { Tabs } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { font } from "../../lib/theme";
import { CoconutTabBar } from "../../components/navigation/CoconutTabBar";
import { FloatingActionButtons } from "../../components/FloatingActionButtons";
import { TapToPayHeroModal } from "../../components/TapToPayHeroModal";
import { usePrefetchContactsSummary } from "../../hooks/useGroups";

export default function TabLayout() {
  const { theme } = useTheme();
  usePrefetchContactsSummary(500);
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
      <TapToPayHeroModal />
      <Wrapper>
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
          <Tabs.Screen name="bank" options={{ title: "Bank", headerShown: false }} />
          <Tabs.Screen name="shared" options={{ title: "Shared", headerShown: false }} />
          <Tabs.Screen name="activity" options={{ title: "Activity", headerShown: false }} />
          <Tabs.Screen name="settings" options={{ title: "Account", headerShown: false }} />

          <Tabs.Screen name="add-expense" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="insights" options={{ href: null }} />
          <Tabs.Screen name="receipt" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="pay" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="tap-to-pay-education" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="email-receipts" options={{ href: null, headerShown: false }} />
        </Tabs>
        <FloatingActionButtons />
      </Wrapper>
    </>
  );
}
