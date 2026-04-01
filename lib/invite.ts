import { Share, Linking, Platform } from "react-native";

const INVITE_URL = "https://coconut-app.dev";

function inviteMessage(senderName?: string): string {
  const prefix = senderName ? `${senderName} invited you to` : "You're invited to";
  return `${prefix} Coconut — the fastest way to split expenses. ${INVITE_URL}`;
}

export async function sendSmsInvite(
  phones: string[],
  senderName?: string
): Promise<void> {
  const body = encodeURIComponent(inviteMessage(senderName));
  const to = phones.join(",");
  const url = Platform.OS === "ios"
    ? `sms:${to}&body=${body}`
    : `sms:${to}?body=${body}`;
  await Linking.openURL(url);
}

export async function sendEmailInvite(
  emails: string[],
  senderName?: string
): Promise<void> {
  const subject = encodeURIComponent(senderName ? `${senderName} invited you to Coconut` : "You're invited to Coconut");
  const body = encodeURIComponent(inviteMessage(senderName));
  const to = emails.join(",");
  await Linking.openURL(`mailto:${to}?subject=${subject}&body=${body}`);
}

export async function shareInvite(senderName?: string): Promise<void> {
  await Share.share({
    message: inviteMessage(senderName),
    title: "Join Coconut",
  });
}
