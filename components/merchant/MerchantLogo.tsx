import { Image, StyleSheet, Text, View } from "react-native";
import React, { useEffect, useMemo, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { getMerchantLogoUrl } from "../../lib/merchant-logos";
import { colors, font } from "../../lib/theme";

export function MerchantLogo({
  merchantName,
  size = 32,
  backgroundColor,
  borderColor,
  style,
  fallbackText,
  logoUrl: externalLogoUrl,
}: {
  merchantName: string;
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  fallbackText?: string;
  /** Direct logo URL (e.g. from Plaid). Takes priority over Quikrturn lookup. */
  logoUrl?: string | null;
}) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [merchantName, externalLogoUrl]);

  const logoUrl = useMemo(() => {
    if (errored) return null;
    if (externalLogoUrl) return externalLogoUrl;
    return getMerchantLogoUrl(merchantName, Math.round(size * 2.2));
  }, [merchantName, size, errored, externalLogoUrl]);

  const initial = (() => {
    const src = (fallbackText?.trim() || merchantName?.trim() || "");
    const words = src.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return (words[0]?.[0] ?? "").toUpperCase() || null;
  })();

  const bg = backgroundColor ?? "rgba(31,35,40,0.08)";
  const ring = borderColor ?? "rgba(31,35,40,0.14)";

  return (
    <View style={[s.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderColor: ring }, style]}>
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={s.logoImg}
          resizeMode="contain"
          onError={() => setErrored(true)}
        />
      ) : initial ? (
        <Text style={[s.initial, { fontSize: Math.max(10, size * 0.34), color: colors.primary }]}>{initial}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  logoImg: {
    width: "70%",
    height: "70%",
  },
  initial: {
    fontFamily: font.extrabold,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
});

