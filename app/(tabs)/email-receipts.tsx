import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApiFetch } from "../../lib/api";

interface LineItem {
  name: string;
  quantity: number;
  price: number;
  unit_price?: number;
  total?: number;
}

interface EmailReceipt {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  currency: string;
  line_items?: LineItem[];
  raw_subject: string;
  raw_from: string;
}

export default function EmailReceiptsScreen() {
  const apiFetch = useApiFetch();
  const [receipts, setReceipts] = useState<EmailReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EmailReceipt | null>(null);

  const fetchReceipts = useCallback(async () => {
    try {
      const res = await apiFetch("/api/email-receipts");
      if (res.ok) {
        const data = await res.json();
        setReceipts(data.receipts ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  const filtered = search.trim()
    ? receipts.filter(
        (r) =>
          r.merchant?.toLowerCase().includes(search.toLowerCase()) ||
          r.raw_subject?.toLowerCase().includes(search.toLowerCase())
      )
    : receipts;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#3D8E62" />
        <Text style={styles.loadingText}>Loading receipts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.title}>Email Receipts</Text>
          <View style={{ width: 24 }} />
        </View>

        {receipts.length > 0 && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search receipts..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={36} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyTitle}>
              {search ? "No matching receipts" : "No receipts yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search
                ? "Try a different search term."
                : "Connect Gmail in Settings and scan for receipts."}
            </Text>
            {!search && (
              <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push("/settings")}>
                <Text style={styles.settingsBtnText}>Go to Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.receiptList}>
            {filtered.map((receipt) => (
              <TouchableOpacity
                key={receipt.id}
                style={styles.receiptRow}
                onPress={() => setSelected(receipt)}
                activeOpacity={0.7}
              >
                <View style={styles.receiptIcon}>
                  <Ionicons name="receipt" size={18} color="#3D8E62" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.receiptMerchant} numberOfLines={1}>
                    {receipt.merchant || "Unknown"}
                  </Text>
                  <Text style={styles.receiptDate}>
                    {new Date(receipt.date).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.receiptAmount}>
                  ${receipt.amount?.toFixed(2) ?? "0.00"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Receipt Detail Modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Receipt Details</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.detailMerchant}>{selected.merchant || "Unknown"}</Text>
              <Text style={styles.detailAmount}>${selected.amount?.toFixed(2)}</Text>
              <Text style={styles.detailMeta}>
                {new Date(selected.date).toLocaleDateString()} · {selected.raw_from}
              </Text>

              {selected.line_items && selected.line_items.length > 0 && (
                <View style={styles.itemsSection}>
                  <Text style={styles.itemsTitle}>Items</Text>
                  {selected.line_items.map((item, idx) => {
                    const price = item.unit_price || item.price || item.total || 0;
                    const quantity = item.quantity || 1;
                    const total = item.total || price * quantity || 0;

                    return (
                      <View key={idx} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemQty}>Qty: {quantity}</Text>
                        </View>
                        <Text style={styles.itemPrice}>${total.toFixed(2)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.subjectBox}>
                <Text style={styles.subjectLabel}>Email subject</Text>
                <Text style={styles.subjectText}>{selected.raw_subject}</Text>
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7FAF8" },
  center: { justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingTop: 8,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#1F2937" },
  receiptList: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  receiptIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF7F2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  receiptMerchant: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  receiptDate: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  receiptAmount: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  emptyContainer: { alignItems: "center", paddingVertical: 48 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#374151" },
  emptySubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  settingsBtn: {
    backgroundColor: "#3D8E62",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  settingsBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  loadingText: { fontSize: 14, color: "#6B7280", marginTop: 12 },
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: "#F7FAF8" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  modalTitle: { fontSize: 17, fontWeight: "600", color: "#1F2937" },
  modalContent: { padding: 20 },
  detailMerchant: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  detailAmount: { fontSize: 28, fontWeight: "700", color: "#3D8E62", marginTop: 4 },
  detailMeta: { fontSize: 13, color: "#6B7280", marginTop: 6, marginBottom: 24 },
  itemsSection: { marginBottom: 24 },
  itemsTitle: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 10 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  itemName: { fontSize: 14, color: "#1F2937" },
  itemQty: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  subjectBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },
  subjectLabel: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  subjectText: { fontSize: 14, color: "#1F2937" },
});
