import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme-context";
import { font, radii } from "../../lib/theme";

const FEATURES = [
  { icon: "card-outline" as const, label: "Unlimited banks" },
  { icon: "phone-portrait-outline" as const, label: "Tap to Pay" },
  { icon: "search-outline" as const, label: "AI search & chat" },
  { icon: "bar-chart-outline" as const, label: "Charts & insights" },
];

const MONTHLY_PRICE = 4.99;
const ANNUAL_MONTHLY = 3.33;
const ANNUAL_TOTAL = 39.99;

export function ProBanner() {
  const { theme, isDark } = useTheme();
  const [plan, setPlan] = useState<"annual" | "monthly">("annual");

  const accentBg = isDark ? "rgba(96, 165, 250, 0.10)" : "rgba(13, 148, 136, 0.06)";
  const accentBorder = isDark ? "rgba(96, 165, 250, 0.25)" : "rgba(13, 148, 136, 0.20)";
  const accent = theme.accent;
  const pillActiveBg = isDark ? "rgba(96, 165, 250, 0.18)" : "rgba(13, 148, 136, 0.12)";
  const pillInactiveBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const handleSubscribe = () => {
    const price = plan === "annual" ? `$${ANNUAL_TOTAL}/year` : `$${MONTHLY_PRICE}/month`;
    Alert.alert("Coming soon", `Coconut Pro (${price}) will be available soon.`);
  };

  return (
    <View style={[styles.container, { backgroundColor: accentBg, borderColor: accentBorder }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: accent }]}>
          <Ionicons name="diamond" size={10} color="#fff" />
          <Text style={styles.badgeText}>PRO</Text>
        </View>
        <Text style={[styles.headline, { color: theme.text }]}>Unlock the full experience</Text>
      </View>

      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.featureRow}>
            <Ionicons name={f.icon} size={14} color={accent} />
            <Text style={[styles.featureLabel, { color: theme.textSecondary }]}>{f.label}</Text>
          </View>
        ))}
      </View>

      {/* Plan toggle */}
      <View style={[styles.planToggle, { backgroundColor: pillInactiveBg }]}>
        <TouchableOpacity
          style={[styles.planPill, plan === "annual" && { backgroundColor: pillActiveBg }]}
          onPress={() => setPlan("annual")}
          activeOpacity={0.8}
        >
          <Text style={[styles.planText, { color: plan === "annual" ? accent : theme.textTertiary }]}>
            Annual
          </Text>
          {plan === "annual" ? (
            <View style={[styles.saveBadge, { backgroundColor: accent }]}>
              <Text style={styles.saveText}>-33%</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.planPill, plan === "monthly" && { backgroundColor: pillActiveBg }]}
          onPress={() => setPlan("monthly")}
          activeOpacity={0.8}
        >
          <Text style={[styles.planText, { color: plan === "monthly" ? accent : theme.textTertiary }]}>
            Monthly
          </Text>
        </TouchableOpacity>
      </View>

      {/* Price + CTA row */}
      <View style={styles.bottom}>
        <View>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: theme.text }]}>
              ${plan === "annual" ? ANNUAL_MONTHLY.toFixed(2) : MONTHLY_PRICE.toFixed(2)}
            </Text>
            <Text style={[styles.pricePer, { color: theme.textTertiary }]}>/mo</Text>
          </View>
          {plan === "annual" ? (
            <Text style={[styles.priceNote, { color: theme.textQuaternary }]}>
              ${ANNUAL_TOTAL}/year
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: accent }]}
          onPress={handleSubscribe}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: font.bold,
    letterSpacing: 1,
  },
  headline: {
    fontSize: 16,
    fontFamily: font.semibold,
  },
  features: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
    rowGap: 6,
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "46%",
  },
  featureLabel: {
    fontSize: 13,
    fontFamily: font.medium,
  },
  planToggle: {
    flexDirection: "row",
    borderRadius: radii.sm,
    padding: 2,
    marginBottom: 14,
  },
  planPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: radii.sm - 1,
  },
  planText: {
    fontSize: 14,
    fontFamily: font.semibold,
  },
  saveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  saveText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: font.bold,
  },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  price: {
    fontSize: 24,
    fontFamily: font.bold,
  },
  pricePer: {
    fontSize: 14,
    fontFamily: font.regular,
    marginLeft: 1,
  },
  priceNote: {
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 1,
  },
  cta: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: radii.md,
  },
  ctaText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: font.semibold,
  },
});
