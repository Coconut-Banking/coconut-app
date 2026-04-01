import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApiFetch } from "../../lib/api";
import { useReceiptSplit, type Step } from "../../hooks/useReceiptSplit";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "assign", label: "Assign" },
  { key: "summary", label: "Summary" },
];

const PERSON_COLORS = [
  "#3D8E62",
  "#4A6CF7",
  "#E8507A",
  "#F59E0B",
  "#10A37F",
  "#FF5A5F",
  "#9B59B6",
  "#00674B",
];

function personColor(index: number) {
  return PERSON_COLORS[index % PERSON_COLORS.length];
}

type Contact = {
  displayName: string;
  email: string | null;
  groupId: string;
  groupName: string;
  memberId: string;
  memberCount: number;
  hasAccount: boolean;
};

export default function ReceiptScreen() {
  const apiFetch = useApiFetch();
  const rs = useReceiptSplit(apiFetch);
  const currentStepIndex = STEPS.findIndex((s) => s.key === rs.step);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="receipt-outline" size={24} color="#3D8E62" />
          </View>
          <View>
            <Text style={styles.title}>Split Receipt</Text>
            <Text style={styles.subtitle}>
              Scan a receipt and split items with friends
            </Text>
          </View>
        </View>

        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          {STEPS.map((s, i) => (
            <View key={s.key} style={styles.stepItem}>
              <View
                style={[
                  styles.stepBadge,
                  i < currentStepIndex && styles.stepBadgeDone,
                  i === currentStepIndex && styles.stepBadgeActive,
                  i > currentStepIndex && styles.stepBadgePending,
                ]}
              >
                {i < currentStepIndex ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.stepBadgeText,
                      i === currentStepIndex && styles.stepBadgeTextActive,
                    ]}
                  >
                    {i + 1}
                  </Text>
                )}
                <Text
                  style={[
                    styles.stepLabel,
                    i === currentStepIndex && styles.stepLabelActive,
                    i > currentStepIndex && styles.stepLabelPending,
                  ]}
                >
                  {s.label}
                </Text>
              </View>
              {i < STEPS.length - 1 && (
                <View
                  style={[
                    styles.stepConnector,
                    i < currentStepIndex && styles.stepConnectorDone,
                  ]}
                />
              )}
            </View>
          ))}
        </View>

        {/* Step content */}
        {rs.step === "upload" && (
          <UploadStep rs={rs} apiFetch={apiFetch} />
        )}
        {rs.step === "review" && <ReviewStep rs={rs} />}
        {rs.step === "assign" && <AssignStep rs={rs} apiFetch={apiFetch} />}
        {rs.step === "summary" && (
          <SummaryStep rs={rs} apiFetch={apiFetch} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ─────────────────── Step 1: Upload ─────────────────── */

function UploadStep({
  rs,
  apiFetch,
}: {
  rs: ReturnType<typeof useReceiptSplit>;
  apiFetch: (path: string, opts?: object) => Promise<Response>;
}) {
  const pickAndUpload = async (useCamera: boolean) => {
    if (useCamera) {
      const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (camStatus !== "granted") {
        Alert.alert("Permission needed", "Allow camera access to scan receipts.");
        return;
      }
    } else {
      const { status: libStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (libStatus !== "granted") {
        Alert.alert("Permission needed", "Allow access to photos to scan receipts.");
        return;
      }
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.85,
        });

    if (result.canceled) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;
    await rs.uploadReceipt(uri);
  };

  const pickPdfAndUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const doc = result.assets[0];
      if (!doc?.uri) return;
      await rs.uploadReceipt(doc.uri, {
        mimeType: doc.mimeType ?? "application/pdf",
        name: doc.name ?? "receipt.pdf",
      });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to pick PDF");
    }
  };

  if (rs.uploading) {
    const stageMessage =
      rs.uploadStage === "uploading"
        ? "Uploading image…"
        : rs.uploadStage === "reading"
        ? "Reading receipt…"
        : rs.uploadStage === "extracting"
        ? "Extracting items…"
        : "Cleaning up…";
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3D8E62" />
        <Text style={styles.hint}>{stageMessage}</Text>
      </View>
    );
  }

  if (rs.uploadError) {
    return (
      <View style={styles.errorBlock}>
        <Text style={styles.errorText}>{rs.uploadError}</Text>
        <TouchableOpacity style={styles.button} onPress={() => pickAndUpload(false)}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.uploadBlock}>
      <TouchableOpacity
        style={styles.uploadArea}
        onPress={() => pickAndUpload(false)}
        activeOpacity={0.8}
      >
        <View style={styles.uploadIcon}>
          <Ionicons name="camera" size={32} color="#3D8E62" />
        </View>
        <Text style={styles.uploadTitle}>Take or pick a photo</Text>
        <Text style={styles.uploadSubtitle}>
          PNG, JPG, or PDF — from camera, gallery, or files
        </Text>
      </TouchableOpacity>
      <View style={styles.uploadButtons}>
        <TouchableOpacity
          style={styles.cameraButton}
          onPress={() => pickAndUpload(true)}
        >
          <Ionicons name="camera" size={20} color="#3D8E62" />
          <Text style={styles.cameraButtonText}>Take photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pdfButton}
          onPress={pickPdfAndUpload}
        >
          <Ionicons name="document-text" size={20} color="#3D8E62" />
          <Text style={styles.cameraButtonText}>Pick PDF</Text>
        </TouchableOpacity>
      </View>
      {rs.imageUri && rs.isPdf && (
        <View style={styles.pdfPreview}>
          <Ionicons name="document-text" size={48} color="#3D8E62" />
          <Text style={styles.pdfPreviewText}>PDF receipt selected</Text>
        </View>
      )}
      {rs.imageUri && !rs.isPdf && (
        <Image
          source={{ uri: rs.imageUri }}
          style={styles.previewImage}
          resizeMode="contain"
        />
      )}
    </View>
  );
}

