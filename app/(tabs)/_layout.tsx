import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DemoModeProvider } from "../../lib/demo-mode-context";
import { colors, font, fontSize } from "../../lib/theme";

export default function TabLayout() {
  return (
    <DemoModeProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontFamily: font.semibold,
            fontSize: fontSize["2xs"],
            letterSpacing: 0.2,
          },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopWidth: 0,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.04,
            shadowRadius: 12,
            elevation: 8,
            paddingTop: 4,
          },
          headerStyle: { backgroundColor: colors.primaryLight },
          headerTintColor: colors.text,
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
    </DemoModeProvider>
  );
}
