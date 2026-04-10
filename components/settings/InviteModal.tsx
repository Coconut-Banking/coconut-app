import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { useTheme } from "../../lib/theme-context";
import {
  sendEmailInvite,
  shareInvite,
  type InviteLink,
} from "../../lib/invite";
import { font } from "../../lib/theme";
import { settingsStyles as s } from "./styles";

export type UninvitedMember = {
  displayName: string;
  email: string | null;
  groupName: string;
  inviteToken: string | null;
};

type Props = {
  visible: boolean;
  members: UninvitedMember[];
  onClose: () => void;
};

export function InviteModal({ visible, members, onClose }: Props) {
  const { theme } = useTheme();
  const { user } = useUser();
  const [selectedInvites, setSelectedInvites] = useState<Set<number>>(
    new Set(),
  );
  const [sendingInvites, setSendingInvites] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedInvites(new Set(members.map((_, i) => i)));
    }
  }, [visible, members]);

  const toggleInvite = (idx: number) => {
    setSelectedInvites((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedInvites.size === members.length) {
      setSelectedInvites(new Set());
    } else {
      setSelectedInvites(new Set(members.map((_, i) => i)));
    }
  };

  const handleSend = async () => {
    if (selectedInvites.size === 0) return;
    setSendingInvites(true);
    const senderName = user?.fullName || user?.username || undefined;
    const selected = members.filter((_, i) => selectedInvites.has(i));
    const emails = selected.filter((m) => m.email).map((m) => m.email!);

    const seen = new Set<string>();
    const inviteLinks: InviteLink[] = [];
    for (const m of selected) {
      if (m.inviteToken && !seen.has(m.inviteToken)) {
        seen.add(m.inviteToken);
        inviteLinks.push({ groupName: m.groupName, token: m.inviteToken });
      }
    }

    try {
      if (emails.length > 0) {
        await sendEmailInvite(emails, senderName, inviteLinks);
      } else {
        await shareInvite(senderName, inviteLinks);
      }
    } catch {
      /* parent handles */
    } finally {
      setSendingInvites(false);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.overlay, { backgroundColor: theme.overlay }]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[
              styles.handle,
              { backgroundColor: theme.textQuaternary },
            ]}
          />

          <Text style={[styles.title, { color: theme.text }]}>
            Invite friends to Coconut
          </Text>
          <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
            {members.length} {members.length === 1 ? "person" : "people"} from
            your Splitwise groups{" "}
            {members.length === 1 ? "isn't" : "aren't"} on Coconut yet. Invite
            them so they can see shared expenses too.
          </Text>

          <TouchableOpacity
            style={styles.selectAll}
            onPress={toggleAll}
            activeOpacity={0.7}
          >
            <Ionicons
              name={
                selectedInvites.size === members.length
                  ? "checkbox"
                  : "square-outline"
              }
              size={22}
              color={
                selectedInvites.size === members.length
                  ? theme.text
                  : theme.textTertiary
              }
            />
            <Text style={[styles.selectAllTxt, { color: theme.text }]}>
              {selectedInvites.size === members.length
                ? "Deselect all"
                : "Select all"}
            </Text>
          </TouchableOpacity>

          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {members.map((m, i) => {
              const checked = selectedInvites.has(i);
              return (
                <TouchableOpacity
                  key={`${m.email ?? m.displayName}-${i}`}
                  style={[
                    styles.row,
                    { borderBottomColor: theme.borderLight },
                  ]}
                  onPress={() => toggleInvite(i)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={checked ? theme.text : theme.textTertiary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.text }]}>
                      {m.displayName}
                    </Text>
                    <Text
                      style={[styles.meta, { color: theme.textQuaternary }]}
                    >
                      {m.email ?? "No email"} · {m.groupName}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                s.primaryBtn,
                { backgroundColor: theme.primary, flex: 1 },
                (selectedInvites.size === 0 || sendingInvites) && s.disabled,
              ]}
              onPress={handleSend}
              disabled={selectedInvites.size === 0 || sendingInvites}
            >
              {sendingInvites ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>
                  Invite{" "}
                  {selectedInvites.size > 0 ? `${selectedInvites.size} ` : ""}
                  {selectedInvites.size === 1 ? "person" : "people"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.skip} onPress={onClose}>
            <Text style={[styles.skipTxt, { color: theme.textTertiary }]}>
              Skip for now
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "85%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  title: { fontSize: 20, fontFamily: font.bold, marginBottom: 8 },
  subtitle: {
    fontSize: 14,
    fontFamily: font.regular,
    lineHeight: 20,
    marginBottom: 16,
  },
  selectAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    marginBottom: 4,
  },
  selectAllTxt: { fontSize: 15, fontFamily: font.semibold },
  list: { maxHeight: 320, marginBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontFamily: font.semibold },
  meta: { fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  actions: { flexDirection: "row", gap: 10 },
  skip: { alignItems: "center", paddingVertical: 14 },
  skipTxt: { fontSize: 15, fontFamily: font.medium },
});