/* ─────────────────── Step 2: Review ─────────────────── */

function ReviewStep({ rs }: { rs: ReturnType<typeof useReceiptSplit> }) {
  const syncTotals = useCallback(() => {
    const total =
      Math.round((rs.editSubtotal + rs.editTax + rs.editTip) * 100) / 100;
    rs.setEditTotal(total);
  }, [rs.editSubtotal, rs.editTax, rs.editTip]);

  useEffect(() => {
    syncTotals();
  }, [rs.editSubtotal, rs.editTax, rs.editTip]);

  return (
    <View style={styles.reviewBlock}>
      <Text style={styles.fieldLabel}>Merchant</Text>
      <TextInput
        style={styles.input}
        value={rs.editMerchant}
        onChangeText={rs.setEditMerchant}
        placeholder="Restaurant name"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.fieldLabel}>Items</Text>
      <View style={styles.itemsList}>
        {rs.editItems.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.itemPrice}>
              ${item.totalPrice.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.totalsBlock}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <TextInput
            style={styles.totalInput}
            value={String(rs.editSubtotal)}
            onChangeText={(v) => {
              const n = Number(v) || 0;
              rs.setEditSubtotal(n);
            }}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tax</Text>
          <TextInput
            style={styles.totalInput}
            value={String(rs.editTax)}
            onChangeText={(v) => {
              const n = Number(v) || 0;
              rs.setEditTax(n);
            }}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tip</Text>
          <TextInput
            style={styles.totalInput}
            value={String(rs.editTip)}
            onChangeText={(v) => {
              const n = Number(v) || 0;
              rs.setEditTip(n);
            }}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={[styles.totalRow, styles.totalRowFinal]}>
          <Text style={styles.totalLabelBold}>Total</Text>
          <Text style={styles.totalFinal}>
            ${rs.editTotal.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => rs.setStep("upload")}
        >
          <Ionicons name="chevron-back" size={18} color="#6B7280" />
          <Text style={styles.navButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, rs.saving && styles.buttonDisabled]}
          onPress={rs.confirmItems}
          disabled={rs.saving || rs.editItems.length === 0}
        >
          {rs.saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
      {rs.confirmError && (
        <Text style={{ color: "red", marginTop: 8, textAlign: "center" }}>{rs.confirmError}</Text>
      )}
    </View>
  );
}

