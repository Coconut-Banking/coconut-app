import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { useCoconutShell } from "../../lib/coconut-shell";
import { font, radii, space } from "../../lib/theme";
import type { ReceiptUploadErrorCode } from "../../lib/receipt-upload-errors";

type Props = {
  code: ReceiptUploadErrorCode;
  message: string;
  imageUri?: string | null;
  onScanAgain: () => void;
  onPickPhoto: () => void;
  onGoBack: () => void;
};

export function ReceiptUploadFailure({
  code,
  message,
  imageUri,
  onScanAgain,
  onPickPhoto,
  onGoBack,
}: Props) {
  const { theme } = useTheme();
  const shell = useCoconutShell();
  const isNotReceipt = code === "not_a_receipt";

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: shell.card,
            borderColor: shell.cardBorder,
          },
        ]}
      >
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: isNotReceipt ? shell.mintWash : "rgba(121, 12, 0, 0.08)",
            },
          ]}
        >
          <Ionicons
            name={isNotReceipt ? "receipt-outline" : "alert-circle-outline"}
            size={36}
            color={isNotReceipt ? shell.cta : theme.error}
          />
        </View>

        <Text style={[styles.title, { color: theme.text }]}>
          {isNotReceipt ? "No receipt found" : "Couldn't read receipt"}
        </Text>
        <Text style={[styles.message, { color: theme.textSecondary }]}>
          {message}
        </Text>
        {isNotReceipt ? (
          <Text style={[styles.hint, { color: theme.textQuaternary }]}>
            Use a photo of a paper receipt, or an e-receipt / order confirmation with items and a total.
          </Text>
        ) : null}

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
        ) : null}
      </View>

      <Pressable
        style={[styles.primaryBtn, { backgroundColor: shell.cta }]}
        onPress={onScanAgain}
        accessibilityRole="button"
        accessibilityLabel="Scan again"
      >
        <Ionicons name="camera" size={20} color="#fff" />
        <Text style={styles.primaryBtnText}>Scan again</Text>
      </Pressable>

      <Pressable
        style={[styles.secondaryBtn, { borderColor: shell.cardBorder, backgroundColor: shell.card }]}
        onPress={onPickPhoto}
        accessibilityRole="button"
        accessibilityLabel="Choose from library"
      >
        <Ionicons name="images-outline" size={18} color={shell.cta} />
        <Text style={[styles.secondaryBtnText, { color: shell.cta }]}>Choose from library</Text>
      </Pressable>

      <Pressable onPress={onGoBack} style={styles.backLink} accessibilityRole="button">
        <Text style={[styles.backLinkText, { color: theme.textTertiary }]}>Go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: space.lg,
    gap: space.md,
    alignItems: "stretch",
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: space.lg,
    alignItems: "center",
    gap: space.sm,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xs,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 20,
    textAlign: "center",
  },
  message: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 4,
  },
  preview: {
    width: "100%",
    height: 140,
    borderRadius: radii.lg,
    marginTop: space.sm,
    opacity: 0.85,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
  primaryBtnText: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: "#fff",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: font.semibold,
    fontSize: 15,
  },
  backLink: {
    alignItems: "center",
    paddingVertical: space.sm,
  },
  backLinkText: {
    fontFamily: font.medium,
    fontSize: 15,
  },
});
