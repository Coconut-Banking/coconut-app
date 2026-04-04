import { Share, Linking, Platform } from "react-native";
import Constants from "expo-constants";

export const BASE_URL =
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL as string) ||
  "https://coconut-app.dev";

export type InviteLink = { groupName: string; token: string };

function inviteMessage(
  senderName?: string,
  inviteLinks?: InviteLink[]
): string {
  const prefix = senderName
    ? `${senderName} invited you to`
    : "You're invited to";

  if (inviteLinks && inviteLinks.length > 0) {
    const origin = BASE_URL.replace(/\/$/, "");
    const lines = inviteLinks.map(
      (l) => `${l.groupName}: ${origin}/join/${l.token}`
    );
    return `${prefix} Coconut — the fastest way to split expenses.\n\nJoin:\n${lines.join("\n")}`;
  }

  return `${prefix} Coconut — the fastest way to split expenses. ${BASE_URL}`;
}

export async function sendSmsInvite(
  phones: string[],
  senderName?: string,
  inviteLinks?: InviteLink[]
): Promise<void> {
  const body = encodeURIComponent(inviteMessage(senderName, inviteLinks));
  const to = phones.join(",");
  const url =
    Platform.OS === "ios" ? `sms:${to}&body=${body}` : `sms:${to}?body=${body}`;
  await Linking.openURL(url);
}

export async function sendEmailInvite(
  emails: string[],
  senderName?: string,
  inviteLinks?: InviteLink[]
): Promise<void> {
  const subject = encodeURIComponent(
    senderName
      ? `${senderName} invited you to Coconut`
      : "You're invited to Coconut"
  );
  const body = encodeURIComponent(inviteMessage(senderName, inviteLinks));
  const to = emails.join(",");
  await Linking.openURL(`mailto:${to}?subject=${subject}&body=${body}`);
}

export async function shareInvite(
  senderName?: string,
  inviteLinks?: InviteLink[]
): Promise<void> {
  await Share.share({
    message: inviteMessage(senderName, inviteLinks),
    title: "Join Coconut",
  });
}
