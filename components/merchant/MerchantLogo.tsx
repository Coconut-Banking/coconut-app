import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { getMerchantLogoUrl } from "../../lib/merchant-logos";
import { colors, font } from "../../lib/theme";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

const CATEGORY_ICONS: Record<string, { icon: IoniconsName; color: string }> = {
  "FOOD_AND_DRINK":      { icon: "restaurant-outline",  color: "#F59E0B" },
  "FOOD AND DRINK":      { icon: "restaurant-outline",  color: "#F59E0B" },
  "COFFEE":              { icon: "cafe-outline",         color: "#92400E" },
  "FAST_FOOD":           { icon: "fast-food-outline",    color: "#F59E0B" },
  "GROCERIES":           { icon: "cart-outline",         color: "#10B981" },
  "SHOPPING":            { icon: "bag-outline",          color: "#8B5CF6" },
  "ENTERTAINMENT":       { icon: "film-outline",         color: "#EC4899" },
  "STREAMING":           { icon: "play-circle-outline",  color: "#EC4899" },
  "TRANSPORTATION":      { icon: "car-outline",          color: "#3B82F6" },
  "TRAVEL":              { icon: "airplane-outline",     color: "#0EA5E9" },
  "HEALTH_AND_FITNESS":  { icon: "fitness-outline",      color: "#EF4444" },
  "HEALTH AND FITNESS":  { icon: "fitness-outline",      color: "#EF4444" },
  "PERSONAL_CARE":       { icon: "heart-outline",        color: "#F472B6" },
  "PERSONAL CARE":       { icon: "heart-outline",        color: "#F472B6" },
  "HOUSEHOLD":           { icon: "home-outline",         color: "#6366F1" },
  "ELECTRONICS":         { icon: "hardware-chip-outline", color: "#6B7280" },
  "GAS":                 { icon: "speedometer-outline",  color: "#F97316" },
  "GAMBLING":            { icon: "dice-outline",         color: "#DC2626" },
  "ALCOHOL":             { icon: "wine-outline",         color: "#7C3AED" },
  "SUBSCRIPTION":        { icon: "refresh-outline",      color: "#6366F1" },
  "TRANSFER":            { icon: "swap-horizontal-outline", color: "#6B7280" },
};

function getInitials(merchantName: string): string | null {
  const src = merchantName?.trim() || "";
  const words = src.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return null;
}

export const MerchantLogo = React.memo(function MerchantLogo({
  merchantName,
  size = 32,
  backgroundColor,
  borderColor,
  style,
  fallbackText,
  logoUrl: externalLogoUrl,
  category,
}: {
  merchantName: string;
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  fallbackText?: string;
  /** Direct logo URL (e.g. from Plaid). Takes priority over Quikrturn lookup. */
  logoUrl?: string | null;
  /** Transaction category (e.g. "FOOD_AND_DRINK") for icon fallback. */
  category?: string | null;
}) {
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    setErrorCount(0);
  }, [merchantName, externalLogoUrl]);

  const logoUrl = useMemo(() => {
    const quikrturnUrl = getMerchantLogoUrl(merchantName, Math.round(size * 1.5));
    if (errorCount === 0 && externalLogoUrl) return externalLogoUrl;
    if (errorCount <= 1 && quikrturnUrl) return quikrturnUrl;
    return null;
  }, [merchantName, size, errorCount, externalLogoUrl]);

  const catInfo = category ? CATEGORY_ICONS[category.toUpperCase()] ?? CATEGORY_ICONS[category] : null;
  const initials = getInitials(merchantName);

  const bg = backgroundColor ?? "rgba(31,35,40,0.08)";
  const ring = borderColor ?? "rgba(31,35,40,0.14)";

  const hasLogo = Boolean(logoUrl);

  return (
    <View style={[s.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: hasLogo ? "transparent" : bg, borderColor: hasLogo ? "transparent" : ring, borderWidth: hasLogo ? 0 : 1 }, style]}>
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={s.logoImg}
          contentFit="contain"
          cachePolicy="disk"
          recyclingKey={logoUrl}
          onError={() => setErrorCount((c) => c + 1)}
        />
      ) : catInfo ? (
        <Ionicons name={catInfo.icon} size={Math.max(12, size * 0.48)} color={catInfo.color} />
      ) : (
        <Text style={[s.initial, { fontSize: Math.max(10, size * 0.34), color: colors.primary }]}>{initials || "$"}</Text>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: {
    width: "100%",
    height: "100%",
  },
  initial: {
    fontFamily: font.extrabold,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
});

