import { Stack } from "expo-router";
import { DemoProvider } from "../../../lib/demo-context";

function SharedStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
        gestureDirection: "horizontal",
        animation: "slide_from_right",
      }}
    />
  );
}

export default function SharedLayout() {
  return (
    <DemoProvider>
      <SharedStack />
    </DemoProvider>
  );
}
