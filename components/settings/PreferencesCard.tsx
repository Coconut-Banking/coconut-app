import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import type { ThemeMode } from "../../lib/colors";
import { useBiometricLock } from "../../lib/biometric-lock-context";
import { authenticate, getBiometricLabel } from "../../lib/biometric-lock";
import {
  useCurrency,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
} from "../../hooks/useCurrency";
import { font, radii } from "../../lib/theme";
import { settingsStyles as s } from "./styles";

const APPEARANCE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "System" },
];

export function PreferencesCard() {
  const { theme, mode, setMode } = useTheme();
  const {
    biometricAvailable,
    biometricType,
    enabled: biometricEnabled,
    setEnabled: setBiometricEnabled,
  } = useBiometricLock();
  const biometricLabel = getBiometricLabel(biometricType);
  const {
    currencyCode,
    symbol: currencySymbol,
    flag: currencyFlag,
    setCurrency,
  } = useCurrency();
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.cardBorder },
      ]}
    >
      <Text style={[s.sectionTitle, { color: theme.text }]}>Preferences</Text>

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        Appearance
      </Text>
      <View style={styles.segmentRow}>
        {APPEARANCE_OPTIONS.map((opt) => {
          const selected = mode === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.segment,
                {
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected
                    ? theme.primaryLight
                    : theme.surfaceSecondary,
                },
              ]}
              onPress={() => setMode(opt.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color: selected ? theme.text : theme.textSecondary,
                    fontFamily: selected ? font.semibold : font.medium,
                  },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {biometricAvailable ? (
        <View style={[styles.biometricRow, { borderTopColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.fieldLabel,
                { color: theme.textSecondary, marginBottom: 0 },
              ]}
            >
              App lock
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: font.regular,
                color: theme.textTertiary,
                marginTop: 2,
              }}
            >
              Require {biometricLabel} to open Coconut
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.biometricToggle,
              {
                backgroundColor: biometricEnabled
                  ? theme.primary
                  : theme.surfaceSecondary,
                borderColor: biometricEnabled ? theme.primary : theme.border,
              },
            ]}
            onPress={async () => {
              if (biometricEnabled) {
                setBiometricEnabled(false);
              } else {
                const result = await authenticate(
                  `Verify ${biometricLabel} to enable`,
                  { biometricOnly: true },
                );
                if (result.success) setBiometricEnabled(true);
              }
            }}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.biometricToggleThumb,
                biometricEnabled
                  ? styles.biometricToggleThumbOn
                  : styles.biometricToggleThumbOff,
              ]}
            />
          </TouchableOpacity>
        </View>
      ) : null}

      <Text
        style={[
          styles.fieldLabel,
          { color: theme.textSecondary, marginTop: 16 },
        ]}
      >
        Default currency
      </Text>
      <TouchableOpacity
        style={[
          styles.currencyRow,
          { borderColor: theme.border, backgroundColor: theme.surfaceSecondary },
        ]}
        onPress={() => setShowCurrencyPicker(true)}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 20 }}>{currencyFlag}</Text>
        <Text style={[styles.currencyLabel, { color: theme.text }]}>
          {currencyCode} — {currencySymbol}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.textTertiary}
        />
      </TouchableOpacity>

      {showCurrencyPicker ? (
        <Modal visible animationType="slide" transparent>
          <Pressable
            style={[styles.currencyOverlay, { backgroundColor: theme.overlay }]}
            onPress={() => setShowCurrencyPicker(false)}
          >
            <Pressable
              style={[
                styles.currencySheet,
                { backgroundColor: theme.surface },
              ]}
              onPress={() => {}}
            >
              <View
                style={[
                  styles.currencySheetHandle,
                  { backgroundColor: theme.textQuaternary },
                ]}
              />
              <Text
                style={[
                  s.sectionTitle,
                  { color: theme.text, textAlign: "center" },
                ]}
              >
                Choose currency
              </Text>
              <ScrollView
                style={{ maxHeight: 400 }}
                showsVerticalScrollIndicator={false}
              >
                {SUPPORTED_CURRENCIES.map((c) => {
                  const selected = c.code === currencyCode;
                  return (
                    <TouchableOpacity
                      key={c.code}
                      style={[
                        styles.currencyOption,
                        selected && { backgroundColor: theme.primaryLight },
                      ]}
                      onPress={() => {
                        setCurrency(c.code as CurrencyCode);
                        setShowCurrencyPicker(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 22 }}>{c.flag}</Text>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          style={[
                            styles.currencyOptName,
                            { color: theme.text },
                          ]}
                        >
                          {c.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontFamily: font.regular,
                            color: theme.textTertiary,
                          }}
                        >
                          {c.code} — {c.symbol}
                        </Text>
                      </View>
                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={theme.text}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 13, fontFamily: font.medium, marginBottom: 8 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
  },
  segmentText: { fontSize: 14 },
  biometricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  biometricToggle: {
    width: 52,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  biometricToggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
  },
  biometricToggleThumbOn: { alignSelf: "flex-end" },
  biometricToggleThumbOff: { alignSelf: "flex-start" },
  currencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  currencyLabel: { flex: 1, fontSize: 15, fontFamily: font.medium },
  currencyOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  currencySheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  currencySheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  currencyOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    marginBottom: 2,
  },
  currencyOptName: { fontSize: 15, fontFamily: font.medium },
});
