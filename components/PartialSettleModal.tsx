import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { font, radii, colors } from "../lib/theme";

type Props = {
  visible: boolean;
  maxAmount: number;
  currency: string;
  fromName: string;
  toName: string;
  loading?: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
};

function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? "$";
  } catch {
    return "$";
  }
}

export function PartialSettleModal({
  visible,
  maxAmount,
  currency,
  fromName,
  toName,
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const [amountText, setAmountText] = useState(maxAmount.toFixed(2));
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setAmountText(maxAmount.toFixed(2));
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible, maxAmount]);

  const parsed = parseFloat(amountText);
  const isValid = !isNaN(parsed) && parsed > 0 && parsed <= maxAmount;
  const isFull = isValid && Math.abs(parsed - maxAmount) < 0.005;
  const symbol = getCurrencySymbol(currency);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={st.overlay} onPress={onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={st.center}
        >
          <Pressable style={st.card} onPress={(e) => e.stopPropagation()}>
            <View style={st.icon}>
              <Ionicons name="wallet-outline" size={36} color={colors.primary} />
            </View>

            <Text style={st.title}>Record payment</Text>
            <Text style={st.sub}>
              <Text style={st.bold}>{fromName}</Text> pays <Text style={st.bold}>{toName}</Text>
            </Text>

            <View style={st.amountRow}>
              <Text style={st.symbol}>{symbol}</Text>
              <TextInput
                ref={inputRef}
                style={st.amountInput}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={() => { if (isValid) onConfirm(parsed); }}
              />
            </View>

            <Text style={st.hint}>
              {isValid
                ? isFull
                  ? "Full balance"
                  : `Partial — ${symbol}${(maxAmount - parsed).toFixed(2)} will remain`
                : parsed > maxAmount
                  ? `Max is ${symbol}${maxAmount.toFixed(2)}`
                  : "Enter a valid amount"}
            </Text>

            <TouchableOpacity
              style={[st.confirmBtn, !isValid && st.disabled]}
              onPress={() => { if (isValid) onConfirm(parsed); }}
              disabled={!isValid || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#fff" />
                  <Text style={st.confirmBtnText}>
                    {isFull ? "Settle full amount" : `Pay ${symbol}${parsed.toFixed(2)}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={st.dismiss} onPress={onCancel}>
              <Text style={st.dismissText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  center: { width: "100%", alignItems: "center" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginHorizontal: 32,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",
    width: "85%",
    maxWidth: 360,
  },
  icon: { marginBottom: 12 },
  title: {
    fontFamily: font.black,
    fontSize: 20,
    color: "#1F2328",
    marginBottom: 6,
    textAlign: "center",
  },
  sub: {
    fontFamily: font.regular,
    fontSize: 14,
    color: "#7A8088",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  bold: { fontFamily: font.semibold, color: "#1F2328" },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    gap: 4,
  },
  symbol: {
    fontFamily: font.bold,
    fontSize: 32,
    color: "#1F2328",
  },
  amountInput: {
    fontFamily: font.bold,
    fontSize: 32,
    color: "#1F2328",
    textAlign: "center",
    minWidth: 100,
    paddingVertical: 4,
    borderBottomWidth: 2,
    borderBottomColor: "#E3DBD8",
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 13,
    color: "#9AA0A6",
    marginBottom: 20,
    textAlign: "center",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radii.md,
    width: "100%",
    marginBottom: 10,
  },
  confirmBtnText: { fontFamily: font.bold, fontSize: 15, color: "#fff" },
  disabled: { opacity: 0.45 },
  dismiss: { paddingVertical: 10 },
  dismissText: { fontFamily: font.semibold, fontSize: 15, color: "#7A8088" },
});
