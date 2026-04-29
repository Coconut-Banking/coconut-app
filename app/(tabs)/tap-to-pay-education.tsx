import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font, radii } from "../../lib/theme";
import { markTapToPayEducationCompleted } from "../../lib/tap-to-pay-onboarding";
import { TapToPayButtonIcon } from "../../components/TapToPayButtonIcon";
import { presentProximityReaderEducation } from "../../lib/proximity-reader-discovery";

/** In-app merchant education (Apple checklist §4). Uses Apple's native ProximityReaderDiscovery. */
export default function TapToPayEducationScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ fromTerms?: string }>();
  const [attempted, setAttempted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios" || attempted) return;
    setAttempted(true);

    presentProximityReaderEducation()
      .then(async () => {
        await markTapToPayEducationCompleted();
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)");
      })
      .catch(async (err) => {
        if (__DEV__) console.warn("[TTPEducation] presentProximityReaderEducation failed:", err?.code, err?.message);
        await markTapToPayEducationCompleted();
        setFailed(true);
      });
  }, [attempted, router]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Tap to Pay guide</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.body}>
        {failed ? (
          <View style={styles.center}>
            <TapToPayButtonIcon color={theme.primary} size={44} />
            <Text style={[styles.title, { color: theme.text }]}>Education complete</Text>
            <Text style={[styles.subtitle, { color: theme.textTertiary }]}>
              {params.fromTerms === "1"
                ? "Terms accepted — you're ready to accept payments."
                : "You're all set to accept contactless payments."}
            </Text>
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: theme.primary }]}
              onPress={goBack}
              activeOpacity={0.9}
            >
              <Text style={styles.ctaText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.subtitle, { color: theme.textTertiary, marginTop: 16 }]}>
              Loading Tap to Pay education…
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: font.semibold },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: font.bold,
    letterSpacing: -0.4,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: font.regular,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: radii.xl,
    marginTop: 16,
  },
  ctaText: { color: "#fff", fontSize: 17, fontFamily: font.semibold },
});
