import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Platform, DeviceEventEmitter } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { TapToPayButtonIcon } from "../TapToPayButtonIcon";
import { settingsStyles as s } from "./styles";
import { hasAcceptedTapToPayTerms } from "../../lib/tap-to-pay-onboarding";
import { TTP_ENABLE_REQUESTED_EVENT } from "../StripeTerminalEagerConnect";

export function TapToPayCard() {
  const { theme } = useTheme();
  const [termsAccepted, setTermsAccepted] = useState(true); // optimistic default

  useEffect(() => {
    hasAcceptedTapToPayTerms().then(setTermsAccepted).catch(() => setTermsAccepted(true));
  }, []);

  if (Platform.OS === "web") return null;

  const handleEnable = () => {
    DeviceEventEmitter.emit(TTP_ENABLE_REQUESTED_EVENT);
    setTermsAccepted(true); // optimistically hide button while TTP initializes
  };

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <View style={s.sectionHeader}>
        <TapToPayButtonIcon color={theme.text} size={24} />
        <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
          Tap to Pay on iPhone
        </Text>
      </View>
      <Text style={[s.sectionBlurb, { color: theme.textTertiary }]}>
        Accept contactless cards and digital wallets on your iPhone — no extra
        hardware needed. You can collect after you add an expense or settle up
        with someone.
      </Text>

      {/* Shown if T&Cs haven't been accepted yet — satisfies Apple checklist §3.6 */}
      {!termsAccepted && (
        <TouchableOpacity
          style={[s.linkRow, { backgroundColor: theme.primaryLight, borderRadius: 10, paddingVertical: 10, marginBottom: 4 }]}
          onPress={handleEnable}
          activeOpacity={0.85}
        >
          <TapToPayButtonIcon color={theme.primary} size={16} />
          <Text style={[s.linkInline, { color: theme.primary, fontWeight: "600" }]}>
            Enable Tap to Pay on iPhone
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={s.linkRow}
        onPress={() => router.push("/(tabs)/tap-to-pay-education")}
      >
        <TapToPayButtonIcon color={theme.text} size={16} />
        <Text style={[s.linkInline, { color: theme.accent }]}>
          How Tap to Pay works
        </Text>
      </TouchableOpacity>
    </View>
  );
}
