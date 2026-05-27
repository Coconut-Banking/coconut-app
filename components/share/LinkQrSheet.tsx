import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Share,
  Pressable,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useTheme } from "../../lib/theme-context";
import { font, radii, space } from "../../lib/theme";
import { useToast } from "../Toast";

type Props = {
  visible: boolean;
  url: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
};

export function LinkQrSheet({ visible, url, title = "Scan to join", subtitle, onClose }: Props) {
  const { theme } = useTheme();
  const toast = useToast();

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[s.root, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
        <View style={s.header}>
          <Text style={[s.title, { color: theme.text }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.text} />
          </Pressable>
        </View>
        {subtitle ? (
          <Text style={[s.sub, { color: theme.textSecondary }]}>{subtitle}</Text>
        ) : null}
        <View style={[s.qrWrap, { backgroundColor: theme.surface }]}>
          <QRCode value={url} size={220} />
        </View>
        <Text style={[s.url, { color: theme.textTertiary }]} numberOfLines={2}>
          {url}
        </Text>
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: theme.primary }]}
            onPress={async () => {
              await Clipboard.setStringAsync(url);
              toast.show("Link copied");
            }}
          >
            <Text style={s.btnText}>Copy link</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnOutline, { borderColor: theme.border }]}
            onPress={() => Share.share({ message: url, url })}
          >
            <Text style={[s.btnOutlineText, { color: theme.text }]}>Share</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md },
  title: { fontFamily: font.bold, fontSize: 20 },
  sub: { fontFamily: font.regular, fontSize: 14, marginTop: space.sm },
  qrWrap: {
    alignSelf: "center",
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radii.xl,
  },
  url: { textAlign: "center", marginTop: space.md, fontFamily: font.regular, fontSize: 12, paddingHorizontal: space.md },
  actions: { marginTop: space.xl, gap: space.sm },
  btn: { borderRadius: radii.lg, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontFamily: font.semibold, fontSize: 16 },
  btnOutline: { borderRadius: radii.lg, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  btnOutlineText: { fontFamily: font.semibold, fontSize: 16 },
});
