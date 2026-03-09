import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#3D8E62",
        tabBarInactiveTintColor: "#9CA3AF",
        headerStyle: { backgroundColor: "#EEF7F2" },
        headerTintColor: "#1F2937",
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
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, size }) => <Ionicons name="analytics" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="receipt"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="pay"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="add-expense"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="email-receipts"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
