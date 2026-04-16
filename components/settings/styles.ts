import { StyleSheet } from "react-native";
import { font, radii, shadow } from "../../lib/theme";

export const settingsStyles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    ...shadow.sm,
    padding: 18,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontFamily: font.semibold, marginBottom: 12 },
  sectionBlurb: { fontSize: 14, fontFamily: font.regular, lineHeight: 20, marginBottom: 12 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: font.semibold },
  disabled: { opacity: 0.6 },
  resultBox: { borderRadius: radii.md, borderWidth: 1, padding: 14, marginBottom: 8 },
  resultTitle: { fontSize: 15, fontFamily: font.semibold },
  resultDetail: { fontSize: 13, fontFamily: font.regular, marginTop: 6, lineHeight: 18 },
  muted: { fontSize: 14, fontFamily: font.regular },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  linkInline: { fontSize: 15, fontFamily: font.medium },
  disconnectBtn: {
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    borderWidth: 1,
  },
  disconnectBtnText: { fontSize: 16, fontFamily: font.semibold },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
});
