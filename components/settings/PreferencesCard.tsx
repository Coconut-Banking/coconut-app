import { useState, useCallback } from "react";
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

function AppearancePicker({ mode, setMode }: { mode: ThemeMode; setMode: (m: ThemeMode) => void }) {
  const { theme, isDark } = useTheme();

  const effectiveDark = mode === "dark" || (mode === "auto" && isDark);

  const toggleDark = useCallback(() => {
    setMode(effectiveDark ? "light" : "dark");
  }, [effectiveDark, setMode]);

  const toggleSystem = useCallback(() => {
    setMode(mode === "auto" ? (isDark ? "dark" : "light") : "auto");
  }, [mode, isDark, setMode]);

  return (
    <View style={{ gap: 10 }}>
      {/* Dark / Light cards */}
      <TouchableOpacity
        style={[
          styles.modeCard,
          {
            backgroundColor: effectiveDark ? theme.primaryLight : theme.surfaceSecondary,
            borderColor: effectiveDark ? theme.accent : theme.border,
          },
        ]}
        onPress={toggleDark}
        activeOpacity={0.7}
      >
        <View style={[styles.modeIcon, { backgroundColor: effectiveDark ? "rgba(96,165,250,0.15)" : theme.surfaceTertiary }]}>
          <Ionicons name="moon" size={20} color={effectiveDark ? theme.accent : theme.textTertiary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.modeTitle, { color: theme.text }]}>Dark Mode</Text>
          <Text style={[styles.modeSub, { color: theme.textTertiary }]}>
            {effectiveDark ? "Enabled — Easy on the eyes" : "Off"}
          </Text>
        </View>
        <View style={[styles.toggle, { backgroundColor: effectiveDark ? theme.accent : theme.surfaceTertiary, borderColor: effectiveDark ? theme.accent : theme.border }]}>
          <View style={[styles.toggleThumb, effectiveDark ? styles.toggleThumbOn : styles.toggleThumbOff]} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.modeCard,
          {
            backgroundColor: !effectiveDark ? theme.primaryLight : theme.surfaceSecondary,
            borderColor: !effectiveDark ? theme.accent : theme.border,
          },
        ]}
        onPress={() => { if (effectiveDark) setMode("light"); }}
        activeOpacity={effectiveDark ? 0.7 : 1}
      >
        <View style={[styles.modeIcon, { backgroundColor: !effectiveDark ? "rgba(96,165,250,0.15)" : theme.surfaceTertiary }]}>
          <Ionicons name="sunny" size={20} color={!effectiveDark ? theme.accent : theme.textTertiary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.modeTitle, { color: theme.text }]}>Pure White</Text>
          <Text style={[styles.modeSub, { color: theme.textTertiary }]}>Clean & minimal</Text>
        </View>
        {!effectiveDark && (
          <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
        )}
      </TouchableOpacity>

      {/* System follow toggle */}
      <TouchableOpacity
        style={[styles.systemRow, { backgroundColor: theme.surfaceSecondary, borderColor: mode === "auto" ? theme.accent : theme.border }]}
        onPress={toggleSystem}
        activeOpacity={0.7}
      >
        <Ionicons name="phone-portrait-outline" size={16} color={mode === "auto" ? theme.accent : theme.textTertiary} />
        <Text style={[styles.systemLabel, { color: theme.text }]}>Match system</Text>
        <View style={[styles.toggleSm, { backgroundColor: mode === "auto" ? theme.accent : theme.surfaceTertiary, borderColor: mode === "auto" ? theme.accent : theme.border }]}>
          <View style={[styles.toggleSmThumb, mode === "auto" ? styles.toggleThumbOn : styles.toggleThumbOff]} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

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

      <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>
        APPEARANCE
      </Text>
      <AppearancePicker mode={mode} setMode={setMode} />

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
  fieldLabel: { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.8, marginBottom: 10 },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeTitle: { fontSize: 16, fontFamily: font.semibold },
  modeSub: { fontSize: 13, fontFamily: font.regular, marginTop: 2 },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  toggleThumbOn: { alignSelf: "flex-end" },
  toggleThumbOff: { alignSelf: "flex-start" },
  systemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  systemLabel: { flex: 1, fontSize: 14, fontFamily: font.medium },
  toggleSm: {
    width: 44,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleSmThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
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
