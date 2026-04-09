import { View, Text, TouchableOpacity, Platform, Linking, Alert, StyleSheet } from "react-native";
import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { useDeviceContacts } from "../../hooks/useDeviceContacts";
import { font, radii } from "../../lib/theme";
import { settingsStyles as s } from "./styles";

export function ContactsCard() {
  const { theme } = useTheme();
  const {
    contacts,
    permissionStatus,
    accessPrivileges,
    requestAccess,
    presentAccessPicker,
    loading,
  } = useDeviceContacts();
  const [syncing, setSyncing] = useState(false);

  const handleAddMoreContacts = useCallback(async () => {
    const result = await presentAccessPicker();
    if (result === "unavailable") {
      Alert.alert(
        "Update Contact Access",
        "To give Coconut access to more contacts, open Settings and change Contacts access to \"Full Access\".",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
    }
  }, [presentAccessPicker]);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    await requestAccess();
    setSyncing(false);
  }, [requestAccess]);

  if (Platform.OS === "web") return null;

  const connected = permissionStatus === "granted";
  const denied = permissionStatus === "denied";
  const isLimited = accessPrivileges === "limited";
  const count = contacts.length;

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <View style={s.row}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="people-circle-outline" size={22} color={theme.text} />
          <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
            Contacts
          </Text>
        </View>
        {connected ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="checkmark-circle" size={16} color={theme.positive} />
            <Text style={[styles.statusText, { color: theme.positive }]}>
              {isLimited ? "Limited" : "Connected"}
            </Text>
          </View>
        ) : null}
      </View>

      {connected ? (
        <View style={{ gap: 10 }}>
          <Text style={[styles.countLine, { color: theme.textSecondary }]}>
            {loading ? "Loading..." : `${count.toLocaleString()} contacts`}
            {isLimited ? " (limited access)" : ""}
          </Text>

          <View style={styles.actions}>
            {isLimited ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.primaryLight }]}
                onPress={handleAddMoreContacts}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add-outline" size={14} color={theme.accent} />
                <Text style={[styles.actionText, { color: theme.accent }]}>Add more</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.primaryLight }]}
              onPress={handleRefresh}
              disabled={syncing}
              activeOpacity={0.7}
            >
              <Ionicons
                name="refresh-outline"
                size={14}
                color={syncing ? theme.textTertiary : theme.textSecondary}
              />
              <Text style={[styles.actionText, { color: syncing ? theme.textTertiary : theme.textSecondary }]}>
                {syncing ? "Syncing..." : "Refresh"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.primaryLight }]}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : denied ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          <View
            style={[
              s.resultBox,
              { backgroundColor: theme.surfaceTertiary, borderColor: theme.warning },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.warning} />
              <Text style={[s.resultTitle, { color: theme.text }]}>Access denied</Text>
            </View>
            <Text style={[s.resultDetail, { color: theme.textQuaternary }]}>
              Open Settings to allow Coconut to access your contacts.
            </Text>
          </View>
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => Linking.openSettings()}
          >
            <Text style={s.primaryBtnText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[s.sectionBlurb, { color: theme.textTertiary }]}>
            Connect your contacts to quickly find friends when splitting expenses.
          </Text>
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: theme.primary, marginTop: 4 }]}
            onPress={requestAccess}
          >
            <Text style={s.primaryBtnText}>Connect contacts</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statusText: {
    fontSize: 13,
    fontFamily: font.semibold,
  },
  countLine: {
    fontSize: 14,
    fontFamily: font.regular,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  actionText: {
    fontSize: 13,
    fontFamily: font.medium,
  },
});
