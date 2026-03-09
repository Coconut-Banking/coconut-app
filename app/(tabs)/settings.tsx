import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useApiFetch } from "../../lib/api";
import { useGmail } from "../../hooks/useGmail";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const apiFetch = useApiFetch();
  const gmail = useGmail(apiFetch);

  const handleDisconnect = () => {
    Alert.alert("Disconnect Gmail", "This will remove your Gmail connection and all scanned receipts.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: gmail.disconnect },
    ]);
  };

  const handleReconnect = async () => {
    await gmail.disconnect();
    await gmail.connect();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Gmail Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Email Receipts</Text>
        <Text style={styles.sectionSubtitle}>
          Connect Gmail to automatically find purchase receipts and match them to your transactions.
        </Text>

        <View style={styles.card}>
          {gmail.loading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator size="small" color="#3D8E62" />
              <Text style={styles.loadingText}>Checking connection...</Text>
            </View>
          ) : !gmail.connected ? (
            <View style={styles.centerPad}>
              <View style={styles.iconCircle}>
                <Ionicons name="mail-outline" size={24} color="#9CA3AF" />
              </View>
              <Text style={styles.emptyTitle}>No email connected</Text>
              <Text style={styles.emptySubtitle}>
                Connect Gmail to find itemized receipts from Amazon, Walmart, and more.
              </Text>
              <TouchableOpacity style={styles.connectBtn} onPress={gmail.connect}>
                <Ionicons name="logo-google" size={16} color="#fff" />
                <Text style={styles.connectBtnText}>Connect Gmail</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.connectedRow}>
                <View style={styles.gmailIcon}>
                  <Ionicons name="mail" size={18} color="#3D8E62" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gmailEmail}>{gmail.email || "Gmail"}</Text>
                  <Text style={styles.gmailMeta}>
                    {gmail.lastScan
                      ? `Last scanned ${new Date(gmail.lastScan).toLocaleDateString()}`
                      : "Not yet scanned"}
                  </Text>
                </View>
                <View style={styles.connectedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#3D8E62" />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, gmail.scanning && styles.actionBtnDisabled]}
                  onPress={gmail.scan}
                  disabled={gmail.scanning}
                >
                  {gmail.scanning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="scan" size={16} color="#fff" />
                  )}
                  <Text style={styles.actionBtnText}>
                    {gmail.scanning ? "Scanning..." : "Scan for receipts"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.viewReceiptsBtn}
                  onPress={() => router.push("/email-receipts")}
                >
                  <Text style={styles.viewReceiptsText}>View receipts</Text>
                  <Ionicons name="chevron-forward" size={16} color="#3D8E62" />
                </TouchableOpacity>
              </View>

              {gmail.tokenError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    Gmail access has expired. Please reconnect.
                  </Text>
                  <TouchableOpacity style={styles.reconnectBtn} onPress={handleReconnect}>
                    <Text style={styles.reconnectText}>Reconnect Gmail</Text>
                  </TouchableOpacity>
                </View>
              )}

              {gmail.scanResult && (
                <View style={styles.resultBox}>
                  <Ionicons name="checkmark-circle" size={16} color="#3D8E62" />
                  <Text style={styles.resultText}>
                    Found {gmail.scanResult.scanned} receipt{gmail.scanResult.scanned !== 1 ? "s" : ""},
                    matched {gmail.scanResult.matched} to transactions.
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
                <Text style={styles.disconnectText}>Disconnect Gmail</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Privacy Note */}
      <View style={styles.privacyBox}>
        <Ionicons name="shield-checkmark" size={16} color="#3D8E62" />
        <Text style={styles.privacyText}>
          Coconut only reads receipt emails from known retailers. We never access personal messages, drafts, or sent mail.
        </Text>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => {
              Alert.alert("Sign Out", "Are you sure you want to sign out?", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign Out", style: "destructive", onPress: () => signOut() },
              ]);
            }}
          >
            <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            <Text style={[styles.menuText, { color: "#DC2626" }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAF8" },
  scrollContent: { padding: 20, paddingBottom: 60 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    paddingTop: 8,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: "#6B7280", marginBottom: 14, lineHeight: 18 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  centerPad: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 24 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#374151", marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: "#9CA3AF", textAlign: "center", marginBottom: 20, lineHeight: 18 },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#3D8E62",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  connectBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  gmailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF7F2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  gmailEmail: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  gmailMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  connectedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  connectedText: { fontSize: 12, color: "#3D8E62", fontWeight: "500" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#3D8E62",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  viewReceiptsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  viewReceiptsText: { color: "#3D8E62", fontWeight: "600", fontSize: 14 },
  errorBox: {
    margin: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 14,
  },
  errorText: { fontSize: 13, color: "#B91C1C", marginBottom: 10 },
  reconnectBtn: {
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  reconnectText: { fontSize: 12, fontWeight: "600", color: "#DC2626" },
  resultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    marginTop: 0,
    backgroundColor: "#EEF7F2",
    borderWidth: 1,
    borderColor: "#C3E0D3",
    borderRadius: 12,
    padding: 14,
  },
  resultText: { fontSize: 13, color: "#2D5A44", flex: 1 },
  disconnectBtn: {
    padding: 16,
    alignItems: "center",
  },
  disconnectText: { fontSize: 13, color: "#DC2626", fontWeight: "500" },
  privacyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#EEF7F2",
    borderWidth: 1,
    borderColor: "#C3E0D3",
    borderRadius: 16,
    padding: 16,
    marginBottom: 28,
  },
  privacyText: { fontSize: 13, color: "#2D5A44", flex: 1, lineHeight: 18 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  menuText: { fontSize: 15, fontWeight: "500" },
  loadingText: { fontSize: 13, color: "#6B7280", marginTop: 8 },
});
