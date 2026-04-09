import { View, Text, TouchableOpacity, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { useDeviceContacts } from "../../hooks/useDeviceContacts";
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

  if (Platform.OS === "web") return null;

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <View style={s.sectionHeader}>
        <Ionicons name="people-circle-outline" size={24} color={theme.text} />
        <Text style={[s.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
          Contacts
        </Text>
      </View>
      <Text style={[s.sectionBlurb, { color: theme.textTertiary }]}>
        Connect your contacts to quickly find friends when splitting expenses.
      </Text>

      {permissionStatus === "granted" ? (
        <View style={{ gap: 8 }}>
          <View
            style={[
              s.resultBox,
              { backgroundColor: theme.primaryLight, borderColor: theme.border },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={theme.positive}
              />
              <Text style={[s.resultTitle, { color: theme.text }]}>
                Contacts connected
              </Text>
            </View>
            <Text style={[s.resultDetail, { color: theme.textQuaternary }]}>
              {loading
                ? "Loading..."
                : `${contacts.length} contacts available when adding expenses`}
            </Text>
          </View>
          {accessPrivileges === "limited" ? (
            <TouchableOpacity
              style={s.linkRow}
              onPress={presentAccessPicker}
            >
              <Ionicons name="person-add-outline" size={16} color={theme.text} />
              <Text style={[s.linkInline, { color: theme.accent }]}>
                Add more contacts
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : permissionStatus === "denied" ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          <View
            style={[
              s.resultBox,
              {
                backgroundColor: theme.surfaceTertiary,
                borderColor: theme.warning,
              },
            ]}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={theme.warning}
              />
              <Text style={[s.resultTitle, { color: theme.text }]}>
                Access denied
              </Text>
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
        <TouchableOpacity
          style={[
            s.primaryBtn,
            { backgroundColor: theme.primary, marginTop: 4 },
          ]}
          onPress={requestAccess}
        >
          <Text style={s.primaryBtnText}>Connect contacts</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
