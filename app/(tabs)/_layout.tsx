import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DemoModeProvider } from "../../lib/demo-mode-context";
import { useTheme } from "../../lib/theme-context";
import { DemoProvider } from "../../lib/demo-context";
import { colors, font, fontSize } from "../../lib/theme";

export default function TabLayout() {
  const { theme } = useTheme();
  return (
    <DemoModeProvider>
    <DemoProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.tabActive,
          tabBarInactiveTintColor: theme.tabInactive,
          tabBarLabelStyle: {
            fontFamily: font.semibold,
            fontSize: fontSize["2xs"],
            letterSpacing: 0.2,
          },
          tabBarStyle: {
            backgroundColor: theme.tabBar,
            borderTopWidth: 0,
            borderTopColor: theme.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.04,
            shadowRadius: 12,
            elevation: 8,
            paddingTop: 4,
          },
          headerStyle: { backgroundColor: theme.primaryLight },
          headerTintColor: theme.text,
          headerTitleStyle: { fontFamily: font.semibold },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="wallet" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="review"
          options={{
            title: "Review",
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="shared"
          options={{
            title: "Shared",
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
          }}
        />
        <Tabs.Screen name="insights" options={{ href: null }} />
        <Tabs.Screen name="receipt" options={{ href: null }} />
        <Tabs.Screen
          name="pay"
          options={{
            title: "Pay",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="hardware-chip-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen name="add-expense" options={{ href: null }} />
      </Tabs>
    </DemoProvider>
    </DemoModeProvider>
  );
}