/* ─────────────────── Step 3: Assign ─────────────────── */

function AssignStep({
  rs,
  apiFetch,
}: {
  rs: ReturnType<typeof useReceiptSplit>;
  apiFetch: (path: string, opts?: any) => Promise<Response>;
}) {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    apiFetch("/api/groups/people")
      .then((r) => r.json())
      .then((d) => setContacts(d.people ?? []))
      .catch(() => {});
  }, [apiFetch]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts.slice(0, 6);
    return contacts
      .filter((c) => c.displayName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [contacts, search]);

  const handleAddFromContact = (c: Contact) => {
    rs.addPerson(c.displayName, {
      memberId: c.memberId,
      email: c.email,
      hasAccount: c.hasAccount,
    });
    setSearch("");
  };

  const handleAddNew = () => {
    const name = search.trim();
    if (!name) return;
    const match = contacts.find(
      (c) => c.displayName.toLowerCase() === name.toLowerCase()
    );
    if (match) {
      handleAddFromContact(match);
    } else {
      rs.addPerson(name, { hasAccount: false });
      setSearch("");
    }
  };

  const allAssigned = rs.itemsWithExtras.every(
    (item) => (rs.assignments.get(item.id) ?? []).length > 0
  );

  return (
    <View style={styles.assignBlock}>
      <Text style={styles.fieldLabel}>People at the table</Text>
      <View style={styles.peopleChips}>
        {rs.people.map((person, idx) => (
          <View
            key={person.name}
            style={[styles.personChip, { backgroundColor: personColor(idx) }]}
          >
            <Text style={styles.personChipText}>{person.name}</Text>
            {!person.hasAccount && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>Pending</Text>
              </View>
            )}
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => rs.removePerson(person.name)}
            >
              <Ionicons name="close" size={14} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
        ))}
        {rs.people.length === 0 && (
          <Text style={styles.hintSmall}>
            Search contacts or add people to assign items
          </Text>
        )}
      </View>

      <View style={styles.addPersonRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search contacts or type a name"
          placeholderTextColor="#9CA3AF"
          onSubmitEditing={handleAddNew}
        />
        <TouchableOpacity
          style={[styles.addButton, !search.trim() && styles.addButtonDisabled]}
          onPress={handleAddNew}
          disabled={!search.trim()}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {filteredContacts.length > 0 && search.length > 0 && (
        <View style={styles.contactsDropdown}>
          {filteredContacts.map((c) => (
            <TouchableOpacity
              key={`${c.groupId}-${c.memberId}`}
              style={styles.contactRow}
              onPress={() => handleAddFromContact(c)}
            >
              <Text style={styles.contactName}>{c.displayName}</Text>
              {c.email ? (
                <Text style={styles.contactEmail} numberOfLines={1}>
                  {c.email}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
          {search.trim() &&
            !contacts.some(
              (c) =>
                c.displayName.toLowerCase() === search.trim().toLowerCase()
            ) && (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => {
                  rs.addPerson(search.trim(), { hasAccount: false });
                  setSearch("");
                }}
              >
                <Ionicons name="person-add-outline" size={16} color="#3D8E62" />
                <Text style={styles.addNewText}>
                  Add &quot;{search.trim()}&quot; (pending invite)
                </Text>
              </TouchableOpacity>
            )}
        </View>
      )}

      {rs.people.length > 0 && (
        <View style={styles.assignItemsBlock}>
          <Text style={styles.fieldLabel}>Assign each item</Text>
          {rs.itemsWithExtras.map((item) => {
            const assigned = rs.assignments.get(item.id) ?? [];
            return (
              <View key={item.id} style={styles.assignItemCard}>
                <View style={styles.assignItemHeader}>
                  <View style={styles.assignItemInfo}>
                    <Text style={styles.assignItemName}>{item.name}</Text>
                    <Text style={styles.assignItemPrice}>
                      ${item.totalPrice.toFixed(2)} + $
                      {item.proportionalExtra.toFixed(2)} tax/tip ={" "}
                      <Text style={styles.assignItemFinal}>
                        ${item.finalPrice.toFixed(2)}
                      </Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.everyoneButton}
                    onPress={() => rs.assignAll(item.id)}
                  >
                    <Ionicons name="people" size={14} color="#3D8E62" />
                    <Text style={styles.everyoneButtonText}>Everyone</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.assigneeChips}>
                  {rs.people.map((person, pIdx) => {
                    const isAssigned = assigned.some(
                      (a) =>
                        a.name.toLowerCase() === person.name.toLowerCase()
                    );
                    return (
                      <TouchableOpacity
                        key={person.name}
                        style={[
                          styles.assigneeChip,
                          isAssigned && {
                            backgroundColor: personColor(pIdx),
                          },
                          !isAssigned && styles.assigneeChipInactive,
                        ]}
                        onPress={() => rs.toggleAssignment(item.id, person)}
                      >
                        <Text
                          style={[
                            styles.assigneeChipText,
                            isAssigned && styles.assigneeChipTextActive,
                          ]}
                        >
                          {person.name}
                          {isAssigned && assigned.length > 1 && ` $${(item.finalPrice / assigned.length).toFixed(2)}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => rs.setStep("review")}
        >
          <Ionicons name="chevron-back" size={18} color="#6B7280" />
          <Text style={styles.navButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!allAssigned || rs.people.length === 0 || rs.saving) &&
              styles.buttonDisabled,
          ]}
          onPress={async () => {
            await rs.saveAssignments();
            rs.computeSummary();
          }}
          disabled={!allAssigned || rs.people.length === 0 || rs.saving}
        >
          {rs.saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>View Summary</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ─────────────────── Step 4: Summary ─────────────────── */

function SummaryStep({
  rs,
  apiFetch,
}: {
  rs: ReturnType<typeof useReceiptSplit>;
  apiFetch: (path: string, opts?: any) => Promise<Response>;
}) {
  const grandTotal = rs.personShares.reduce((s, p) => s + p.totalOwed, 0);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [groupBalances, setGroupBalances] = useState<
    Array<{ memberId: string; name: string; total: number }>
  >([]);
  const [suggestions, setSuggestions] = useState<
    Array<{
      fromMemberId: string;
      toMemberId: string;
      fromName: string;
      toName: string;
      amount: number;
    }>
  >([]);
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<
    Array<{ id: string; displayName: string; email: string | null }>
  >([]);
  const [requestingPayment, setRequestingPayment] = useState<string | null>(null);
  const [recordedSettlements, setRecordedSettlements] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    apiFetch("/api/groups")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.groups ?? [];
        setGroups(list);
        if (list.length === 1) setSelectedGroupId(list[0].id);
      })
      .catch(() => {});
  }, [apiFetch]);

  const handleFinish = async (opts?: {
    stayForSettle?: boolean;
    groupId?: string;
  }) => {
    const groupId = opts?.groupId ?? selectedGroupId;
    if (!groupId || !rs.receiptId) return;

    setFinishing(true);
    try {
      const res = await apiFetch(`/api/receipt/${rs.receiptId}/finish`, {
        method: "POST",
        body: {
          groupId,
          people: rs.people.map((p) => ({ name: p.name, email: p.email })),
        },
      });
      const data = await res.json();

      if (res.ok) {
        setFinished(true);
        setGroupBalances(data.balances || []);
        setSuggestions(data.suggestions || []);
        setGroupName(data.groupName || "");
        setMembers(data.members || []);
      } else {
        Alert.alert("Error", data.error || "Failed to save to group");
        setFinishing(false);
      }
    } catch {
      Alert.alert("Error", "Failed to save to group");
      setFinishing(false);
    }
  };

  const handleSettleNowNoGroup = async () => {
    if (!rs.receiptId) return;
    setFinishing(true);
    try {
      const createRes = await apiFetch("/api/groups", {
        method: "POST",
        body: {
          name: rs.editMerchant ? `${rs.editMerchant} split` : "New group",
          ownerDisplayName: "You",
        },
      });
      const groupData = await createRes.json();
      if (!createRes.ok || !groupData.id) {
        Alert.alert(
          "Error",
          (groupData as { error?: string }).error ?? "Failed to create group"
        );
        setFinishing(false);
        return;
      }
      setGroups((prev) => [
        ...prev,
        { id: groupData.id, name: (groupData as { name?: string }).name || "New group" },
      ]);
      setSelectedGroupId(groupData.id);
      await handleFinish({ stayForSettle: true, groupId: groupData.id });
    } catch {
      Alert.alert("Error", "Failed to create group");
      setFinishing(false);
    }
  };

  const handleRequestPayment = async (s: (typeof suggestions)[0]) => {
    const key = `${s.fromMemberId}-${s.toMemberId}`;
    setRequestingPayment(key);
    try {
      const res = await apiFetch("/api/stripe/create-payment-link", {
        method: "POST",
        body: {
          amount: s.amount,
          description: `${rs.editMerchant || "Receipt"} split`,
          recipientName: s.fromName,
          groupId: selectedGroupId,
          payerMemberId: s.fromMemberId,
          receiverMemberId: s.toMemberId,
        },
      });
      const data = await res.json();
      if (res.ok && data.url) {
        await Share.share({
          message: `You owe me $${s.amount.toFixed(2)} for ${groupName || "our receipt split"}. Pay here: ${data.url}`,
          url: data.url,
          title: "Payment request",
        });
      } else {
        const payer = members.find((m) => m.id === s.fromMemberId);
        if (payer?.email) {
          const subject = encodeURIComponent(
            `Payment request: $${s.amount.toFixed(2)} for ${groupName || "receipt split"}`
          );
          const body = encodeURIComponent(
            `Hey!\n\nYou owe me $${s.amount.toFixed(2)} for ${groupName || "our receipt split"}.\n\nPlease pay via Venmo, Cash App, Zelle, or another method.\n\nThanks!`
          );
          Linking.openURL(
            `mailto:${payer.email}?subject=${subject}&body=${body}`
          );
        } else {
          Alert.alert(
            "No email",
            "Add their email in the group to send a payment request."
          );
        }
      }
    } finally {
      setRequestingPayment(null);
    }
  };

  const handleRecordCash = async (s: (typeof suggestions)[0]) => {
    const key = `${s.fromMemberId}-${s.toMemberId}`;
    try {
      const res = await apiFetch("/api/settlements", {
        method: "POST",
        body: {
          groupId: selectedGroupId,
          payerMemberId: s.fromMemberId,
          receiverMemberId: s.toMemberId,
          amount: s.amount,
          method: "in_person",
        },
      });
      if (res.ok) {
        setRecordedSettlements((prev) => new Set(prev).add(key));
      } else {
        const data = await res.json();
        Alert.alert("Error", (data as { error?: string }).error ?? "Could not record");
      }
    } catch {
      Alert.alert("Error", "Could not record payment");
    }
  };

  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.summaryHeader}>
        {rs.editMerchant ? (
          <>
            <Text style={styles.summaryMerchant}>{rs.editMerchant}</Text>
            {" — "}
          </>
        ) : null}
        ${grandTotal.toFixed(2)} total
      </Text>

      <View style={styles.sharesList}>
        {rs.personShares.map((person, idx) => (
          <View key={person.name} style={styles.shareCard}>
            <View style={styles.shareHeader}>
              <View
                style={[
                  styles.shareAvatar,
                  { backgroundColor: personColor(idx) },
                ]}
              >
                <Text style={styles.shareAvatarText}>
                  {person.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.shareName}>{person.name}</Text>
              <Text style={styles.shareTotal}>
                ${person.totalOwed.toFixed(2)}
              </Text>
            </View>
            <View style={styles.shareItems}>
              {person.items.map((item, iIdx) => (
                <View key={iIdx} style={styles.shareItemRow}>
                  <Text style={styles.shareItemName}>{item.itemName}</Text>
                  <Text style={styles.shareItemAmount}>
                    ${item.shareAmount.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {!finished && (
        <View style={styles.summaryActions}>
          <Text style={styles.fieldLabel}>What do you want to do?</Text>

          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>Settle now</Text>
            <Text style={styles.actionSubtitle}>
              {groups.length > 0
                ? "Save to a group, then share a payment link or mark as paid in person."
                : "Create a group, save this split, and settle right away."}
            </Text>
            {groups.length > 1 && (
              <View style={styles.pickerWrapper}>
                <Text style={styles.pickerLabel}>Group</Text>
                <View style={styles.pickerRow}>
                  {groups.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.groupChip,
                        selectedGroupId === g.id && styles.groupChipSelected,
                      ]}
                      onPress={() => setSelectedGroupId(g.id)}
                    >
                      <Text
                        style={[
                          styles.groupChipText,
                          selectedGroupId === g.id &&
                            styles.groupChipTextSelected,
                        ]}
                      >
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.fullButton,
                styles.primaryButton,
                finishing && styles.buttonDisabled,
              ]}
              onPress={() =>
                groups.length > 0
                  ? handleFinish({ stayForSettle: true })
                  : handleSettleNowNoGroup()
              }
              disabled={finishing}
            >
              {finishing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.fullButtonText}>Save & settle</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>Add to shared expenses</Text>
            <Text style={styles.actionSubtitle}>
              {groups.length > 0
                ? "Track in a group. Settle later."
                : "Create a group to track this split."}
            </Text>
            {groups.length > 0 ? (
              <TouchableOpacity
                style={[
                  styles.fullButton,
                  styles.secondaryButton,
                  (!selectedGroupId || finishing) && styles.buttonDisabled,
                ]}
                onPress={() => handleFinish()}
                disabled={!selectedGroupId || finishing}
              >
                <Ionicons name="people" size={20} color="#3D8E62" />
                <Text style={styles.secondaryButtonText}>Add to group</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.fullButton, styles.secondaryButton]}
                onPress={() => router.replace("/(tabs)/shared")}
              >
                <Ionicons name="people" size={20} color="#3D8E62" />
                <Text style={styles.secondaryButtonText}>Create group</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {finished && (
        <View style={styles.finishedBlock}>
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={24} color="#059669" />
            <Text style={styles.successTitle}>
              Receipt added to group expenses!
            </Text>
          </View>

          {groupBalances.length > 0 && (
            <View style={styles.balancesBlock}>
              <Text style={styles.fieldLabel}>Updated group balances</Text>
              {groupBalances.map((b) => (
                <View key={b.memberId} style={styles.balanceRow}>
                  <Text style={styles.balanceName}>{b.name}</Text>
                  <Text
                    style={[
                      styles.balanceAmount,
                      b.total > 0
                        ? styles.balancePositive
                        : Math.abs(b.total) > 0.01
                        ? styles.balanceNegative
                        : styles.balanceZero,
                    ]}
                  >
                    {b.total > 0 ? "+" : Math.abs(b.total) > 0.01 ? "-" : ""}$
                    {Math.abs(b.total).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {suggestions.length > 0 && (
            <View style={styles.suggestionsBlock}>
              <Text style={styles.fieldLabel}>Who owes whom — settle now</Text>
              {suggestions
                .filter(
                  (s) =>
                    !recordedSettlements.has(
                      `${s.fromMemberId}-${s.toMemberId}`
                    )
                )
                .map((s, idx) => (
                  <View key={idx} style={styles.suggestionRow}>
                    <Text style={styles.suggestionText}>
                      <Text style={styles.suggestionName}>{s.fromName}</Text>
                      {" → "}
                      <Text style={styles.suggestionName}>{s.toName}</Text>
                      <Text style={styles.suggestionAmount}>
                        {" "}
                        ${s.amount.toFixed(2)}
                      </Text>
                    </Text>
                    <View style={styles.suggestionButtons}>
                      <TouchableOpacity
                        style={styles.suggestionBtn}
                        onPress={() => handleRecordCash(s)}
                      >
                        <Text style={styles.suggestionBtnText}>
                          Paid in person
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.suggestionBtn, styles.suggestionBtnPrimary]}
                        onPress={() => handleRequestPayment(s)}
                        disabled={requestingPayment !== null}
                      >
                        {requestingPayment ===
                        `${s.fromMemberId}-${s.toMemberId}` ? (
                          <ActivityIndicator size="small" color="#3D8E62" />
                        ) : (
                          <>
                            <Ionicons name="send" size={12} color="#3D8E62" />
                            <Text
                              style={styles.suggestionBtnTextPrimary}
                            >
                              Share link
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
            </View>
          )}

          <View style={styles.finishedNav}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace("/(tabs)/shared")}
            >
              <Text style={styles.primaryButtonText}>View all expenses</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={rs.reset}
            >
              <Text style={styles.secondaryButtonText}>New receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => rs.setStep("assign")}
          disabled={finishing || finished}
        >
          <Ionicons name="chevron-back" size={18} color="#6B7280" />
          <Text style={styles.navButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navButton}
          onPress={rs.reset}
          disabled={finishing}
        >
          <Ionicons name="refresh" size={18} color="#6B7280" />
          <Text style={styles.navButtonText}>New receipt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingBottom: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EEF7F2",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "700", color: "#1F2937" },
  subtitle: { fontSize: 14, color: "#6B7280" },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
  },
  stepItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  stepBadgeDone: { backgroundColor: "#EEF7F2" },
  stepBadgeActive: { backgroundColor: "#3D8E62" },
  stepBadgePending: { backgroundColor: "#F3F4F6" },
  stepBadgeText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  stepBadgeTextActive: { color: "#fff" },
  stepLabel: { fontSize: 11, fontWeight: "600", color: "#3D8E62" },
  stepLabelActive: { color: "#fff" },
  stepLabelPending: { color: "#9CA3AF" },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 4,
  },
  stepConnectorDone: { backgroundColor: "#3D8E62" },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  hint: { fontSize: 14, color: "#6B7280", marginTop: 12 },
  hintSmall: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  errorBlock: { marginTop: 16 },
  errorText: { fontSize: 15, color: "#DC2626", marginBottom: 16 },
  button: {
    backgroundColor: "#3D8E62",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  uploadBlock: { gap: 16 },
  uploadArea: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  uploadIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "#EEF7F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  uploadTitle: { fontSize: 16, fontWeight: "600", color: "#374151" },
  uploadSubtitle: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  uploadButtons: { flexDirection: "row", gap: 12 },
  cameraButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  pdfButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  cameraButtonText: { fontSize: 15, fontWeight: "600", color: "#3D8E62" },
  pdfPreview: {
    height: 200,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  pdfPreviewText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  reviewBlock: { gap: 16 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: "#1F2937",
  },
  itemsList: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  itemName: { fontSize: 14, color: "#374151", flex: 1 },
  itemPrice: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  totalsBlock: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalRowFinal: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: { fontSize: 14, color: "#6B7280" },
  totalLabelBold: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  totalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: "#1F2937",
    width: 90,
    textAlign: "right",
  },
  totalFinal: { fontSize: 16, fontWeight: "700", color: "#1F2937" },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    paddingTop: 16,
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  navButtonText: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#3D8E62",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  assignBlock: { gap: 16 },
  peopleChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  personChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  personChipText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  pendingBadge: {
    backgroundColor: "rgba(255,255,255,0.3)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pendingBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  addPersonRow: { flexDirection: "row", gap: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F2937",
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#3D8E62",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: { opacity: 0.5 },
  contactsDropdown: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    gap: 8,
  },
  contactName: { fontSize: 15, fontWeight: "500", color: "#1F2937", flex: 1 },
  contactEmail: { fontSize: 12, color: "#6B7280", flex: 1 },
  addNewText: { fontSize: 14, color: "#3D8E62", fontWeight: "500" },
  assignItemsBlock: { gap: 12 },
  assignItemCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  assignItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  assignItemInfo: { flex: 1 },
  assignItemName: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  assignItemPrice: { fontSize: 12, color: "#6B7280", marginTop: 4 },
  assignItemFinal: { fontWeight: "600", color: "#374151" },
  everyoneButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  everyoneButtonText: { fontSize: 12, color: "#3D8E62", fontWeight: "600" },
  assigneeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  assigneeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  assigneeChipInactive: {
    backgroundColor: "#E5E7EB",
  },
  assigneeChipText: { fontSize: 13, fontWeight: "500", color: "#6B7280" },
  assigneeChipTextActive: { color: "#fff" },
  summaryBlock: { gap: 20 },
  summaryHeader: { fontSize: 14, color: "#6B7280" },
  summaryMerchant: { fontWeight: "600", color: "#1F2937" },
  sharesList: { gap: 12 },
  shareCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  shareHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.02)",
    gap: 10,
  },
  shareAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  shareAvatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  shareName: { fontSize: 15, fontWeight: "600", color: "#1F2937", flex: 1 },
  shareTotal: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  shareItems: { paddingHorizontal: 14, paddingBottom: 12, gap: 4 },
  shareItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  shareItemName: { fontSize: 12, color: "#6B7280" },
  shareItemAmount: { fontSize: 12, fontWeight: "500", color: "#374151" },
  summaryActions: { gap: 16 },
  actionCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  actionTitle: { fontSize: 15, fontWeight: "600", color: "#1F2937" },
  actionSubtitle: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  pickerWrapper: { gap: 8 },
  pickerLabel: { fontSize: 12, color: "#6B7280" },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  groupChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  groupChipSelected: { backgroundColor: "#EEF7F2" },
  groupChipText: { fontSize: 14, color: "#6B7280", fontWeight: "500" },
  groupChipTextSelected: { color: "#3D8E62", fontWeight: "600" },
  fullButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  fullButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#3D8E62",
  },
  secondaryButtonText: { color: "#3D8E62", fontWeight: "600", fontSize: 15 },
  finishedBlock: { gap: 20 },
  successCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ECFDF5",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  successTitle: { fontSize: 15, fontWeight: "600", color: "#065F46" },
  balancesBlock: { gap: 8 },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
  },
  balanceName: { fontSize: 14, fontWeight: "500", color: "#374151" },
  balanceAmount: { fontSize: 14, fontWeight: "600" },
  balancePositive: { color: "#059669" },
  balanceNegative: { color: "#DC2626" },
  balanceZero: { color: "#9CA3AF" },
  suggestionsBlock: { gap: 12 },
  suggestionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  suggestionText: { fontSize: 13, color: "#374151", flex: 1 },
  suggestionName: { fontWeight: "600" },
  suggestionAmount: { fontWeight: "600", color: "#059669" },
  suggestionButtons: { flexDirection: "row", gap: 8 },
  suggestionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  suggestionBtnPrimary: {
    borderColor: "#3D8E62",
    backgroundColor: "#EEF7F2",
  },
  suggestionBtnText: { fontSize: 12, fontWeight: "500", color: "#6B7280" },
  suggestionBtnTextPrimary: { color: "#3D8E62", fontWeight: "600" },
  finishedNav: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
});
