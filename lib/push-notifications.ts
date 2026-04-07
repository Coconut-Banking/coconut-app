import { Platform } from "react-native";

let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;
let Constants: typeof import("expo-constants").default | null = null;

try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");
  Constants = require("expo-constants").default;

  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  console.warn("[push] expo-notifications native module not available — push disabled until next native rebuild");
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device || !Constants) return null;

  if (!Device.isDevice) {
    console.log("Push notifications require a physical device");
    return null;
  }

  let finalStatus: string;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
  } catch (e) {
    console.warn("[push] permission check failed:", e instanceof Error ? e.message : e);
    return null;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission not granted");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch (e) {
    console.warn("[push] failed to get push token:", e instanceof Error ? e.message : e);
    return null;
  }
}

type NotificationResponse = import("expo-notifications").NotificationResponse;
type Notification = import("expo-notifications").Notification;

const noopSubscription = { remove: () => {} };

export function addNotificationResponseListener(
  callback: (response: NotificationResponse) => void
) {
  if (!Notifications) return noopSubscription;
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export function addNotificationReceivedListener(
  callback: (notification: Notification) => void
) {
  if (!Notifications) return noopSubscription;
  return Notifications.addNotificationReceivedListener(callback);
}
