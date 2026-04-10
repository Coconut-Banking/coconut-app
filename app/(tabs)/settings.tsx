import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser, useClerk, useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme-context";
import { useDemoMode } from "../../lib/demo-mode-context";
import { useSetup } from "../../lib/setup-context";
import { font, radii } from "../../lib/theme";

import { ProfileHeader } from "../../components/settings/ProfileHeader";
import { PreferencesCard } from "../../components/settings/PreferencesCard";
import { SectionLabel } from "../../components/settings/SectionLabel";
import { BankAccountsCard } from "../../components/settings/BankAccountsCard";
import { SplitwiseCard } from "../../components/settings/SplitwiseCard";
import { GmailCard } from "../../components/settings/GmailCard";
import { ContactsCard } from "../../components/settings/ContactsCard";
import { TapToPayCard } from "../../components/settings/TapToPayCard";
import { PaymentsCard } from "../../components/settings/PaymentsCard";
import { DevToolsCard } from "../../components/settings/DevToolsCard";
import { ProBanner } from "../../components/settings/ProBanner";
import { useProTier } from "../../lib/pro-tier-context";
import {
  InviteModal,
  type UninvitedMember,
} from "../../components/settings/InviteModal";

export default function SettingsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { setIsDemoOn } = useDemoMode();
  const { resetSetup } = useSetup();
  const { user } = useUser();
  const { sessionId } = useAuth();
  const { signOut } = useClerk();

  const { isPro, restore, purchasing: restoring } = useProTier();
  const [signingOut, setSigningOut] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [uninvitedMembers, setUninvitedMembers] = useState<
    UninvitedMember[]
  >([]);

  const handleSignOut = async () => {
    if (!signOut) return;
    setSigningOut(true);
    try {
      setIsDemoOn(false);
      const p = sessionId ? signOut({ sessionId }) : signOut();
      await Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Sign out timed out")),
            15_000,
          ),
        ),
      ]);
      setTimeout(() => {
        try {
          router.replace("/(auth)/sign-in");
        } catch {
          /* ignore */
        }
      }, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign out failed";
      Alert.alert(
        "Sign out",
        msg === "Sign out timed out"
          ? "Sign out is taking too long. Try again."
          : msg,
      );
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

        <ProfileHeader />
        <ProBanner />
        <PreferencesCard />

        <SectionLabel title="Connected Accounts" />
        <BankAccountsCard />
        <SplitwiseCard
          onShowInvites={(members) => {
            setUninvitedMembers(members);
            setShowInviteModal(true);
          }}
        />
        <GmailCard />
        <ContactsCard />

        <SectionLabel title="Payments" />
        <TapToPayCard />
        <PaymentsCard />

        <SectionLabel title="Account" />
        <DevToolsCard />

        {!isPro && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                borderColor: theme.border,
                backgroundColor: theme.surfaceSecondary,
              },
            ]}
            onPress={restore}
            disabled={restoring}
            activeOpacity={0.85}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Text
                style={[styles.actionText, { color: theme.textSecondary }]}
              >
                Restore purchases
              </Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              borderColor: theme.border,
              backgroundColor: theme.surfaceSecondary,
            },
          ]}
          onPress={async () => {
            resetSetup();
            try {
              await SecureStore.setItemAsync(
                "coconut.pending_full_reset",
                "true",
              );
            } catch {}
            try {
              await SecureStore.deleteItemAsync(
                "coconut.force_signout_done",
              );
            } catch {}
            router.replace("/setup");
          }}
          activeOpacity={0.85}
        >
          <Text
            style={[styles.actionText, { color: theme.textSecondary }]}
          >
            Re-run new user setup
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              borderColor: theme.errorLight,
              backgroundColor: theme.surfaceSecondary,
            },
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.85}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={theme.error} />
          ) : (
            <Text style={[styles.actionText, { color: theme.error }]}>
              Sign out
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {showInviteModal ? (
        <InviteModal
          visible
          members={uninvitedMembers}
          onClose={() => setShowInviteModal(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    fontFamily: font.bold,
    marginBottom: 20,
  },
  actionButton: {
    marginTop: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    minHeight: 52,
  },
  actionText: { fontSize: 16, fontFamily: font.semibold },
});
